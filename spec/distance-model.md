# キーボード配列指移動距離モデル仕様

<!-- 2026-09-13の議論で決めた仕様。
     先行するideas/research/keyboard-layout-cost-model.md（DP + 時間/疲労の2軸）は
     結論が良くなかったため破棄。本ファイルが現行の仕様。 -->

## 1. 目的

配列の性質を数値化する。実際のタイピングの再現ではない。

数値の導出は2手で追える範囲に留める。忠実度を上げる変更であっても、
導出の追跡可能性を下げるものは入れない。出た数値に疑問が生じた時、
定義まで遡れることを優先する。

## 2. 仮定

1. **指は互いに独立して動く。** 手全体の連動・指同士の干渉は扱わない
2. 各キーは1本の指に固定的に割り当てられる
3. 距離はキー平面上の2次元ユークリッド距離
4. 打鍵直後、指は必ずそのキー上にある
5. 親指も他の指と同様にホームを持つ。親指キーが片手に1つだけの形状では、
   ホームはそのキー自身になる（§3.1）

仮定1はモデルの定義であって近似ではない。実際の手では人差し指を伸ばせば
他の指も引きずられるが、数値評価のため省く。指同士の距離は指間距離の平均と裾（実測最大値等）で評価する。

## 3. 座標系

単位はu（キーピッチ1個分）。実距離が必要なら物理形状が持つ `pitch_mm` を掛ける。

物理形状（`PhysicalShape`）はピッチ・各段のキー数・段ずれ量・列オフセット・
親指キーの数と位置をまとめて持つ。**形状を変えると距離の絶対値が変わる。**
どの形状で測ったかは数値に付随する情報であり、出力には必ず併記する（§12.3）。

既定で3つの形状を用意する。数値はこれまでの固定実装と変えていない。

| 形状 | 段ずれ（xオフセット） | 列オフセット（y） | ピッチ |
|---|---|---|---|
| row-staggered | 各段 `[0, 0.5, 0.75, 1.25]` | なし | 19.05mm |
| ortholinear | なし | なし | 19.05mm |
| column-staggered | なし（列5以降に分割の間隔をxに加える） | 各列 `[0.34, 0.12, 0, 0.1, 0.3, 0.3, 0.1, 0, 0.12, 0.34]` | 18mm |

各段のキー数（段の数を含む）も形状定義が持つ。既定形状はANSIの英数部に合わせて
12 / 12 / 11 / 10とする。

指 `f` のホーム位置を `H_f` と書く。

### 3.1親指

親指キーの数と位置は物理形状が持つ。各手に1個以上のキーを置き、そのうち1つを
ホームに指定する（複数ある場合は明示が必要。1個しかない手は自動でそれがホームになる）。

親指も他の指と同じ規則（§7〜§9）に従う。**親指キーが片手に1つだけの形状では
ホーム＝そのキー自身になるため、親指の移動距離は常に0** になる（これまでの既定形状は
すべてこの形）。片手に複数の親指キーを置く形状では、ホームとそれ以外のキーの間の
移動が他の指と同様に計上される。

親指を扱う目的の一つは距離ではなく `g` のカウントである。
空白やセンターシフトを打鍵列から落とすと、それらを挟んだ他の指の `g` が実際より小さくなり、
単語や文節をまたぐ運指が実際より繋がって見える。

### 3.2利用者が設定する形状と運指

画面の「打ち手と機材」パネルの設定モーダルでは、既定形状を選んだうえで次の値を利用者が変更できる。

- ピッチ、段ごとのxオフセット、列ごとのyオフセット、分割間隔
- 左右の親指キーの列位置とy座標
- 列単位の指割り当てと、列から外れるキー単位の上書き

段ずれ・列オフセット・親指位置・分割間隔は、UIでmmとuを切り替えて入力する。内部の正準値はuであり、
mm表示は現在のピッチで変換する。形状は `shape-{識別子}` の名前付きカスタム形状として複数保存でき、
組み込み形状や保存済み形状を複製して「名前を付けて保存」する。設定は画面状態の
`conditions.geometrySettings` に保存し、JSONの設定ファイル（version 1）にも同じ形で含める。
読み込み時は形状を構築できる値だけを受け入れ、不正な値は既定値へ戻す。

運指設定のホームキーは物理形状ではなく配列（`Layout.homeKeys`）に属する。配列が指定したキーを使い、
省略時は物理形状側の既定運指のホームキーへフォールバックする。これにより配列を切り替えても、
配列固有のホーム段を自動的に維持できる。

## 4. 配列定義

論理配列は **文字 → 打鍵ステップ列** の写像として書く。

```
Sequence = Step[]      順次打鍵。前から順に打つ
Step     = KeyId[]     同時に押すキーの集合
```

配列定義は省略可能な `homeKeys`（非親指の指から物理キーidへの写像）も持てる。省略時は物理形状側の既定値を使う。

キーは **QWERTY刻印**で指す（`d`、`;`、`-`、および親指キーの `thumb-l` / `thumb-r`）。
旧来の `space` は入力互換のエイリアスとして受け付け、内部では `thumb-r` に解決する。
行列インデックスより読めるうえ、公開されているかな配列の定義をそのまま写せる。

ステップの列であることが順次性を、ステップが集合であることが同時性を表す。
この1つの形で単打・同時押し・前置シフト・後置シフト・レイヤーがすべて書ける。

配列定義はこの写像を直接書くほか、**面**から展開してもよい。面は次の形を持つ。

```
Face = {
  trigger: KeyId[],
  mode: "prefix" | "suffix" | "simultaneous",
  rows: FaceRow[],
  layer?: string,
  role?: "layer" | "modifier",
}
FaceRow = string | string[]
```

配列が特定の親指キーをシフトトリガーとして使い、運指設定でそのキーを左右に
振り分けられる場合は、`thumb_shift_key?: KeyId` を持たせる。省略時は親指シフトの
自動振り分けを行わず、`Sequence` に書かれたキーをそのまま使う。

