// merge-stack.yml が head の CI を判定するための純粋関数。
// github-script から require する。ロジックを workflow の外に出したのは、手元で node --test にかけるため。
'use strict';

/**
 * 同じ head に push 由来と pull_request 由来の同名ジョブが付く。名前だけで最新を取ると、
 * 古い方の failure を新しい方の success が隠す。そのため (名前, event) ごとに最新の実行を取り、
 * 全部の event で成功していることを求める。
 *
 * @param {object} p
 * @param {Array<{name:string,status:string,conclusion:string|null,started_at?:string|null,event?:string}>} p.runs
 *   check run。event は workflow run から引いた起動元（分からなければ未指定）
 * @param {string[]} p.required 必ず成功していなければならないジョブ名
 * @param {string} p.selfJob 判定から外す自分自身のジョブ名
 * @param {number} p.prNumber メッセージ用
 * @returns {string[]} 問題の一覧（空なら通る）
 */
function evaluateChecks({ runs, required, selfJob, prNumber }) {
  const problems = [];
  const groups = new Map(); // name -> event -> runs[]
  for (const r of runs) {
    if (r.name === selfJob) continue;
    const byEvent = groups.get(r.name) ?? new Map();
    const ev = r.event ?? 'unknown';
    byEvent.set(ev, [...(byEvent.get(ev) ?? []), r]);
    groups.set(r.name, byEvent);
  }
  const newest = (list) =>
    list.reduce((a, b) => ((a.started_at ?? '') >= (b.started_at ?? '') ? a : b));

  for (const name of required) {
    const byEvent = groups.get(name);
    const ran = byEvent && [...byEvent.values()].some((l) => l.some((r) => r.conclusion !== 'skipped'));
    if (!ran) problems.push(`#${prNumber}: 必須の \`${name}\` が head で走っていない`);
  }

  for (const [name, byEvent] of groups) {
    const isRequired = required.includes(name);
    const ok = isRequired ? ['success'] : ['success', 'neutral', 'skipped'];
    for (const [ev, list] of byEvent) {
      // 必須ジョブで、その event では条件により skipped になるもの（commit-messages は pull_request でだけ走る）は数えない
      const live = list.filter((r) => r.conclusion !== 'skipped');
      if (isRequired && live.length === 0) continue;
      const r = newest(live.length ? live : list);
      const label = `\`${name}\`（${ev}）`;
      if (r.status !== 'completed') problems.push(`#${prNumber}: ${label} が終わっていない（${r.status}）`);
      else if (!ok.includes(r.conclusion)) problems.push(`#${prNumber}: ${label} が ${r.conclusion}`);
    }
  }
  return problems;
}

/**
 * 判定した時点と、マージ直前の各 PR の head を比べる。
 * merge-async の sha で固定できるのは一番上だけなので、下の PR は直前に取り直して照合する。
 * @param {Array<{number:number,head:{sha:string}}>} checked
 * @param {Array<{number:number,head:{sha:string}}>} current
 * @returns {string[]}
 */
function movedHeads(checked, current) {
  const now = new Map(current.map((p) => [p.number, p.head.sha]));
  const out = [];
  for (const p of checked) {
    const sha = now.get(p.number);
    if (sha !== p.head.sha) out.push(`#${p.number}: ${p.head.sha.slice(0, 7)} → ${sha ? sha.slice(0, 7) : '（スタックから消えた）'}`);
  }
  return out;
}

module.exports = { evaluateChecks, movedHeads };
