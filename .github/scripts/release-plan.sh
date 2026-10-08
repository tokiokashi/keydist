#!/usr/bin/env bash
# main への push がリリース（リリースPRのマージ）かを判定し、公開するコミットを決める。release.yml が呼ぶ。
#
# 使い方: release-plan.sh <before> <sha>
#   before: push 前の main の先端（github.event.before）。空・全0・手元に無い時は <sha> の first parent を使う
#   sha:    push 後の main の先端（github.sha）
# 環境変数:
#   GITHUB_REPOSITORY  owner/repo
#   GH_TOKEN           PR の検索に使う（pull-requests: read があればよい）
#   GITHUB_API_URL     省略時 https://api.github.com
#
# 判定:
# - package.json の version が before → sha で変わっていなければリリースではない（publish=false）
# - 変わっていれば、sha を作ったマージの PR を探す。タイトルが `chore(release): X.Y.Z` で、
#   X.Y.Z が新しい version と一致する PR だけをリリースと認める。それ以外で version が変わったら失敗させる
# - 公開するのはマージコミットではなく、**リリースPRの head コミット**。
#   リリースPRを作った時点の main の状態に固定し、マージまでの間に main へ入った別の作業を公開物に混ぜないため
# - タグ v<X.Y.Z> が既にあり、同じコミットを指していれば打たずに公開だけする（再実行の冪等性）。
#   別のコミットを指していれば失敗させる。同じ版番号で中身の違う公開を作らない
# - リリースPRは main から分かれた後の1コミットだけで、package.json と package-lock.json のversionしか変えないこと
#   （versionの位置はrelease-version-only.cjsが解析したJSONで確かめる。依存関係やscriptsの変更は公開しない）
# - version を変えたのが push の先頭以外のコミットなら、そのコミットと PR を名指しして失敗させる
# - version が下がった場合は公開しない（警告だけ）。初回リリースの準備で 0.0.0 に戻した時がこれにあたる
#
# first parent ではなく before と比べるのは、1回の push に複数コミットが載る場合に
# 途中のコミットで上げた version を取りこぼさないため。
#
# 結果は GITHUB_OUTPUT 形式（key=value）で標準出力へ書く。説明は標準エラーへ書く。
set -euo pipefail

before="${1:-}"
sha=$(git rev-parse "$2^{commit}")
api="${GITHUB_API_URL:-https://api.github.com}"

version_at() {
  git show "$1:package.json" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => process.stdout.write(JSON.parse(s).version ?? ""));
  '
}

# X.Y.Z 同士を比べる。$1 > $2 なら 0 を返す
version_gt() {
  node -e '
    const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number));
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) process.exit(a[i] > b[i] ? 0 : 1);
    }
    process.exit(1);
  ' "$1" "$2"
}

fail() {
  echo "::error::$1" >&2
  exit 1
}

no_release() {
  echo "$1" >&2
  echo "publish=false"
  exit 0
}

base=""
if [ -n "$before" ] && [ "$before" != 0000000000000000000000000000000000000000 ] \
  && git cat-file -e "$before^{commit}" 2>/dev/null; then
  base="$before"
elif git rev-parse -q --verify "$sha^1" >/dev/null; then
  base="$sha^1"
fi
[ -n "$base" ] || no_release "比較対象のコミットが無い。リリースしない"

new=$(version_at "$sha")
old=$(version_at "$base")
[ "$new" != "$old" ] || no_release "version は $new のまま。リリースしない"