`rows` はQWERTYの4行に対応する。文字列の行は1文字ずつセルに分け、配列の行は
セルごとの見出しを置く。後者を使えば `きゃ` のような複数文字の見出しも1セルに置ける。
セルの位置にあるキーを `k` とすると、面は次の `Sequence` に展開する。

```
trigger = []          → [[k]]
mode = simultaneous   → [[...trigger, k]]
mode = prefix         → [[...trigger], [k]]
mode = suffix         → [[k], [...trigger]]
```

`trigger` はキーの集合として扱うため、同時押しの順序は意味を持たない。面を展開した後の
評価器は、直接書いた定義と同じ `Sequence` だけを受け取る。したがって面の導入は、既存の
距離モデルやステップの数え方を変えない。

`layer` を宣言した単一キー面は、同じ値の面を1つの層として扱う。`layer` を省略した面は
 その面だけで1つの層になる。`role` が `modifier` の面も、打鍵の帰属では同じ規則に従うが、
 盤面の置き換え図とは別の修飾面として表示してよい。triggerが2キー以上の面は層ではなく
 1つのコンボ枠に分類する。

面から `Sequence` へ展開しても、各ステップがどの面から出たかは保持する。面の出力を別の
出力と合成する場合も、元の各ステップの帰属をそのまま連結する。

```json
"が": [["thumb-r", "r2c1"]]   同時押し（押しっぱなしの修飾も同じ）
"が": [["shift"], ["r2c1"]]   前置シフト
"が": [["r2c1"], ["shift"]]   後置シフト
```

### 4.1同時押しは1ステップとして数える

`g` はステップ単位で数える。同時押しの中では時間が経過しないため。

同時押しステップの距離は、**ステップ内の各指の移動距離の単純和**とする。
仮定1（指は独立して動く）を置いている以上、和以外の合成は定義できない。

同時押しと順次打鍵の差は**ステップ数**に現れる。押下するキーと移動距離は同じで、
まとめて打つか順に打つかだけが違うため、一次的な差は距離ではなくステップ数に出る。
順次打鍵はステップが増える分だけ他の指の `g` を伸ばすので、距離にも二次的に効く。

### 4.2 1本の指が複数キーを押す場合は重心を目標位置にする

1つのステップの中で同じ指が複数のキーを担当する場合、その指はキーの間を押す。
目標位置は担当キーの**重心**とし、距離は `d(前の位置, 重心)` で求める。
押下後、その指は重心に留まる。

代替の指を自動で探すことはしない。探索を入れると、
配列の性質ではなく代替アルゴリズムの性質を測ることになる。運指は配列定義の一部である。

割り当てを変えると同指連続の数も距離も変わる。どの割り当てで測ったかも形状と同じく
数値に付随する情報であり、出力に併記する（§12.3）。

ただし、`thumb_shift_key` を持つ配列で `prefer_opposite_thumb` を有効にした場合は、
シフトトリガーと同時に押す出力キーが片手だけに属するステップに限り、出力キーと反対側の
親指キーへシフトトリガーを振り替える。出力キーが両手にまたがる場合や、出力キーが無い
場合は、配列定義のシフトキーを使う。これは任意の指を探索する機能ではなく、配列が指定
した2本の親指の選択だけを切り替える設定である。

同じ親指キーを使う同時押しシフトが連続する場合は、同じキーを同じ親指で続けて打つため、
既存の `g = 0` の規則によってその親指が残った状態として計算される。連続シフト用の
別の保持設定は設けない。出力側の手が変われば、反対側の親指を優先する設定に従って
親指キーも切り替わる。

### 4.3見出しは最長一致で切り出す

配列の見出しは複数文字でもよい（`きゃ`）。入力テキストからの切り出しは最長一致で行う。

`きゃ` を見出しに持つ配列では1単位として当たり、持たない配列では `き` `ゃ` に分解される。
どちらで打つかは配列定義が決めることであり、評価器は選択しない。

ローマ字配列にコンボを持つ場合も、かなからローマ字へ展開した各見出しの境界を評価時に
保持する。どのコンボを使うかは配列定義が決めることであり、評価器は見出しの綴りから
独自の発火規則を選択しない。コンボ定義が発火条件を持つ場合だけ、評価器はその条件に従う。

現時点で `youonOnly` 条件を持つのはTK音直入力法のコンボのヤ行19件である。この条件を持つコンボは、
拗音の見出しのローマ字塊の途中で、直前の文字が子音になる場合だけ発火する。単独の `や` `ゆ`
`よ` などの `ya` `yu` `yo` はコンボで丸ごと置き換えず、`y` と母音へ分ける。条件を持たない
コンボは、かなの境界をまたぐ場合も従来どおり最長一致で切り出す。

### 4.4ローマ字テーブルは配列と分けて持つ

ローマ字入力を評価する場合、**かな → ローマ字**のテーブルと**英字 → キー**の配列を
分けて定義し、合成して `かな → ステップ列` を作る。

```
テーブル（共通）:  し → "si"
英字配列（可変）:  s → sキー,  i → iキー
合成:              し → [["s"], ["i"]]
```

テーブルを配列定義の中に直接書くと、英字配列を比較するたびに同じテーブルを重複して
書くことになり、テーブルの記述差が配列の差に混入する。テーブルは1つ、配列は複数。
利用者が作るテーブルは、標準・訓令式・大西式・AZIKのいずれかを基底にし、かな → 綴りの
差分を上書きして定義できる。複数かなの見出しも許し、切り出しは最長一致とする。

促音の自動生成はテーブルの属性である。オンなら、子音で始まるかな `か → ka` から
`っか → kka` のような見出しを生成する。オフなら自動生成せず、テーブルに明示した
`っ` や複数かなの見出しだけを使う。AZIKのように促音を1打へ割り当てるテーブルは
オフにする。
設定欄から入力した綴りは評価時の英字キー表記に合わせて小文字へ正規化する。

かな配列はテーブルを通さず `かな → ステップ列` を直接書く。
どちらも最終形は同じステップ列なので、評価器は両者を区別しない。

---

## 5. パラメータ

| 名前 | 型 | 既定 | 内容 |
|---|---|---|---|
| `N` | int | — | 窓幅（打鍵単位）。この打鍵数までは指を残す候補とホーム復帰候補を比較する。打ち手ごとに異なるため利用者が設定する |
| `sfb_home_cost` | bool | `true` | 同指連続でホームキーを打つ場合に距離を加算するか（§8） |
| `prefer_opposite_thumb` | bool | `false` | `thumb_shift_key` を持つ配列で、シフト出力キーと反対側の親指を優先するか |

## 6. 状態

| 変数 | 内容 | 初期値 |
|---|---|---|
| `prev[f]` | 指 `f` が最後に打ったキー | `H_f` |
| `last[f]` | 指 `f` が最後に打った打鍵の通し番号 | `-∞` |

## 7. ホーム復帰ルール

**R1. 打鍵直後、指はそのキー上にある。**

**R2. ホームへの復帰移動は距離に計上しない。**
復帰は他の指が打鍵している裏で並行して起きるため、能動的な移動として数えない。

**R3. 間隔 `g` が `N` を超えたら、復帰は完了している。**

打鍵 `i` でキー `k` を指 `f` が打つとき、間隔は

```
g = i - last[f] - 1        # 間に挟まった他の打鍵数
```

`g` は**全打鍵**を数える。その指の打鍵だけを数えるのではない。
他の指が動いている時間が復帰の余裕になるため。単位は打鍵であり、文字ではない。

**R4. 窓の内側では、残った場合と戻った場合の両方を候補とし、小さい方を採る。**

同値の場合は「残った場合」を採る。これは移動距離を変えないが、指間距離の
スナップショットでどちらの位置を採るかを決めるためである。

**R5. 指間距離では、実際に採用した候補だけを残留として扱う。**

`1 ≤ g ≤ N` で `d_stay ≤ d_home` なら、次の同指打鍵までの区間を前回キーに
残ったものとする。それ以外（`d_home < d_stay` または `g > N`）はホームに戻った
ものとする。`N` は指を常に残す時間ではなく、次の同指打鍵に対して候補を比較する
先読み範囲である。次の同指打鍵がまだ現れていない時点では、指間距離の計算上は
ホームを既定とし、後続の打鍵で「残す」が選ばれた区間だけ前回キー位置に補正する。

## 8. 同指連続ルール

`g = 0`（間に他の打鍵が挟まらない）のとき、ホームへ戻る時間が物理的に存在しない。
このとき候補は「残った場合」のみとなる。

打鍵先がその指のホームキー自身（`k == H_f`）であっても同様に適用する。
`h` を打った直後に `j` を打つ場合、指は `h` から `j` へ1u移動しており、
これを0として扱わない。

**この扱いには異論がありうるため `sfb_home_cost` で切り替える。**

| `sfb_home_cost` | `g = 0` かつ `k == H_f` のとき |
|---|---|
| `true`（既定） | `d = dist(prev[f], k)` を加算する |
| `false` | `d = 0`。ホームキーへの復帰打鍵は移動として数えない |

このフラグが結果を変えるのは `g = 0` かつ `k == H_f` の場合のみ。
他のすべてのケースでは挙動が一致する。

## 9. 距離の計算

2つの候補距離を

```
d_stay = dist(prev[f], k)      # 前のキーに残っていた場合
d_home = dist(H_f,     k)      # ホームに戻っていた場合
```

として、`g` で候補集合を決めて最小値を採る。

| `g` | 候補 | 採用 |
|---|---|---|
| `0` | `{d_stay}` | `d_stay` |
| `1 ≤ g ≤ N` | `{d_stay, d_home}` | `min(d_stay, d_home)`（同値は `d_stay`） |
| `g > N` | `{d_home}` | `d_home` |

打鍵後、`prev[f] = k`、`last[f] = i` を更新する。

```python
def cost(i, k, f):
    g = i - last[f] - 1
    d_stay = dist(prev[f], k)
    d_home = dist(H[f], k)

    if g == 0:
        if not sfb_home_cost and k == H[f]:
            d = 0.0
        else:
            d = d_stay
    elif g <= N:
        d = min(d_stay, d_home)
    else:
        d = d_home

    prev[f], last[f] = k, i
    return d
```

## 10. 任意時点の指位置

打鍵 `i` の押下直後における指 `f` の位置は、次のように定める。

- `i` で `f` が押した場合は、その目標位置 `k`。
- `f` が `j` で押した後、次に `k` で押すまでの途中では、§7 R5で「残す」が
  採用された場合だけ `j` の目標位置。
- それ以外はホーム `H_f`。

```
position(f, i) = target(f, i)                  if f is pressed at i
                 prev[f]                       if the next use selects stay
                 H_f                            otherwise
```

### 10.0 Trigger realization

canonical Faceの `TriggerPersistence='hold-capable'` は「保持できる」というcapabilityであり、
base semantic normalizationだけでは `held-trigger` を生成しない。
評価条件 `TriggerRealizationPolicy` が保持利用を有効にした時だけ、正規化後のStroke列を
realized Stroke streamへ変換してから構造解析へ渡す。

初期Policy:

```ts
type TriggerRealizationPolicy = {
  useHold: boolean; // default false
};
```

保持を使う場合、各stepへsemantic normalizationが付与した `associatedTriggerKeys` と、そのassociationの `TriggerPersistence` を連続判定に使う。active holdのtrigger集合と `associatedTriggerKeys` が完全一致し、かつそのassociationが `hold-capable` の連続対象だけを同じhold区間とする。layer idは継続条件に使わない。