[[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "package.json の version '$new' が X.Y.Z 形式ではない"

if ! version_gt "$new" "$old"; then
  echo "::warning::version が $old → $new に下がった。公開しない" >&2
  echo "publish=false"
  exit 0
fi

# commit をマージコミットとする PR を探し、「番号 TAB head TAB base TAB タイトル」を返す。見つからなければ空
lookup_pr() {
  local prs
  prs=$(curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$api/repos/$GITHUB_REPOSITORY/commits/$1/pulls") \
    || fail "PR の検索（commits/$1/pulls）に失敗した。一時的なものなら Re-run で直る"
  printf '%s' "$prs" | SHA="$1" node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      const hits = JSON.parse(s).filter((p) => p.merged_at && p.merge_commit_sha === process.env.SHA);
      if (hits.length === 1) {
        const p = hits[0];
        process.stdout.write([p.number, p.head.sha, p.base.ref, p.title].join("\t"));
      }
    });
  '
}

# version を変えたのは push の範囲のどのコミットか。main の first parent を新しい方から辿る
changer=""
for c in $(git rev-list --first-parent "$base..$sha"); do
  if git rev-parse -q --verify "$c^1" >/dev/null && [ "$(version_at "$c")" != "$(version_at "$c^1")" ]; then
    changer="$c"
    break
  fi
done
[ -n "$changer" ] || fail "version が $old → $new に変わったが、変えたコミットを main の first parent 上に見つけられない"

if [ "$changer" != "$sha" ]; then
  culprit=$(lookup_pr "$changer")
  if [ -n "$culprit" ]; then
    IFS=$'\t' read -r c_number _ _ c_title <<<"$culprit"
    fail "version を変えたのは PR #$c_number（'$c_title'、$changer）で、push の先頭 $sha ではない。リリースPRは単独でマージする。version はリリースPRでだけ上げる"
  fi
  fail "version を変えたのは $changer で、push の先頭 $sha ではない（PR は見つからない）。version はリリースPRでだけ上げる"
fi

pr=$(lookup_pr "$sha")
[ -n "$pr" ] || fail "version が $old → $new に変わったが、$sha をマージコミットとする PR が見つからない。version はリリースPR（merge commit でマージ）でだけ上げる。API の反映遅れなら Re-run で直る"

IFS=$'\t' read -r pr_number head base_ref title <<<"$pr"
[ "$title" = "chore(release): $new" ] \
  || fail "version を $new に上げた PR #$pr_number のタイトルが 'chore(release): $new' ではない（'$title'）。リリースPR以外で version を上げない"
[ "$base_ref" = main ] || fail "リリースPR #$pr_number の base が main ではない（$base_ref）"

git cat-file -e "$head^{commit}" 2>/dev/null || fail "リリースPR #$pr_number の head $head が手元に無い"
git merge-base --is-ancestor "$head" "$sha" || fail "リリースPR #$pr_number の head $head が main（$sha）から辿れない"
head_version=$(version_at "$head")
[ "$head_version" = "$new" ] || fail "リリースPR #$pr_number の head の version が $head_version で、$new ではない"

# リリースPRは version を上げる1コミットだけ。公開物がPRの差分から読めるようにする
fork=$(git merge-base "$head" "$sha^1")
count=$(git rev-list --count "$fork..$head")
[ "$count" = 1 ] || fail "リリースPR #$pr_number のコミットが $count 個ある。version を上げる1コミットだけにする"
extra=$(git diff --name-only "$fork" "$head" | grep -vxE 'package\.json|package-lock\.json' || true)
[ -z "$extra" ] || fail "リリースPR #$pr_number が package.json / package-lock.json 以外を変えている: $(echo "$extra" | tr '\n' ' ')"

if ! violations=$(node "$(dirname "$0")/release-version-only.cjs" "$fork" "$head" "$new"); then
  fail "リリースPR #$pr_number がversion以外を変えている: $(echo "$violations" | tr '\n' ' ')"
fi

tag="v$new"
create_tag=true
if existing=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
  [ "$existing" = "$head" ] || fail "タグ $tag は既に別のコミット $existing を指している。同じ版番号で別の中身は公開しない"
  create_tag=false
  echo "version $old → $new（PR #$pr_number）。タグ $tag は既に $head にある。公開だけする" >&2
else
  echo "version $old → $new（PR #$pr_number）。$head に $tag を打って公開する" >&2
fi

echo "publish=true"
echo "version=$new"
echo "tag=$tag"
echo "commit=$head"
echo "pr=$pr_number"
echo "create_tag=$create_tag"