```text
区間先頭
  trigger + held-trigger/start

区間継続
  held-trigger/continue
  （triggerは物理的に再押下しない）
```

- `single` triggerをholdへ昇格しない
- composition等の `InputRole` だけからholdを推測しない
- trigger集合の部分一致を同一holdとして扱わない
- prefix / suffix のoutput stepにも、その対象Faceのtrigger集合を `associatedTriggerKeys`、持続能力を `associatedTriggerPersistence` として保持する
- active holdとassociationが一致しない、またはassociationが `single` のstep直前でholdを終了する。triggerを持たない通常outputもrelease境界になる
- continueでは保持中triggerを `Press` として再生成しない
- 保持中triggerキー自身がoutputでもあるstepは、保持継続のまま同じキーを再押下できないためholdをrelease/restartし、新規 `trigger + held-trigger/start` としてrealizeする
- 保持中のキー位置は指位置snapshotには残す
- 明示release専用Stroke / Press / Release eventはこの初期実装では導入しない
- 後段のChain / Transition / Roll / Timingはrealized Stroke streamだけを読み、
  独自にhold可能性を再判定しない

既定 `useHold=false` は従来評価と互換にする。
Policyは数値へ影響するため `conditions.defaults` / `conditions.perLayout` に置き、
Metrics / structural aggregationのcondition snapshotにも実効値を保存する。

### 10.1 構造解析用のRaw hand runとAnalysis Chain

打鍵列の構造解析では、正規化済みStrokeからいきなりChain境界を決めない。
まず各Strokeの `StrokeParticipation` を手ごとに投影し、連続してその手が参加した区間を
**Raw hand run** として作る。この段階で保持するのは参加factだけで、同指・trigger・親指・
逆手同時入力を理由に区切る判断はしない。

Raw hand runへ **ChainPolicy** を適用した結果が **Analysis Chain** である。
現時点でPolicyが持つ境界条件は次の3つ。

- `breakOnSameFinger`: 同指移動Strokeを境界にする。既定 `true`（従来の
  `chainIncludeSameFinger=false` と同じ）
- `breakOnTriggerOnly`: 新規triggerだけでoutputを持たないStrokeを境界にする。
  既定 `false`（従来の `chainIncludeLayerKeys=true` と同じ）
- `breakOnThumbOnly`: 対象手の参加指がすべて親指のStrokeを境界にする。
  既定 `true`。旧playbackで親指だけのstepがChain参加から落ちていた挙動を維持する
- `breakOnOppositeHandSimultaneous`: 同じStrokeに逆手のoutputがある場合を境界にする。
  既定 `false`

親指onlyはtrigger-onlyとは独立した条件として扱う。Raw hand run側の
`thumbOnly` / `thumbTriggerOnly` factは保持し、Policy適用前の事実を失わない。
TriggerPersistenceは「hold可能か」という能力なので、実際のhold利用やChain境界の推測には使わない。

Analysis結果はStrokeを複製せず、1回の結果内で安定する `StrokeIndex` と
`chainIndex` で参照する。永続的なstable IDは作らない。後段のRoll / Redirect /
Arpeggio等の構造要素はAnalysis Chain境界を越えてはならない。

ChainPolicyは測定条件の一部として `conditions.defaults` / `conditions.perLayout` で
配列ごとに解決し、`Metrics.conditions` のsnapshotにも保存する（§12.3）。
旧 `ui.playback.chainIncludeSameFinger` / `chainIncludeLayerKeys` は移行期間の互換入口として
残すが、意味が一意に対応する項目だけをadapterでChainPolicyへ変換する。

### 10.2 Transition facts

Analysis Chain内では、同じ手が参加する隣接Stroke `Stroke[i] -> Stroke[i+1]` ごとに
**HandTransition** を1件作る。各Strokeに対象手のPressが複数ある場合は、
前StrokeのPress × 後StrokeのPressの直積を **FingerTransition** としてすべて保持し、
代表1候補へ潰さない。

各FingerTransitionは元StrokeのPress / Participation indexとKey参照を持ち、
次のfactだけを保持する。

- from / to finger
- `fingerDirection = inward | outward | same`
- `fingerStep`
- Press target間の `dx / dy`

finger rankは左右とも `pinky -> ring -> middle -> index -> thumb` とし、
rankが増える方向をinward、減る方向をoutwardとする。したがって右手では
物理x座標の符号とfingerDirectionが逆になる場合がある。飛び指や親指もfactから除外しない。

この層ではRoll / Redirect / Arpeggio可否、距離閾値、速度、Calibrationを判断しない。
`dx / dy` や `fingerStep` は後段が参照できる品質factであり、candidate削減条件ではない。

同一fingerのcandidate（`fingerDirection='same'`）を1つ以上含むHandTransitionは
構造上のSFB eventとして取得できる。SFBのevent数はTransition数で数え、coverageは
そのeventの両端Stroke indexのunionで数える。1 Transitionにsame candidateが複数あっても
event自体を重複させない。

### 10.3 RedirectEvent / RedirectCandidate

同一Analysis Chain内の3 Stroke windowは、隣接する2 HandTransitionとして扱う。
before / after TransitionのFingerTransition候補を接続し、inward → outward または
outward → inwardへ反転する実在pathを **RedirectCandidate** とする。

before側の `to` と after側の `from` は、pivot Stroke上の**同じPress / participation**を
参照していなければならない。別pivot fingerの候補を継ぎ接ぎして架空のpathを作らない。

Redirectはpureな連続運指ではなく、局所的に反転pathが存在するというexistential factなので、
pivot Strokeに対象手の複数Pressがあること自体では除外しない。実在する同一pivot pathが
1本以上あれば **RedirectEvent** を1件生成し、成立したcandidateをすべて保持する。
candidateが複数でも、3 Stroke windowにつきEventは最大1件。

Eventは `pivotStrokeIndex` / `beforeTransitionIndex` / `afterTransitionIndex` で元解析結果を参照する。
weak / weak-ish等はfinger pathから派生可能なためbooleanを重複保存しない。
連続する方向反転は重なる個別Eventとして保持し、RedirectRunは導入しない。

#### Redirect horizontal geometry quality

Redirectの成立判定とgeometry qualityを分離する。各RedirectCandidateについて、
対応するbefore / after FingerTransitionの既存 `dx` factから次を派生できるようにする。

```
horizontalReversal =
  before.dx * after.dx < 0
    ? min(abs(before.dx), abs(after.dx))
    : 0
```

これはpivotを境に**x方向で実際に引き返した共通量** [u]。
finger-directionが反転していてもphysical dxの符号が反転しない場合や、片側が `dx=0` の場合は0。

- candidateごとに保持/導出し、Event単位の代表値へ潰さない
- 閾値や「良い/悪い」の分類をraw geometry factへ混ぜない
- この値でRedirectEvent / LongRoll / TwoRoll / ArpeggioSpanの成立可否を変更しない
- 旧Arpeggio geometry条件へ戻さない

### 10.4 LongRoll / TwoRoll

Transition / Redirect factsからpure roll構造を作る時は、LongRollとTwoRollで同じ
**Roll constituent Stroke eligibility** を使う。

- 対象handのPressが1本だけ
- そのPressのnormalized participationが `output` roleを持つ
- output親指も構造候補として扱う
- opposite-handの新規 `trigger` activationが同一Strokeにある場合はpure rollから除外
- opposite-hand `held-trigger` だけでは除外しない
- trigger-only Strokeの境界はChainPolicyへ従う

対象handの複数Press Strokeは、Transition候補から都合のよい1本を選んでpure rollへ
通してはいけない。Redirectはexistential eventなので同じStrokeがpivotになれる場合があるが、
この非対称は意図的である。

**LongRoll** は同一Analysis Chain内でinwardまたはoutwardが2 Transition以上連続する
3 Stroke以上のmaximal区間だけを保持する。sameは区間を切り、finger jumpだけを理由に
除外しない。正規範囲はStroke index half-open `[startStrokeIndex,endStrokeIndex)` とし、
Transition範囲をRollElementへ重複保存しない。

**TwoRoll** はLongRollへ包含されない2 Strokeのdirectional pair。
2 Stroke双方へ上記eligibilityを適用し、end StrokeがRedirect pivotの場合だけ除外する。
start Strokeがpivotでも除外しない。この非対称は「直後に反転するpairをTwoRollにしない」
という分類規則であり、Timing / Calibration判定ではない。

```
LongRoll ∩ TwoRoll = ∅
AnyRoll = LongRoll ∪ TwoRoll
```

Stroke spanから対応Transitionを得る変換は共通helperへ集約し、後段が個別に
off-by-one変換を実装しない。

### 10.5 ArpeggioPolicy / ArpeggioSpan

ArpeggioはLongRoll / standalone TwoRollというstructural factそのものではなく、
それらへ **ArpeggioPolicy** を適用して得るkeydist固有の派生Spanとする。

初期Policyは次の3項目だけを持つ。

- `includeThumb`（既定false）: 親指を含むstructural Rollをcoreとして採用するか
- `bridgeSameFinger`（既定false）: same Transitionを中立bridgeとしてSpanだけをmaximal化するか
- `includeSingleRedirectTail`（既定false）: 完成Span末尾直後の逆方向1 Transitionだけを吸収するか

`includeThumb=false` でもTransition / LongRoll / TwoRollという構造的事実は消さない。
`bridgeSameFinger` もRollElement / TwoRoll / SFB eventを書き換えず、ArpeggioSpanだけを拡張する。

bridgeはsameを除いたdirectionが単一方向の範囲だけで行い、same個数に上限を置かない。
Policy適用後に同じ `(startStrokeIndex,endStrokeIndex,hand,direction)` へ到達したSpanは
1件へ正規化する。生成根拠にLongRollが含まれれば `coreKind='roll'`、
含まれなければ `coreKind='two-roll'` とする。

Policy適用順は必ず:

```
bridgeSameFinger
  ↓
includeSingleRedirectTail
```

redirect tailは末尾1 Transitionだけで、leading redirectやtail後方のsameを連鎖吸収しない。
異なるstructural根拠を持つSpan同士はoverlapを許容し、adjacentだからという理由ではmergeしない。

ArpeggioSpanはStroke index half-open範囲、hand、coreKind、direction、適用extensionだけを持つ。
Timing durationのsourceにはせず、Roll / Redirect / Key / Point等の詳細を重複コピーしない。

cutover後のcanonical設定は `conditions.arpeggioPolicy` のみとする。
旧 `conditions.arpeggio` を読み込んだ場合は、意味が一致する `includeThumb` だけを移行し、
`minHorizontalSpread` / `maxRowReversal` / `maxRowStep` /
`breakOnOppositeHand` は推測変換せず破棄する。新規 `bridgeSameFinger` /
`includeSingleRedirectTail` はfalseから始める。

旧 `arpeggioEnabled` / `arpeggioDelayMode` はPlayback Timingから廃止済みで、
strict / looseの旧geometry presetも残さない。migration後のstateは再保存し、
同じmigration通知を次回起動で繰り返さない。

### 10.6 StrokeAnnotation / structural aggregation

LongRoll / TwoRoll / RedirectEvent / SFB event / ArpeggioSpanはStroke本体へフラグを書き込まず、
Stroke indexを使って**非排他的な派生Annotation**へ投影する。

```ts
type StrokeAnnotation = {
  inLongRoll: boolean;
  inTwoRoll: boolean;
  inArpeggio: boolean;
  inRedirect: boolean;
  inSfb: boolean;
};
```

- `inLongRoll`: LongRoll spanのunion
- `inTwoRoll`: standalone TwoRoll両端のunion
- `inArpeggio`: ArpeggioSpanのunion
- `inRedirect`: RedirectEventのpivot Strokeのみ
- `inSfb`: SFB event両端Strokeのunion
- `inAnyRoll` は保存せず `inLongRoll || inTwoRoll` から派生する

同一Strokeへ複数属性が同時に付いてよい。たとえばsame bridge後のStrokeは
`inArpeggio=true` と `inSfb=true` を同時に持てる。

構造集計は **raw countとcoverageを分離**する。

- Arpeggio: raw Span数 / 平均Span長 / unique Stroke coverage
- LongRoll / TwoRoll / AnyRoll: unique Stroke coverage
- directional pair: HandTransition単位
- Redirect: raw Event数 / unique pivot coverage
- SFB: raw Transition event数 / unique関与Stroke coverage

重複Spanや重複Eventはraw countでは保持し、coverageではStroke indexのunionとして1回だけ数える。
集計結果には解決済み `TriggerRealizationPolicy` / `ChainPolicy` / `ArpeggioPolicy` のimmutable snapshotを持たせ、
後からUI stateが変わっても算出条件を追跡できるようにする。

## 11. 出力指標

合成スコアは作らない。各指標を独立に出す。

**11.1指ごとの総移動距離**

```
D_f = Σ cost(...)          [uまたはmm]
```

**11.2指ごとの押下数**

```
Q_f = 指fが担当したキーの押下数
Q_f / C                         [押下/文字]
```

同時押しでは、押したキーの数だけ押下数に加える。距離が0のホームキーや親指キーも
押下数には含める。生の押下数と入力文字あたりの押下数を、指ごとに独立して出す。

**11.3全体の総移動距離**

```
D = Σ_f D_f
```

**11.4入力文字あたりの総移動距離**

```
C = 入力文字数（ローマ字展開・コンボ結合の前、原文の文字数）
D / C                       [u/文字]
```

打鍵数（ステップ数）は配列によって変わる。ローマ字の綴り、コンボによるキー結合、
かな配列の直接入力はいずれも打鍵数を増減させる。したがって「1打鍵あたり」（§11.1の
`D_f` や §11.3の `D` を打鍵数で割った値）を分母にすると、打鍵数を削減したこと自体の効果が
分母に吸収されて相殺され、見えなくなる。

`C` はローマ字展開やコンボ結合の**前**、原文の文字数で数えるため配列に依らず一定になる。
打鍵数削減の効果はこちらに残る。

**11.5入力文字あたりのアクション数**

physical Stroke数とPolicy上のaction数は分離する。

```
S = realized Stroke数
A_total = S + virtual hold-start action数
A = A_total / C             [アクション/文字]
```

基本は1 realized Stroke = 1 action（§4.1。同時押し・コンボも1 action）。

ただし #220 の `HoldStartActionPolicy.countAsSeparateStep=true` の場合だけ、
layer / modifierのoutputと同一Strokeにrealizeされた `held-trigger/start` を
追加のvirtual actionとして1件数える。compositionは対象外。
`prefix` 等ですでにtrigger-only Strokeが独立して存在する場合も追加しない。

このPolicyは**action計上だけ**を変える。`Metrics.strokes` は常にphysical `S` を保持し、
`Metrics.actions` だけが `A_total` を持つ。`meanPerStroke`、同指連続率など
physical Strokeを分母にする既存指標は `S` を使い続ける。
realized Stroke列・距離・Press数・Chain / Transitionは変更しない。
再生では同じPolicyを可視化するため、対象Strokeを `hold開始 → output` の2 virtual actionとして表示し、
確定Timing scheduleにも追加action時間を持たせる。既定は `false` で従来互換。

`C` は §11.4と同じ、入力文字数（ローマ字展開・コンボ結合の前）。ローマ字配列は
綴りが同じなら配置に依らず同じ値になる。この軸で差が付くのはコンボとかな直接入力のみ
（§12.2）。

併せて、押下キー数を分母にした指標も出す。

```
P = 押下キー数 / C          [押下/文字]
```

`A` はPolicy適用後のaction数、`P` は押下キー数を分子に取る。両者は分子だけが違う。
コンボは複数キーを1ステップにまとめるため `A` を下げるが、押すキー自体は減らないため
`P` は下げない。2つを並べることで、コンボがステップ数（時間的なコスト）を減らす一方で
押下キー数（総仕事量）は減らしていないことが見える。片方だけでは、コンボが
一方的に得な最適化に見えてしまう。

**11.5.1単打面率**

打鍵可能な入力文字のうち、**単打面の1キーだけで直接出力できた文字**の割合を出す。
分母・分子とも出力文字数ベースで数える。

```
L1 = 単打面の1キー直接入力で出力できた文字数
T  = 打鍵可能だった入力文字数
singleTapLayerRate = L1 / T × 100       [%]
```

判定は入力文字単位で行う。ローマ字展開や複数文字コンボの内部Stroke数では重み付けせず、
元の入力文字数を数える。「単打面の1キー直接入力」は、1 Stroke・1物理キー・
`inputRole='layer'` で、trigger / held-trigger / compositionを伴わない入力とする。

したがって、親指シフト・前置/後置シフト・文字キー同時押しコンボ・複数打鍵のローマ字入力は
含めない。hold-capableなシフトを実際に保持した場合も、その対象文字を単打面へ昇格させない。
打鍵不能文字は分母 `T` から除外する。

この値は入力の難しさや優劣を直接表す指標ではなく、単打面に配置された文字が入力文字の
どれだけを占めるかという配列構造を表す。

**11.5.2単打率**

かな配列で通常「単打」と呼ばれる入力に合わせ、総アクションのうち、
**1 physical Stroke・1物理キーだけでひらがなを1文字以上直接出力し、
trigger / held-triggerに依存しないアクション**の割合を出す。

```
S1 = 単打に該当するアクション数
A  = Policy適用後の総アクション数
singleTapRate = S1 / A × 100       [%]
```

単打面率とは分母が異なる。単打面率は元の入力文字数を数えるのに対し、
単打率は実際のアクション数を数える。たとえば1キーで「きゃ」を直接出す入力は、
単打面率では2文字分、単打率では1アクション分として数える。

ローマ字入力の `k` や `a` のように、1キーactionであってもそれ自体がひらがなを
直接出力しないものは単打に含めない。したがってローマ字の母音キーも単打率には入らない。
prefix / suffixシフトは入力単位が複数Strokeにまたがるため、その一部の1キーStrokeだけを
単打とは数えない。simultaneousな複数キー入力、コンボ、hold継続中の
`held-trigger` 依存入力も単打には含めない。

`held-trigger/start` を独立actionとして数えるPolicyでは、そのvirtual actionも分母 `A` に
含める。ただしカナを直接出力するactionではないため単打の分子には含めない。

**11.5.3 1キー率**

入力意味とは独立に、総アクションのうち**1物理キーだけを入力するアクション**の割合を出す。
単打率と同じ総アクション数を分母にし、カナを直接出すかどうかは問わない。

```
K1 = 1物理キーだけを入力するアクション数
A  = Policy適用後の総アクション数
singleKeyRate = K1 / A × 100       [%]
```

ローマ字入力の各英字、prefix / suffixのシフト単独action、hold継続中に新規押下する
1キーactionも分子へ入れる。逆に、1 actionで複数キーを同時入力する場合は、
1本の指で複数キーを押す場合も含めて分子へ入れない。

`held-trigger/start` を独立actionとして数えるPolicyでは、同一physical Stroke内に
realizeされたtriggerとoutputを別actionとして扱う。各actionが1物理キーだけなら、
それぞれ1キーactionとして分子 `K1` に入れる。

この指標は「単打」というかな入力上の意味を持たず、純粋に1 actionあたりの入力キー数を見る。
比較表では **単打面率 → 単打率 → 1キー率** の順に並べる。単打率と1キー率は同じ
アクション数を分母にするため、単打に該当するactionは必ず1キーactionにも該当する。
一方、単打面率だけは文字数ベースなので、この2指標との数値の大小関係は保証されない。

**11.6隣接指間距離の統計（ホーム間隔からの超過）**

各打鍵の**押下直後**に全指の位置スナップショット（§10）を取り、同じ手の隣接ペアについて距離を求める。
スナップショットは、次の同指打鍵で「残す」が実際に選ばれた区間だけ前回キー位置を採り、
それ以外の指はホーム位置を採る。

```
左手: (LP,LR) (LR,LM) (LM,LI)
右手: (RI,RM) (RM,RR) (RR,RP)
```

親指は隣接ペアに含めない。他の4本と同じ平面で動くものではないため。

生の距離ではなく、**各ペアのホーム間隔を基準（0）とした超過**を指標とする。

```
E = d(p_a, p_b) - d(H_a, H_b)          [u]
```

`H_f` は指fのホームキー位置（§5）。ホームに並んだ状態が0になり、「ホームから
どれだけ開いたか」がそのまま読める量になる。生の距離は隣り合う指がホームに居るだけで
1u前後あるため、値がそこから始まり、0起点の尺度では差が目盛りの上側に押し込まれて潰れる。

**引く値は定数1uではなく、その形状・その指割り当てにおける実ホーム間隔。** row-staggeredと
ortholinearでは結果的に1.000だが、これは定義ではなくたまたまの値である。column-staggeredは
列ごとのYオフセット（指の長さの差を補正するために意図的に付けている）により隣接ホームの
2次元距離が1.005〜1.024uになる。これは「ホームですでに開いている」のではなく、
**その形状で最も無理のない姿勢**であって、開きとして数えるのは向きが逆になる。
定数1uを引くとcolumn-staggeredだけが下駄を履く。

**0でクランプしない。** 指の割り当てはユーザーが定義できるため、打鍵中に隣接指がホームより
近づく姿勢も作れる。「ホームより近い」は実際に起きうる状態であり、負のまま出す。

ペアごとに全打鍵にわたる**平均**と**実測の最大値**を出す。標準偏差も「ばらつき」として
併記してよいが、中心を表す値や裾を表す値の代わりにはしない（単位はすべて距離と同じu。
分散だと単位がu² になり、距離と比較しづらいため標準偏差を採る）。平均は普段どれだけ
開いているか、最大値は実際にどこまで開いたかを表す。値が大きいほど上下段をまたぐ運指が多い。
各ペアのホーム間隔を引く操作は、そのペアの平均・最大値を同じ定数分だけ平行移動するだけなので、
**標準偏差は変わらない**。

**11.7同指連続回数**

`g = 0` の出現回数。

**11.8コンボ命中数**

コンボ定義数・命中した定義数・延べ命中回数を独立に出す。

```
B = 配列に定義されたコンボ見出しの数
U = 評価中に一度でも命中したコンボ見出しの数
H = コンボ見出しが命中した延べ回数
```

同じ見出しが複数回当たる場合、`U` は1件、`H` は回数分だけ増える。ヤ行コンボは
§4.3の発火条件を満たした場合だけ命中として数える。コンボを持たない配列は
`B = U = H = 0` とする。

**11.9 N感度曲線**

`N` を0〜10で振り、`D` の変化を記録する。

`N` を増やして `D` が減るのは `d_stay < d_home` の場面、すなわち
**前のキーが目標キーにホームより近い**場合に限られる。
したがって傾きが大きいほど、ホームから離れた位置での連続打鍵が多い。
傾きが小さい配列は、打鍵がホーム付近で完結している。

**11.10層ごとの打鍵数・割合とヒートマップ**

各キー押下を、その押下を含むステップの帰属先へちょうど1回だけ計上する。

- 通常の単一キー面は、その面の層へ計上する
- triggerの押下は、呼び出した面の層へ計上する。単打面からは引かない
- prefix / suffix面は、triggerと本体の両方を同じ層へ計上する
- 合成濁音のように複数の面を連結した `Sequence` は、各ステップを元の面の層へ分けて計上する
- triggerが2キー以上のコンボ面は、通常の層とは別のコンボ枠へ計上する

層 `l` の押下数を `Q_l`、コンボ枠の押下数を `Q_combo` とすると、保存則は次のとおり。

```
Σ_l Q_l + Q_combo = Σ_f Q_f = 押下キー数
```

割合は全押下キー数を分母にする。

```
share_l = Q_l / 押下キー数
share_combo = Q_combo / 押下キー数
```

層ごとの図は各層に帰属するキー押下数を物理キー位置へ戻して描く。層操作のために押した
トリガーキーの押下分だけは、層別図の色計算から除いて表示上のスケールを正規化する。
同じ物理キーが別の面の出力キーにもなる場合、その出力としての押下分は色計算に残す。
実際の押下数・保存則・ツールチップの値からは何も除外しない。トリガー押下を除いたキー
押下数の最大値は、表示中のすべての層別図で共通にする。統合ヒートマップは従来どおり、
全キーの押下数で色付けする。これにより、層操作キーの常時押下で色が飽和することを防ぎ
つつ、層キー同士の入力で生じる出力キーの使用量も表示できる。
相互シフトの同時打鍵層では、関係する文字トリガーを2個以上実際に同時押下したステップに
限り、押下した両方のトリガーを表示色に残す。トリガー1個と出力キー1個の通常の同時打鍵では、
トリガーを除外する。これは表示だけの補助であり、集計値には影響しない。
薙刀式の「2面にまとめる」表示では、スペースを使わないレイヤー3以降を単打側へ合算する。
この合算表示に限り、合算したレイヤーで文字トリガーを2個以上同時押下した実トリガーを
単打側の出力として色に残す。トリガー1個の押下は除外し、全レイヤー詳細表示でも通常どおり
層操作キーとして除外する。

層別図の色の尺度は線形を標準とし、画面上で対数へ切り替えられる。トリガーを除いたキーの
押下数を `c`、表示中の最大値を `M` とすると、線形では `t = c / M`、対数では
`t = log(1 + c) / log(1 + M)` を色の強度に使う。これは表示上の変換であり、押下数や
割合の値は変えない。統合ヒートマップは常に線形とする。

## 12. 数値の性質

### 12.1下界である

Nの範囲で最良の運指を採用するため、出力される総移動距離は**下界**である。
実際の運指はこれ以上になる。

配列間の比較には使えるが、絶対値は楽観側に振れている。
絶対値を提示する場合はこの性質を併記する。

### 12.2コンボ・同時押しは距離軸に現れない

コンボ（複数キーの同時押しで1文字を出す）や同時押しは、指の移動そのものを
減らす最適化ではなく「複数打鍵を1打にまとめる」最適化である（仮定1・§4.1）。
まとめても押すキーと移動距離は変わらないため、一次的な効果は距離ではなく
**打鍵数（ステップ数）**に出る。

したがって、コンボ化は総距離を必ず減らすとは限らない。むしろステップが減った分
だけ他の指の `g`（§7）が伸びるため、同指連続（sfb）が増えて総距離が増える配列もある。

実測（かな1676文字、N=3、row-staggered、綴りは訓令式）:

| 配列 | コンボなし | コンボあり | 同指連続 |
|---|---|---|---|
| QWERTY | 2032u | 1766u | 238 → 237 |
| Colemak-DH | 1042u | 1020u | 42 → 105 |
| 大西配列 | 1087u | 1032u | 38 → 86 |

移動の多い配列（QWERTY）ではコンボが総距離を減らす方向に、
移動がすでに最小化された配列（Colemak-DH・大西配列）では増やす方向に働く。

綴りを揃えないと比較にならない。上表の大西配列は訓令式で打った場合であり、
大西式綴り（シャ行 `sh` / じ `ji`）では新サンプルのコンボなしで1076u・同指連続32になる（§4.4）。
総距離だけを見て「コンボは効果がない」「コンボは悪化させる」と読むのは早計であり、
そもそもコンボが効く軸（打鍵数）と本モデルが測る軸（距離）が異なる。

コンボ・かな直接入力による打鍵数削減の効果は、入力文字あたりのアクション数
（§11.5。ステップ数を入力文字数で割った指標）に直接出る。入力文字あたりの
総移動距離（§11.4）にも二次的に効くが、そちらは指の移動距離という別の量を
測っているため、打鍵数削減の効果だけを読みたいときは §11.5を見る。どのコンボ定義が
実際に効いたかは §11.8の命中数で確認する。

### 12.3測定条件は数値に付随する

物理形状・指割り当て・窓幅 `N`・綴りの規則など、**測定条件を変えると数値は変わる**。
これは事実の記述であって、条件の違う数値を並べてはならないという規則ではない。

比べ方はモデルが決めることではない。配列ごとに適した形状を選んで「その配列の最良」
同士を比べるのも、形状を固定して論理配列だけを比べるのも、どちらも成立する問いである。
前者は「この配列を本気で使うとどこまで行くか」を、後者は「同じ土俵で配列の差だけを見るか」
を測っており、片方を正解とする根拠はモデルの側に無い。

したがって条件は**配列ごとに変えられる**。モデルが負う責務は比較の可否を裁定することではなく、
**どの条件で出した数値かを常に数値と一緒に運ぶこと**である。

- 出力（`Metrics`）は使用した条件を保持する
- 画面は、既定と異なる条件で測った配列について、その差分を数値のそばに示す
- 数値を持ち出す時（書き出し・共有）は、条件を同じ入れ物に入れて運ぶ

読み手が条件を見て比較の意味を判断できる限り、条件を揃えることは要求しない。
