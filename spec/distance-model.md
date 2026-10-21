# キーボード配列指移動距離モデル仕様

## 1. 目的

配列の性質を数値化する。実際のタイピングの再現ではない。

数値の導出は、定義まで遡れる範囲に留める。忠実度を上げる変更であっても、
導出の追跡可能性を下げるものは入れない。出た数値に疑問が生じた時、
定義まで遡れることを優先する。

担当する指が1本のキーだけの指の割り当てでは、どの打鍵も、打鍵の列と今の状態から2手で追える。
複数の指が担当するキーを持つ割り当てでは、そのキーを打つ指が、その先 `N` かなの中の最小化で決まる（§9.1）。
その指は2手では追えない。代わりに、選ばれた理由は今の状態とその先 `N` かなだけで決まり、
範囲の中の最小は厳密に解くので、値は解き方によらず手順として一意に決まる。
選んだ指は打鍵に記録され、打鍵再生でどの打鍵をどの指で打ったかを見て確かめられる。

## 2. 仮定

1. **指は互いに独立して動く。** 手全体の連動・指同士の干渉は扱わない
2. 各キーは1本以上の指が担当し、担当する指のうち1本が基本の指である。担当する指が1本のキーは、その指に固定的に割り当てられる。担当する指が2本以上のキーをどの指で打つかは、モデルが `N` かな先までの範囲で求める（§9.1）
3. 距離はキー平面上の2次元ユークリッド距離。ただし親指キーと親指キー以外のキーの間の距離は、位置によらず1uとする（§3.1）
4. 打鍵直後、指は必ずそのキー上にある
5. 親指も他の指と同様にホームを持つ。親指キーが片手に1つだけの物理配列では、
   ホームはそのキー自身になる（§3.1）

親指も、親指キー以外のキーを担当できる（§3.1）。

仮定1はモデルの定義であって近似ではない。実際の手では人差し指を伸ばせば
他の指も引きずられるが、数値評価のため省く。指同士の距離は指間距離の平均と裾（実測最大値等）で評価する。

## 3. 座標系

単位はu（キーピッチ1個分）。実距離が必要なら物理配列が持つ `pitch_mm` を掛ける。

物理配列（`PhysicalShape`）はピッチ・各段のキー数・段ずれ量・列オフセット・
親指キーの数と位置をまとめて持つ。**物理配列を変えると距離の絶対値が変わる。**
どの物理配列で測ったかは数値に付随する情報であり、出力には必ず併記する（§12.3）。

既定で4つの物理配列を用意する（それぞれANSIとJISの2規格がある）。row-staggered・ortholinear・column-staggeredの数値はこれまでの固定実装と変えていない。

| 物理配列 | 段ずれ（xオフセット） | 列オフセット（y） | ピッチ |
|---|---|---|---|
| row-staggered | 各段 `[0, 0.5, 0.75, 1.25]` | なし | 19.05mm |
| ortholinear | なし | なし | 19.05mm |
| column-staggered | なし（列5以降に分割の間隔をxに加える） | 各列 `[0.34, 0.12, 0, 0.1, 0.3, 0.3, 0.1, 0, 0.12, 0.34]` | 18mm |
| split-ortholinear | なし（列5以降に分割の間隔2uをxに加える） | なし | 19.05mm |

split-ortholinearはortholinearに、column-staggeredと同じ分割（列5以降に間隔2uを加える）だけを足した物理配列で、
左右の手の境目を図で見分けやすくするためのもの。ピッチ・段ずれ・列オフセットはortholinearと同じなので、
同じ手の中のキー間の距離は変わらない。親指キーはcolumn-staggeredと同じく分割に従ってxが動き
（右親指は分割の間隔の分だけ右へ寄る）、yはortholinearと同じ（`THUMB_ROW`）。指の割り当ての既定（列固定）は
列4までを左手、列5以降を右手とするので、分割の位置と一致する。

各段のキー数（段の数を含む）も物理配列定義が持つ。既定の物理配列はANSIの英数部に合わせて
12 / 12 / 11 / 10とする。

Tab / Esc等の4段grid外physical keyは `PhysicalShape.extraKeys` へstable physical key id、
座標 `(x, y)`、表示幅を持てる。これらは通常gridへ無理に埋め込まず、評価時は他のキーと同じ
`Geometry.keys` へ入る。**物理配列は位置を、`FingerAssignment` はそのキーを担当する指を持つ。**
grid外キーの運指をshapeへ埋め込まない。extra key idはcanonical physical identityそのものを
保存し、`resolveKeyId(id) === id` を満たす必要がある。`space` のようなlegacy aliasを
独立したphysical keyとして保存してはならない。

指 `f` のホーム位置を `H_f` と書く。

### 3.1親指

親指キーの数と位置は物理配列が持つ。各手に1個以上のキーを置き、そのうち1つを
ホームに指定する（複数ある場合は明示が必要。1個しかない手は自動でそれがホームになる）。

親指も他の指と同じ規則（§7〜§9）に従う。**親指キーが片手に1つだけの物理配列では
ホーム＝そのキー自身になるため、親指が親指キーだけを打つ間の移動距離は0** になる（これまでの既定の物理配列は
すべてこの形）。親指キー以外のキーを打つ親指は、上の規則で距離が付く。片手に複数の親指キーを置く物理配列では、ホームとそれ以外のキーの間の
移動が他の指と同様に計上される。

親指は、親指キーのほかに、親指キー以外のキーも担当できる（§3.2）。親指キー以外のキーは、
物理配列の親指キー（上の各手の親指キー）とShiftキーを除くすべてのキーで、grid外のキーを含む。
Shiftキーは割り当ての外で、左右の小指に固定する。

- 親指のホームは、親指キーのまま変えない
- **親指キーと親指キー以外のキーの間の距離は、キーの位置によらず1uとする。** 親指は親指キー以外のキーの
  位置を決めたホームを持たず、親指の位置から1段上へ動いて押すためである。親指キー以外のキーどうしの
  間の距離は、他の指と同じく座標の距離とする
- 親指が親指キー以外のキーを押した後の位置は、そのキーの座標とする。指間距離のスナップショット（§11.6）や
  打鍵再生の位置はこの座標を使い、距離だけ上の規則で求める。打鍵再生の時間（`spec/playback-timing.md`
  §3.3・§3.8）の `move` にも同じ規則を当てはめる
- 1本の親指が同じ打鍵で複数のキーを押すしかない時（§4.2）、押すキーがすべて親指キーなら目標位置は
  それらの重心（親指キーの位置）とする。親指キー以外のキーを含むなら、目標位置は押すキーすべての重心の
  座標とし、親指キーからその重心までの距離は1uとする
- この距離は三角不等式を満たさない（親指キーから `b` も `m` も1u、`b` から `m` は座標で約2u）。
  §7 R4の「残った場合とホームに戻った場合の小さい方」で、ホームを経由した方が短ければそちらが採られる

親指を扱う目的の一つは距離ではなく `g` のカウントである。
空白やセンターシフトを打鍵列から落とすと、それらを挟んだ他の指の `g` が実際より小さくなり、
単語や文節をまたぐ運指が実際より繋がって見える。

### 3.2利用者が設定する物理配列と指の割り当て

物理配列（位置）と指の割り当ては独立した条件である。前者は `PhysicalShape`、後者は
`FingerAssignment` として別に持つ。指の割り当ては物理配列の一部ではなく独立した条件として
保存・選択され、既定は物理配列の規格（ANSI/JIS）から決まる。指の割り当ては、指（左右の親指を含む10本）ごとに担当するキーの集合を持ち、
どのキーも1本以上の指が担当し、担当する指のうち1本を基本の指とする。親指キーは、その手の親指だけが担当する。
担当する指が1本のキーだけの割り当ては、キーごとに指を1本決める割り当てと同じ意味になる。
ただし、分割する物理配列（下の§9.1）では、キーと反対側の手の指の追加の担当は打鍵の候補から外れる。
物理配列と指の割り当てが独立なのは、割り当ての定義（誰がどのキーを担当すると宣言したか）までで、
どの指でそのキーを打てるかには物理配列が関わる。外れた担当は割り当ての定義には残る。
組み込み（既定・JIS・QWERTY最適化・QWERTY最適化（JIS））と自作の
どちらの指の割り当ても、同じカスケードの項目（`fingerAssignmentId`。`engine/finger-assignment.ts`、
`engine/settings-items.ts`）として全体・Workspace・物理配列・配列・Setupのレベルで選べる。同じ物理配列のまま
組み込みのJIS運指へ差し替える、自作の運指へ差し替える、といった比較ができる。自作の指の割り当ては
`input/shapes/user-finger-assignments.ts` が資産として持ち、`engine/commands.ts` の
作成・複製・削除・改名コマンドで手持ちを操作する。idを解決できない（自作割り当てを削除した後に
それを指す上書きが残っている等）場合は例外にせず、その物理配列の既定へfallbackした事実を診断として
残す（`engine/finger-assignment.ts` の `resolveFingerAssignment`）。

配列は、指の割り当ての推奨を持てる。組み込みの配列「QWERTY最適化」だけが持ち、キーの並びはQWERTYと同じで、
推奨は組み込みの割り当て「QWERTY最適化」（物理配列の規格がJISなら「QWERTY最適化（JIS）」）である。
`fingerAssignmentId` の優先順は、ローマ字規則の推奨（§4.4）と同じく
**配列・Setupの上書き ＞ 配列の推奨 ＞ 物理配列・Workspace・全体の値 ＞ 物理配列の規格の既定**で、
推奨を持つ配列は、全体・Workspace・物理配列のレベルで別の割り当てを選んでいても、推奨の割り当てで測る。
配列「QWERTY最適化」の数値は、QWERTYを組み込みの割り当て「QWERTY最適化」で測った値と一致する。
数値の求め方は変わらず、配列を並べて比べる時に、割り当ての違いが全体の設定で崩れないようにするための仕組みである。

配列を対象にした時にどの物理配列で測るかは、カスケードの項目（`defaultShapeId`）として解決する。
全体・Workspace・配列のレベルに値を置ける（物理配列そのものを決める項目なので、物理配列・打ち方のレベルには置かない。
Setupは自分の物理配列を持つので、この項目は使わない）。優先順は
**配列の上書き ＞ Workspaceの値 ＞ 全体の値 ＞ 組み込みの既定（`row-staggered`）**。
配列の上書きが無ければ、（下のJISの物理配列が要る配列を除く）どの配列もWorkspaceの値（Workspaceの中でだけ。無ければ全体の値、それも無ければ既定）の物理配列で測る。
配列ごとの物理配列は、利用者が配列のレベルで指定した時だけ適用される。

配列は、JISの規格の物理配列を前提にできる（組み込みの配列「JISかな配列」だけ）。この配列は、配列の上書きが無い時、
上の優先順で選ばれた物理配列と同じ形のJISの組み込みの物理配列で測る。ロウスタッガード（ANSI）が選ばれていればロウスタッガード（JIS）、
オーソリニア（ANSI）ならオーソリニア（JIS）、オーソリニア（ANSI・分割）ならオーソリニア（JIS・分割）、カラムスタッガード（ANSI・分割）なら
カラムスタッガード（JIS・分割）にする。選ばれた物理配列が既にJISの組み込みならそのまま使う。自作の物理配列は規格を持たないので、
その配列が打鍵に使うキーを全部持つ時はそのまま使い、持たない時はロウスタッガード（JIS）にする。Workspace・全体の値は、負ける値ではなく、
このJISの物理配列を導く入力になる。配列のレベルの上書きが手持ちの物理配列を指す時は、その物理配列を使う（導かない）。Setupは自分の物理配列を持つので、導かない。
どのレベルで決まった物理配列でも、その配列が打鍵に使うキーを全部は持たない時（JISかな配列にANSIの物理配列を置いた時など）は、
別の物理配列へ黙って差し替えず、計算をしない。判定は配列が打鍵に使うキー（canonical inputの全経路のphysicalKeys）が
物理配列に全部あるかで行い、自作の物理配列にも同じ判定を使う。

画面の「打ち手と機材」パネルの設定モーダルでは、既定の物理配列を選んだうえで次の値を利用者が変更できる。

- ピッチ、段ごとのxオフセット、列ごとのyオフセット、分割間隔
- 左右の親指キーの列位置とy座標
- grid外physical keyのstable id・座標・表示幅
- 列単位の指割り当てと、列から外れるキー単位の上書き（組み込みと自作がある）

段ずれ・列オフセット・親指位置・分割間隔は、UIでmmとuを切り替えて入力する。内部の正準値はuであり、
mm表示は現在のピッチで変換する。物理配列は `shape-{識別子}` の名前付きカスタム物理配列として複数保存でき、
組み込みの物理配列や保存済みの物理配列を複製して「名前を付けて保存」する。設定は画面状態の
`conditions.geometrySettings` に保存し、JSONの設定ファイル（version 1）にも同じ形で含める。
読み込み時は物理配列を構築できる値だけを受け入れ、不正な値は既定値へ戻す。

運指設定のホームキーは物理配列ではなく配列（`Layout.homeKeys`）に属する。配列が指定したキーを使い、
省略時は物理配列側の既定運指のホームキーへフォールバックする。ホームキーは、親指以外の指ごとに1つ持ち、
その指が担当するキーのどれかでなければならない。配列の `homeKeys` の上書きにも同じ条件を当てはめ、
その指が担当しないキーを指す上書きは使わない。親指以外のキーの基本の指は、親指以外の指とする。これにより配列を切り替えても、
配列固有のホーム段を自動的に維持できる。

## 4. 配列定義とcanonical input

Face / Sequence / combo定義は、人間が配列を記述するための**authoring表現**である。
評価器のsemantic authorityはauthoring表現そのものではなく、compile / normalize後の
canonical inputである。

legacy Sequence authoringは次の形を使う。

```
Sequence = Step[]      順次打鍵。前から順に打つ
Step     = KeyId[]     同時に押すキーの集合
```

標準4段gridのキーは **QWERTY刻印**をphysical idとして指す（`d`、`;`、`-` 等）。
親指キーは `thumb-l` / `thumb-r`、grid外キーは `tab` / `escape` 等のstable
physical idを使う。これはlogical output名ではなく物理位置のidentityである。旧来の
`space` は入力互換のエイリアスとして受け付け、canonical化時に `thumb-r` へ解決する。

配列定義は省略可能な `homeKeys`（非親指の指から物理キーidへの写像）も持てる。
省略時は物理配列側の既定値を使う。

Face authoringは次の概念を持つ。

```
Face = {
  trigger: KeyId[],
  mode: "prefix" | "suffix" | "simultaneous",
  rows: FaceRow[],
  layer?: string,
  inputRole?: "layer" | "modifier" | "composition",
  compositionAggregation?: "layer" | "combo",
  triggerPersistence?: "single" | "hold-capable",
}
FaceRow = string | string[]
```

`compositionAggregation` は `inputRole="composition"` の面だけが持ち、その面の打鍵を層とコンボ枠のどちらへ
計上するか（§11.10）を配列の定義が明示する。`composition` の面は必ずこの値を宣言する。
triggerのキー数や手の左右から推測しない。同じ配列の中でも、作者が基本の打ち方とみなす面と
拡張とみなす面は配列ごとに違うため、面ごとに宣言する。`"layer"` を宣言できるのはtriggerが1キーの面だけで、
triggerが2キー以上の面は `"combo"` を宣言する。`inputRole` が `composition` でない面は、この値を持たない。

authoring sourceはcompile時に `SemanticInput` と `BaseActionRealization` へ変換する。

```ts
interface InputAlternative {
  semanticInputs: SemanticInputSequence;
  baseRealizations: BaseActionRealizationSequence;
  contextRequirements: InputContextRequirement[];
  origin: "sequence" | "face" | "combo" | "composed";
}

type CanonicalInputMap =
  ReadonlyMap<logicalOutput, readonly InputAlternative[]>;
```

Map keyは最終的なlogical output、1 alternativeはそのoutputを成立させる1つの具体canonical
input pathである。各SemanticInputのRequirementはANDだけを持ち、同一outputに複数の
合法pathがある場合のORは `InputAlternative[]` で表す。

したがって同じ文字が複数キーに配置された場合も、最初の定義だけを打鍵用に残さず、
全てcanonical alternativeとして保持する。reciprocal Faceのように同じSemanticInputを
別authoring viewから記述しているだけのケースはalternativeを増やさず、同一SemanticInputへ
dedupeする。

CanonicalInputMap完成時は、異なるlogical output同士のactivation conflictを共通validationする。
同一canonical activation path、または同じphysicalKeysで両立可能なRequirement setを持つ
異outputは曖昧なのでerrorとする。Capability / classification / action grouping差は
activation排他の根拠にしない。mutually exclusiveと証明できるorder pathは共存可とする。
sequence長違い / prefix relation等のprecedenceは本節では決めない。

constructorやtransformが同じlogical outputへ新しい合法pathを追加する場合、
canonical alternativesは既存値を上書きせずappendする。legacy `Layout.map` は
presentation/default互換として先頭pathを保持してよい。

canonical `SemanticInput` は少なくとも次の独立factを持つ。

```text
physicalKeys
requirements
capabilities
roles
aggregationGroupId
classifications
faceMemberships
```

`modifier` はkey単位のSemanticRole。`composition` はroleではなくclassificationであり、
`aggregationGroupId='combo'` から再推測しない。語彙拡張等もauthorが明示しないと失われるため、
stable classification IDとしてcanonicalへ保持する。一方、left/right hand、distance、
currently-held、preferred alternativeのようにgeometry/runtimeから導出できるfactは重複保存しない。

physical activationとは別に、そのpathがruntime context上成立する条件を
`InputAlternative.contextRequirements` に保持する。現在の
`{ kind: 'youon-only' }` は拗音ローマ字塊の内部だけで成立するpathを表す。
`{ kind: 'romaji-input' }` は、かなをローマ字テーブルで展開した綴りの区間だけで成立するpathを表す（§4.3）。
これはlogical output全体の条件ではなくalternative単位のapplicabilityである。

さらに、top-level authoring provenanceを `origin` として保持する。
`sequence / face / combo / composed` は「どのauthoring経路がこのpathを生成したか」を表し、
classificationやaggregationGroupIdとは別軸である。コンボ命中集計（§11.8）は、selected pathが
1ステップで、そのステップの `aggregationGroupId` がコンボ枠（`'combo'`）であり、`origin` が
`combo` か `face` であることを基準にする。同outputに層へ帰属する別のpathが存在しても、
selected pathが層に帰属するなら命中として数えない。

評価時は次の順で処理する。

```text
logical output matching
  -> CanonicalInputMap[output]
  -> context requirement filter
  -> eligible InputAlternative[]
  -> Input Alternative Selection Policy
  -> selected BaseActionRealizationSequence
  -> TriggerRealizationPolicy
  -> RealizedSemanticAction
  -> Stroke
```

`stepLayers / stepTriggerKeys / stepSemantics / StepSemantic` はcanonical cutover後に削除済み。
legacy `Layout.map` だけをauthoring default / presentation互換として残すが、
generateTraceのsemantic authorityではない。

左右どちらの親指でも同じshift semanticを成立させられる配列は、
`thumbShiftKeys` に合法な親指physical keyを持ち、authoring時に左右両pathをcanonical
alternativeとして生成する。`preferOppositeThumb` はキーを書き換える機能ではなく、
authoring defaultを基準に、thumb keyだけが異なる合法variantの中からoutputと反対側の
親指を使うpathを優先するselection policyである。opposite-hand variantが無ければdefaultを
維持し、同じlogical outputのnon-thumb alternativeや別方式pathへこのPolicyだけで切り替えない。
thumb variant生成時の重複判定はaction groupingだけではなくcanonical alternative全体で行い、
Requirement / Capability / classification / role / layer / context / origin等が異なるpathを失わない。

英字配列の通常Shiftも同じcanonical pipelineで扱う。対象は組み込みの英字配列と、自作の配列のうち
単打の段定義だけで組んだもの（かなを直接打つ配列と、取り込み形式の配列を除く）である。
自作の配列も、同じ段の定義を持つ組み込みの配列と同じ数値になる。
配列が大文字や記号を単打などで既に置いている時は、置かれた定義を優先し、その出力に通常Shiftの経路を足さない。
大文字と、**現在モデル化しているbase
physical key**のShift記号はbase keyに `shift-l` / `shift-r` のいずれかを重ねる2つの
合法alternativeとしてcompileする。各alternativeはbase keyとの `overlap` Requirement、
Shift keyの `while-held` Capability、`modifierGroupId='Shift'` のmodifier roleを持つ。
Shiftを押しっぱなしで複数文字へ作用させるかは他のhold-capable triggerと同じ
`TriggerRealizationPolicy` で決まる。

現時点のbase physical modelにBackquote / Backslashが無いため、US配列の `~` / `|` は
現時点では未対応とする。これはShift semanticの例外ではなく、base physical key自体が
未モデル化であるためである。

解析時の通常Shiftは、左右variantのうちoutput keyと反対手のShiftを既定で優先する。
これはcanonical keyの書き換えではなくInput Alternative Selection Policyであり、両pathは
canonical上に残る。Input Converterでは実際に押された `ShiftLeft` / `ShiftRight` を
それぞれ `shift-l` / `shift-r` へ写像するため、ユーザーのphysical choiceをそのまま認識する。
Shift keyのgeometryは既存PhysicalShapeの保存schemaへ混ぜず、bottom rowの実座標から標準Shiftの
中心位置を派生させる。

全角形の記号は、対応する半角の記号と同じ物理入力として評価する。日本語の入力ではIMEが全角と半角のどちらで出すかを
設定で選べるので、幅の違いを別の記号として数えると、配列の差ではなく設定の差が数値に出る。

- 全角形の記号は、全角形のASCII（U+FF01〜U+FF5E）のうち、英字・数字と `，`（U+FF0C）・`．`（U+FF0E）を除いたものである。
  対応する半角は、コードポイントから `0xFEE0` を引いたASCIIである（`！` → `!`、`（` → `(`、`／` → `/`、`＋` → `+`、`～` → `~` など）。
  `，` `．` は §4.6 の3段目（半角の `,` `.` を `、` `。` に書き換える）と関わるので入れない
- この別名は、評価入力境界で2か所に当てる。テキストの各文字と、配列の出力（見出し）の各文字である。
  配列の出力に当てるのは、組み込みの配列だけでなく、自作・読み込んだ配列にも同じである。
  別名で同じ見出しになる出力（配列が `！` と `!` の両方を持つ時など）は、両方の経路を同じ見出しの代わりの打ち方として持つ
- 全角形の英字・数字と、全角形のASCIIの範囲の外の記号は別名に入れず、文字が一致した時だけ打てる。
  範囲の外の記号は、`’` `”` `‘`、波ダッシュ `〜`（U+301C）、`￥`（U+FFE5）、`――`（U+2015）、`——`（U+2014）などである。
  広いNFKC正規化は行わず、全角の英字・数字と互換文字を意図せずASCIIへ写さない
- Strokeの `inputChar` は元入力を保持する

二重かぎ括弧 `『` `』` は、かぎ括弧 `「` `」` と同じ物理入力として評価する。日本語の入力では、IMEの変換で出す文字として
`『』` は `「」` の代わりに使えるので、配列が `『』` を専用のキーで持たない限り、別の記号として数えない。
変換の操作（変換キーや候補の選択）は、漢字の読みの変換と同じく打鍵に数えない。

- この別名は、`『` `』` それぞれについて、配列が自分の出力（見出し）として持たない時だけ当てる。
  ローマ字を経る配列では、ローマ字テーブルが `『` `』` の見出しを持つ時も当てない（自作のローマ字規則を含む）。
  `『』` を持つ配列（薙刀式v18など）では、`『` を配列の `『` の定義でだけ打ち、`「` の打鍵は別名の有無で変わらない。
  全角形の記号の別名のように見出しを合流させない。合流すると、`『` が `「` のキーでも打たれ、`「` の経路にも `『` のキーが加わるため
- ローマ字を経る配列では、テーブルに当たらなかった `『` `』` の塊を、`「` `」` のテーブルの綴りで打つ。
  Strokeの `inputChar` は元の `『` `』` を保持する。`「」` が配列で打てない時は、`『』` も打てない文字に数える
- テキストの言語（日本語・英語）は問わず、全角形の記号の別名と同じく常に当てる
- 組み込みのローマ字テーブルは `…` の綴りを持たないので、`keepSymbols` の時、ローマ字を経る配列では打てない文字に数える。`…` を見出しに持つ配列（かわせみ+ など）は、その見出しで打てる

日本語のテキストでは、これらの別名は評価対象の記号の範囲を広げた時（§4.6）に使われる。既定の範囲では、
日本語のテキストの記号は `、` `。` を除いて評価に渡す前に取り除かれ、`generateTrace` に届かない。
英語のテキストは範囲の処理を受けないので、別名は常に使われる。

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

重心を採るのは、同じステップのキーを別々の指で打つ選び方が無い時だけである。
担当する指が2本以上のキーを含むステップでは、1本の指が同じステップの複数のキーを打つ選び方は、
他の選び方がある時は候補から外す（§9.1）。どの指がどのキーを担当するかは測定条件として外から与えられ（§3.2）、
担当する指が2本以上のキーをどの指で打つかは、§9.1の手順でモデルが求める。
担当する指が1本のキーだけの割り当てでは、指を探すことはしない。

割り当てを変えると同指連続の数も距離も変わる。どの割り当てで測ったかも物理配列と同じく
数値に付随する情報であり、出力に併記する（§12.3）。担当する指が2本以上のキーを持つ割り当てで
測った時は、そのことも分かるようにする。

入力の候補の選択（上の Input Alternative Selection Policy。通常Shiftの手の判定と
`preferOppositeThumb` を含む）は、打鍵の列ができる前に行う。この時のキーの手は、基本の指の手で判定する。
担当する指の追加の有無で、大文字や親指シフトの選び方が変わらないようにするためである。
そのため、大文字の `Y` では、基本の指（右人差し指）の反対の左Shiftが選ばれ、その後の指の選び方（§9.1）で
`y` が左人差し指に決まると、同じ手のShiftとキーになることがある。

ただし、複数の親指alternativeを合法pathとして持つ配列で
`preferOppositeThumb` を有効にした場合は、Input Alternative Selection Policyが
output側と反対の手の親指を使うalternativeを優先する。canonical inputのkeyをruntimeで
別physical keyへ書き換える処理ではない。

同じ親指alternativeが連続して選ばれた場合の距離・`g` は通常のStroke列に対する規則で
計算する。保持可能なshiftを実際にholdするかどうかは `TriggerRealizationPolicy` の責務であり、
親指alternative selectionとは独立している。

### 4.3見出しは最長一致で切り出す

配列の見出しは複数文字でもよい（`きゃ`）。入力テキストからの切り出しは最長一致で行う。

`きゃ` を見出しに持つ配列では1単位として当たり、持たない配列では `き` `ゃ` に分解される。
どちらで打つかは配列定義が決めることであり、評価器は選択しない。

ローマ字配列にコンボを持つ場合も、かなからローマ字へ展開した各見出しの境界を評価時に
保持する。どのコンボを使うかは配列定義が決めることであり、評価器は見出しの綴りから
独自の発火規則を選択しない。コンボ定義が発火条件を持つ場合だけ、評価器はその条件に従う。

現時点でauthoring `youonOnly` 条件を持つのはTK音直入力法のコンボのヤ行19件である。
compile時にcombo alternativeへ `{ kind: 'youon-only' }` context requirementとして保持する。
拗音の見出しのローマ字塊の途中で、直前の文字が子音になる場合だけそのalternativeがeligibleになる。
単独の `や` `ゆ` `よ` などの `ya` `yu` `yo` ではそのalternativeを除外し、
同じlogical outputに無条件alternativeがあればそちらを使い、無ければ短い見出しへfallbackする。

コンボ定義は、どの入力で使えるかという適用範囲も持てる。authoring `romajiOnly` 条件を
持つコンボは、かなをローマ字テーブル（§4.4）で展開した綴りの区間だけで使う。
英文をそのまま打つ時と、日本語テキストに混ざった英字などローマ字テーブルを通らない区間では、
そのコンボは配列に無いものとして扱い、同じ配列の単打配置だけで打つ。
compile時にcombo alternativeへ `{ kind: 'romaji-input' }` context requirementとして保持する。

適用の可否は**入力が覆う綴りの区間で決める**。ローマ字テーブルの見出しに当たって展開された
綴りの塊を「かな由来」とする。句読点・長音・記号（`「」・` を含む）も、テーブルに見出しがあって当たれば
かな由来に入る。`『』` は、別名（§4）で `「」` の見出しに当たった時にかな由来に入る。`…` のようにテーブルに見出しが無く、
そのまま打つ文字は入らない。テーブルに当たらずそのまま打つ文字（英字・数字など）は入らない。
`romajiOnly` のコンボは、その入力が覆う綴りの塊がすべてかな由来である時だけ成立する。
かな由来の塊どうしの連結（`から、です` や `から・です` のように句読点・長音・記号を挟む場合を含む）では成立し、
かな由来の塊とそうでない塊をまたぐ範囲（`でsu` の `desu`、`しte` の `site` など）では成立しない。

TK音直入力法のコンボ73件はすべて `romajiOnly` を持つ。出力が `site` `kara` `desu` のような
ローマ字の綴りなので、英単語の一部を誤ってコンボで打つことを避けるためである。
例えば `これはwebsiteです` では、`website` の区間に `site` のコンボは成立せず、
`です` の区間では `desu` のコンボが成立する。`Wi-Fiのsiteへ` では `site` のコンボは成立しない。
配列は1つで、日本語のかなの区間ではコンボ込み、英文や英字の区間では単打配置だけの数値になる。
ローマ字テーブルを持たない（ローマ字を経ない）打ち方では、`romajiOnly` のコンボは配列ごと外す。

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

組み込みのテーブルは、かなのほかに句読点・長音・記号の見出しを持つ。`、` → `,`、`。` → `.`、`ー` → `-` に加え、
`「` → `[`、`」` → `]`、`・` → `/` である。日本語IMEのローマ字入力の既定の綴りに揃えたもので、
Google日本語入力（mozc）は既定の記号の設定で `[` を `「`、`]` を `」`、`/` を `・` にする。
出典は mozc の `src/data/preedit/romanji-hiragana.tsv`（`[` `]`）と `src/composer/table.cc`（`/` の初期化）、
`src/protocol/config.proto`（記号の設定の既定 `CORNER_BRACKET_MIDDLE_DOT`）である。
Microsoft IMEは、公式の資料にローマ字入力の記号の表が見当たらず、一次情報では確かめていない。
`z[` `z]` `z/` のようにzで始まる綴りはIMEによって持つかどうかが割れるので、見出しに採らない。
AZIKのテーブルは、出典が `[` `]` に `「」` を割り当てているのでその綴りを採る。出典は `/` に何も割り当てていない（`・` は `z/` にだけある）ので、
ほかのテーブルと同じ `/` を `・` の綴りとして足す。
`『』` は専用の見出しを持たず、`「」` の別名として打つ（§4）。組み込みのローマ字テーブルは `…` の綴りを持たない。
促音の自動生成は、子音の英字で始まる綴りだけに適用するので、記号の見出しからは `っ「` のような見出しを作らない。

どのテーブルで打つかは、カスケードの項目（`romajiRuleId`）として解決する。全体の既定は訓令式で、
全体・Workspace・打ち方・配列・Setupのレベルに値を置ける。かな配列には効かない（ローマ字を経ないため）が、
ローマ字とかなで別々に設定するものではなく、全体の値は1つ。
綴りを前提に組まれた配列は、組み込みの推奨を持つ。大西配列は大西式、TK音直入力法は
訓令式（そのコンボが `sya` / `zya` の綴りを前提に組まれているため）。
優先順は **配列・Setupの上書き ＞ 配列の推奨 ＞ 打ち方・Workspace・全体の値 ＞ 全体の既定** で、
推奨を持つ配列は全体の値を変えても推奨のまま打つ。推奨を持たない配列だけが全体の値に従う。

全体の値を変えていなければ、どの配列の数値も動かない。

自作の配列（かなを直接打つものを除く）は、定義に持つローマ字規則を配列の推奨として扱う。
その規則が組み込みにも自作にも無い時は推奨を持たず、全体の値に従う。
自作のローマ字規則のidが組み込みの規則のidと同じ時は、組み込みを使い、自作の規則は読み込まない。
自作の配列のidが組み込みの配列のidと同じ時も同じで、組み込みを使う。

かな配列はテーブルを通さず `かな → Sequence` をauthoringする。
ローマ字配列・かな配列のどちらも最終的に `CanonicalInputMap` へcompileされ、
評価器はauthoring sourceではなくselected canonical alternativeを処理する。

### 4.5合成出力（濁点・半濁点）

かなの後に濁点・半濁点の記号のキーを打って濁音・半濁音を出す配列（JISかな配列）は、
濁音・半濁音を打鍵の列として直接は書かず、**元の出力**と**合成記号**から合成出力として定義する。
`か` + `゛` → `が`、`は` + `゜` → `ぱ` がこの形である。

- 合成出力の経路は、元の出力の経路と合成記号の経路を前から順に連結したものである。元の出力と合成記号のそれぞれが
  複数の経路を持つ時（例: 元の出力がShift面と単打の両方にある）は、すべての組を経路にする。`origin` は `composed` とする
- 連結は順次打鍵である。元の出力の打鍵のステップを打ち終えてから、合成記号のステップを打つ。
  同時押しにはならないので、元の出力と合成記号が同じ指のキーなら、同指連続の規則（§8）がそのまま掛かる
- 合成出力の経路がどの面から来たかは、連結した各ステップが元の面を保つ。Shift面の出力の後に記号を打つなら、
  Shiftのステップはmodifierの面、記号のステップは記号の面に帰属する（§11.10）
- 合成出力1文字は、テキストの1文字の入力として数える。覆うかなは1文字で、打鍵のステップは元の出力の分と記号の分を足した数になる
  （`が` はステップ2つ）。したがって `N`（先読みの文字数）は、`が` の2つのステップに同じかなの位置の差0を与える
- 合成先の出力が既に別の経路を持つ時は、既存の経路を上書きせず、合成した経路をalternativeに追加する（§4）
- 元の出力か合成記号が配列に無い時は、配列の定義の誤りとして扱う

### 4.6評価に渡すテキストの前処理

評価に渡すテキストは、利用者のテキストにアプリの前処理（漢字を読みに直す段・片仮名をひらがなに書き換える段・評価対象の記号の範囲の処理）を通したものである。
`generateTrace` はこの前処理の後のテキストを受け取り、`Trace` の入力文字数（`inputChars`）、§7 R3の位置、
`Stroke` の `inputChar`、再生の表示の文字列は、すべて前処理の後のテキストで数える。
漢字を読みに直した時は、読みの文字数が入力文字数になり、打鍵再生には漢字ではなく読みが出る。
前処理で取り除いた文字は `skipped` に数えず、R3の位置にも数えない。

前処理は日本語のテキスト（アプリの言語判定、または利用者の手動の指定が日本語のもの）にだけ当てる。
英語のテキストは、英文の記号（`'` `;` `(` など）と `,` `.` が英文を打つ時の評価対象なので、何も変えない。
日本語のテキストには次の4つを順に当てる。

1. **漢字を読みに直す。** テキストが漢字（`\p{Script=Han}`。`々` を含む）を含む時だけ、テキストを形態素解析し、
   漢字を含む語を、辞書が返す表記どおりの読み（`は` → ハ、`曜` → ヨウ）をひらがなにしたものに置き換える。
   読みは、記号を取り除く前の原文で解析した語の列から作る（記号は語の区切りの手がかりになるため）。
   - 語と語の間にある文字（解析が語として返さない半角の空白・改行・タブなど）は、原文のまま残す。語の表記を連結して作らない
   - かな・英数字・記号だけの語は、置き換えない。全角数字は辞書が読みを返しても、漢字を含まないので置き換えない（数字は数字のまま評価する）
   - 辞書に読みが無い語（未知語の漢字）と、読みが `々` だけの語は、置き換えず、元の表記のまま残す。残った漢字は配列が打てない文字として `skipped` に数える
   - 辞書を読み込めない時も、漢字を読みに直さずに評価し、漢字を `skipped` に数える
   - 漢字を含まない日本語のテキストと、英語のテキストには当てない（辞書を読み込まない）
   - かなを含まない漢字だけのテキストは、言語の判定が英語になるので当てない
   - 読みは辞書と解析器の版で変わる。読みに直した数値には、辞書の名前と版、解析器の名前と版を付ける（§12.3）
   - **利用者が直した読み。** 利用者は、テキストごとに、表記を指定して読みを直せる。直しは辞書の読みのあとに当て、
     解析で得た語の列に対して、表記が直しと一致する語すべての読みを置き換える。語の区切りは変えず、直していない表記の語の読みも変えない
   - 直しを当てる語は、表記に漢字を含む語すべてである。辞書が読みに直した語のほか、辞書の読みが無い語（未知語）、
     読みが `々` だけの語も含む。直しを当てた語は読みに置き換わるので、`skipped` に数えない。漢字を含まない語（かな、全角数字など）には当てない
   - 利用者が打てる読みは、ひらがなと `ー` だけで、1文字以上とする。直しを消すと、辞書の読みに戻る
   - 辞書を読み込めない時は、語の列が無いので直しを当てない（漢字を読みに直さずに評価し、条件にも直しを入れない）
2. **片仮名をひらがなに書き換える。** 全角の片仮名のうち、対応するひらがながある字（`ァ`〜`ヴ`。U+30A1〜U+30F4）を、
   文字コードを `0x60` 引いたひらがなにする（`ニ` → `に`、`ャ` → `ゃ`、`ヴ` → `ゔ`）。
   片仮名の入力はひらがなと同じ打鍵で入力する配列が多く、片仮名の見出しを持つ配列は少ないので、片仮名をひらがなとして評価する。
   - 直す対象は、1.の漢字を読みに直す段の後のテキストである。読みはすでにひらがなになっているので、漢字を含む語とは重ならない
   - **配列が見出しとして持つ片仮名の文字列は、書き換えずに残す。** 配列（ローマ字の入力ではローマ字のテーブルを含む。
     組み込みの配列も、自作・読み込んだ配列も、利用者のローマ字の規則も同じ）が見出しとして持つ文字列が原文にあれば、そのまま評価する。
     ひらがなに直すと、打てていた文字が打てなくなるか、別の打鍵になるため。
     見出しは §4.3 と同じく最長一致で、原文の上で切り出す（`ヴァ` を見出しに持つ配列では、`ヴ` と `ァ` に割らずに `ヴァ` を残す）。
     片仮名とひらがなが混じった見出し（`ヴぁ` `ヴぇい` など）も同じ
   - 見出しに当たらない片仮名だけを書き換える。例えば `ヴ` だけを見出しに持つ配列で `ヴォ` を評価すると、`ヴ` は見出しのまま、`ォ` は `ぉ` にして評価する。
     `ヴ` を見出しに持たない配列では、`ヴ` は `ゔ` にして評価する。書き換えた後のひらがなを配列が打てなければ、配列が打てない文字として `skipped` に数える
   - 長音 `ー` は書き換えない。`ヵ` `ヶ`（U+30F5・U+30F6）は書き換えない。`ヶ` は「一ヶ月」のように助数の記号として使われ、
     読みが `か` `が` `こ` に割れるので、ひらがなの `ゖ` にしても読みにならない。`ヷ`〜`ヺ` と半角の片仮名も書き換えない
     （半角の片仮名は、§4 の別名の節が広い NFKC 正規化をしないと定めているため）
   - 書き換えたかなは、ほかのかなと同じく1文字が1つの位置である。入力文字数・R3の位置・打鍵再生の表示は書き換えた後のひらがなで数える
   - 英語のテキストには当てない
3. **半角 `,` `.` の解決。** 配列が `,` `.` を見出しとして直接持つ時は、そのまま評価する。
   持たない時だけ、`,` を `、`、`.` を `。` に書き換えてから評価する。
   逆向き（`、` → `,`）は解決しない。`，` を別に持つ配列があり、衝突するため。
   この書き換えは、範囲の既定・広げた時のどちらでも行う。
4. **記号の取り除き。** 「記号」は、Unicodeの文字（`L`）・結合文字（`M`）・数字（`N`）・空白のどれでもない文字である。
   かな・長音 `ー`・`々`・英字・数字・空白は記号ではなく、そのまま評価する。
   `〜` `…` `！` `？` `「」` `・` `，` `．` や単独の `゛` `゜` は記号である。
   - 既定の範囲: 記号のうち `、` `。`（3.で書き換えた `,` `.` を含む）だけを残し、ほかの記号を取り除く
   - 範囲を広げる（条件 `keepSymbols`）: 記号をすべて残す。配列が打てない記号は、通常の文字と同じく `skipped` に数える。
     ローマ字を経る配列は、テーブルの見出しを持つ記号（`、` `。` `ー` `「」・` と、別名で `「」` に当たる `『』`）と、配列が打てる半角の記号（`!` `?` `(` `)` など）を打つ。
     配列が物理キーを持たない記号（大西配列の `[` `]` `/` など）と、見出しも綴りも無い記号（組み込みのローマ字テーブルの `…` など）は打てない文字に数える

打てずに `skipped` に数えた文字は、種別ごとの件数に分けて持つ（`Trace` の `skippedByKind`。合計は `skipped` と一致する）。
文字が漢字（`\p{Script=Han}`。`々` を含む）なら「漢字」、記号（4.の定義）なら「記号」、それ以外は「それ以外の文字」に数える。
漢字は、テキストの言語や、辞書の読み込みの成否によらず、文字そのもので数える。
読みに直した後に配列が打てないかな（`ゔ` など）は、漢字ではないので「それ以外の文字」に数える。

打てずに `skipped` に数えた文字の位置は、評価に渡すテキストの文字位置（先頭が0）の集合として `Trace` の `skippedPositions` に持つ。距離の値は変えない。
かな配列では、数が `skipped` と一致する。ローマ字配列では、打てなかった展開後の英字を含む綴りの単位（1つ以上のかな）の文字を全部入れる。
一部の英字だけ打てたかなも入るので、数は `skipped`（展開後の英字の数）と一致するとは限らない。

範囲の外の記号は、既定では評価の対象にしない。範囲を広げると、配列が記号をどれだけ持つかで `skipped` が配列ごとに変わる。
`keepSymbols` は数値を動かす条件なので、他の条件と同じく数値に付随する（§12.3）。
既定の範囲では、`!` `?` `「」` `・` などを含む日本語のテキストから、これらの記号が取り除かれる。取り除かれた記号は入力文字数にも含まれない。

---

## 5. パラメータ

| 名前 | 型 | 既定 | 内容 |
|---|---|---|---|
| `N` | int | — | 先読みのかな数。テキストのかなの位置（§7 R3）でN文字先まで、指を残す候補とホーム復帰候補を比較する。担当する指が2本以上のキーを打つ指も、同じ範囲で選ぶ（§9.1）。同じ`N`は、どの配列でもテキストの同じ範囲を指す。打ち手ごとに異なるため利用者が設定する |
| `sfb_home_cost` | bool | `true` | 同指連続でホームキーを打つ場合に距離を加算するか（§8） |
| `prefer_opposite_thumb` | bool | `false` | 左右の合法な親指alternativeを持つ配列で、出力キーと反対側の親指pathを優先するか |

## 6. 状態

| 変数 | 内容 | 初期値 |
|---|---|---|
| `prev[f]` | 指 `f` が最後に打ったキー | `H_f` |
| `last[f]` | 指 `f` が最後に参加したrealized Strokeの通し番号 | `-∞` |
| `lastEnd[f]` | 指 `f` が最後に参加した入力の終わりの位置（§7 R3） | `-∞` |

`f` は打鍵ごとに選んだ指である（担当する指が2本以上のキーでは§9.1）。押さえ続けているキーによる参加は、
押さえている指の `prev[f]` / `last[f]` / `lastEnd[f]` を更新する（§9）。

## 7. ホーム復帰ルール

**R1. 打鍵直後、指はそのキー上にある。**

**R2. ホームへの復帰移動は距離に計上しない。**
復帰は他の指が打鍵している裏で並行して起きるため、能動的な移動として数えない。

**R3. Nはテキストのかなの位置で数える。**

評価に渡すテキスト（アプリの前処理の後）の文字を、先頭から0, 1, 2, … の位置で数える。かなは1文字が1つの位置で、
英文は文字1つが1つの位置である。どの見出しにも当たらずに読み飛ばした文字（配列に無い記号や、ローマ字配列は打つがかな配列は読み飛ばす英字）も
1つの位置として数える。読み飛ばす文字は配列ごとに違うので、数えないと、配列ごとに同じ `N` が指す範囲がずれる。

generateTraceが最長一致・context filter・alternative selection後に選んだlogical inputを入力と呼ぶ。
各入力は、覆うテキストの範囲を、最初の文字の位置（開始 `s`）と最後の文字の位置（終わり `e`、その文字を含む）で持つ。

- ローマ字配列: かなをローマ字の綴りの単位（`きゃ`→`kya`、`っか`→`kka` は1単位）に切り、入力が覆う英字を含む単位のかなの範囲を持つ。
  1単位の英字の入力（`k`・`y`・`a`）は、全部その単位の範囲を持つ。コンボが複数の単位にまたがる時（`you` が「きょう」の `ょ` と `う` にまたがる等）は、
  またがる単位を合わせた範囲を持つ
- かな配列: 入力が覆うかなの範囲を持つ。`きゃ` を1つの入力で打てば2文字の範囲、`き` と `ゃ` を別々に打てばそれぞれ1文字の範囲を持つ
- 英文: 入力が覆う文字の範囲を持つ

指 `f` について、今の入力の開始 `s` と、`f` が最後に参加した入力の終わり `lastEnd[f]` の差を

```
ΔI = max(0, s - lastEnd[f])
```

とする。隣り合うかなは `ΔI=1`、5文字先は `ΔI=5` である。同じかなを打つ入力どうし（`か` の `k` と `a`）は `ΔI=0` で、
どの `N` でも指を残す候補を持つ。範囲が重なって引き算が負になる時（「きょう」の `k` の後のコンボ `you`）も `ΔI=0` とする。

終わりから測るのは、2文字以上を覆う入力に参加した指は、その入力の最後のかなまで打鍵に加わっていたと見なすためである。
`きゃ` を1つの入力で打つ場合と、`き`・`ゃ` を別々に打つ場合で、`ゃ` を打った指から見た次のかなの `ΔI` は同じ（1）になる。
`き` だけを打った指は、別々に打つ場合の方が `ΔI` が1大きい（2）。別々に打つ配列では、その指が実際に1かな前に打鍵を終えているので、
この差は配列の違いとして残す。

1つの入力がprefixやtrigger action groupingによって複数Strokeへ分割されても、範囲は変わらない。
continuous holdの有無でもselected input列は変わらないため、Nの範囲は変わらない。

**R4. Nの内側では、残った場合と戻った場合の両方を候補とし、小さい方を採る。**

同値の場合は「残った場合」を採る。これは移動距離を変えないが、指間距離の
スナップショットでどちらの位置を採るかを決めるためである。

**R5. 指間距離では、実際に採用した候補だけを残留として扱う。**

realized Strokeとして同指連続でなく、`ΔI ≤ N` かつ `d_stay ≤ d_home` なら、
次の同指打鍵までの区間を前回キーに残ったものとする。それ以外はホームに戻ったものとする。
`N` は指を常に残す時間ではなく、次の同指打鍵に対して候補を比較する先読みのかなの範囲である。

## 8. 同指連続ルール

realized Stroke gap `g=0`（間に他のStrokeが挟まらない）のとき、
ホームへ戻る時間が物理的に存在しない。このときNとは無関係に候補は「残った場合」のみとなる。

打鍵先がその指のホームキー自身（`k == H_f`）であっても同様に適用する。
`h` を打った直後に `j` を打つ場合、指は `h` から `j` へ1u移動しており、
これを0として扱わない。

**この扱いには異論がありうるため `sfb_home_cost` で切り替える。**

| `sfb_home_cost` | `g=0` かつ `k == H_f` のとき |
|---|---|
| `true`（既定） | `d = dist(prev[f], k)` を加算する |
| `false` | `d = 0`。ホームキーへの復帰打鍵は移動として数えない |

このフラグが結果を変えるのはrealized Stroke上の同指連続でホームキーを打つ場合のみ。

## 9. 距離の計算

2つの候補距離を

```
d_stay = dist(prev[f], k)      # 前のキーに残っていた場合
d_home = dist(H_f,     k)      # ホームに戻っていた場合
```

`dist` は座標のユークリッド距離で、親指だけは §3.1の規則に従う。親指の位置が親指キーで目標が親指キー以外のキー
（またはその逆）の時は、座標によらず1uとする。

として、physicalな同指連続とかなの位置の差 `ΔI`（§7 R3）で候補集合を決める。

| 条件 | 候補 | 採用 |
|---|---|---|
| realized Stroke gap `g=0` | `{d_stay}` | `d_stay` |
| `g>0` かつ `ΔI ≤ N` | `{d_stay, d_home}` | `min(d_stay, d_home)`（同値は `d_stay`） |
| `g>0` かつ `ΔI > N` | `{d_home}` | `d_home` |

打鍵後、fresh pressした指は `prev[f]` / `last[f]` / `lastEnd[f]` を更新する。
held triggerでそのinputに参加し続ける指も `lastEnd[f]` を現在inputの終わりへ更新する。

```python
def cost(stroke_index, s, e, k, f):
    # s, e: 今の入力の開始と終わりの位置（§7 R3）
    g = stroke_index - last[f] - 1
    delta_input = max(0, s - lastEnd[f])
    d_stay = dist(prev[f], k)
    d_home = dist(H[f], k)

    if g == 0:
        if not sfb_home_cost and k == H[f]:
            d = 0.0
        else:
            d = d_stay
    elif delta_input <= N:
        d = min(d_stay, d_home)
    else:
        d = d_home

    prev[f] = k
    last[f] = stroke_index
    lastEnd[f] = e
    return d
```

### 9.1 担当する指が2本以上のキーをどの指で打つか

担当する指が2本以上のキーを含む入力では、そのキーを打つ指を次の手順で選ぶ。
担当する指が1本のキーだけの入力では、指は決まっているので、この手順は何も変えない。

入力を先頭から1つずつ進めて決める。各入力では、今の入力と、その開始から今の入力の終わりを引いた値が `N` 以下の入力
（今の入力を含めて、文章の最後に近い時は最後まで）の打鍵について、次の順で最小になる指の並びを求め、そのうち**今の入力の打鍵の指だけ**を確定する。
`N=0` では、今の入力と範囲が重なる入力だけが入る。
次の入力では、確定した指で状態（§6）を進め、範囲を1つずらして求め直す。範囲を `N` にそろえるのは、
`N` が「何かな先まで見て運指を決めるか」の範囲（§5）で、指を残すかホームへ戻すかの比較（§7 R4）と同じ範囲で指も選ぶためである。

1. 同指連続回数（§11.7の定義。`g=0` で、同じ指の目標位置が直前の位置と違うPress）が少ない
2. 指の左右の入れ替わりの数が少ない（下の定義）
3. 同じ指が近くに戻る打鍵の数が少ない（下の定義）
4. 基本の指で打ったキーの数が多い（同時押しはキーごとに数える）
5. 総移動距離が短い。各打鍵の距離（§9）を10⁻⁶u単位の整数に丸めてから足した値で比べる。
   浮動小数点の足し算の順で、厳密には等しい値が違って見え、6.の決め方が働かなくなるのを防ぐため
6. それでも同じなら、先の打鍵から順に、指の固定の順で先の指を選んだ方。固定の順は、
   左小指・左薬指・左中指・左人差し指・左親指・右親指・右人差し指・右中指・右薬指・右小指。
   同時押しの打鍵では、入力のキーの順（actionの `keys` の順。指の選び方に依存しない）に比べる

**分割する物理配列では、反対側の手の追加の担当を候補から外す。** 分割する物理配列は、`splitAt` を持ち、`splitGap` が0より大きい物理配列とする。
指は反対側の半分のキーへは届かないので、キーを追加で担当する指のうち、キーと反対側の手の指は、このキーの候補に入れない。
親指も同じ規則に従う。分割の間隔の大きさは問わない（届くかどうかを間隔の大きさで線引きする材料が無い）。

- キーの側は列で決める。列が `splitAt` より小さいキーは左の半分、`splitAt` 以上のキーは右の半分に属する。grid外の追加キーも列を持つので同じ規則で決める。
  親指キーは、その親指の手の側に属する。Shiftキーは左右の小指だけが担当するので、この規則で変わらない
- 外すのは追加の担当だけで、基本の指は外さない。基本の指がキーと反対側の手にある割り当てでも、基本の指はそのキーの候補に残る。
  基本の指を外すと、そのキーを打つ指が無くなるため
- 分割しない物理配列では何も外さない

距離より先に比べる1.〜3.は、届かない指も候補にあれば選ぶ。距離が長くなっても、親指はキーの位置によらず1uなので、間隔の影響を受けない。
このため、距離に任せず、候補の段階で外す。届かないのは事実なので、設定にはしない。

**2.と3.の指の位置。** 2.と3.は、打鍵ごとに、その打鍵より前の状態（§6）を見る。同じ打鍵で同時に押す指どうしは比べない。
指 `f` について、`f` が最後に参加した入力との `ΔI`（§7 R3）が0か1なら、`f` はその参加の目標位置（§6の `prev[f]`）にあるとみなす。
`ΔI` は、同じ入力の中なら0、すぐ前のかなの入力なら1で、間にある打鍵の数は見ない。
この位置は、距離の計算（§7 R4・§9）で指を残すかホームへ戻すかを決める位置とは別に決める。
距離の計算は、`ΔI ≤ N` かつ `d_stay ≤ d_home` の時だけ指が前のキーに残るとみなす。`N=0` の時や、ホームの方が近い時は、
2.と3.は `ΔI` が0か1ならその指を前に打ったキーの目標位置に置いて判定する。2.と3.が見るのは、指が直前のかなで使われたことで、
距離の下界を求めるための位置の仮定とは別の量だからである。範囲より前に確定した打鍵の参加も、最後の参加として見る。
押さえ続けているキーによる参加（§9）も、その指の最後の参加である。状態（§6）が押さえ続けている参加で `prev[f]` と `lastEnd[f]` を更新するので、2.と3.だけ別の「最後の参加」を持つと、状態と仕様が増える。
同じ打鍵で同時に押す指どうしは前後が無く、「直前のかなで使われた」という2.と3.の量に当たらないので、2.と3.は打鍵の中の指どうしを比べない。

**2. 指の左右の入れ替わり。** 同じ手の親指以外の指は、外から内へ小指・薬指・中指・人差し指の順に横に並ぶ。
ある打鍵で指 `f`（親指以外）が目標位置 `x_f` を打つ時、`f` と同じ手で並びが1つ隣の指 `g`（親指を除く。内側と外側の両方）が、
上の規則で位置 `x_g` にあるとする。`g` が `f` の右隣（左手では内側、右手では外側）なら `x_f < x_g`、左隣（左手では外側、右手では内側）なら `x_f > x_g` が、指の並びと同じ左右の順である。
その順に反するか、横位置が同じなら、その打鍵を1と数える。1つの打鍵で数えるのは1までで、打鍵の中のどの指の組が反していても1である。
横位置は、物理配列のキーの中心の横の座標（同時押しで1本の指が複数のキーを打つ時は重心）で比べる。
親指は数えない。親指キーと親指キー以外のキーの間を1uとする扱い（§3.1）と同じく、親指は横の並びを持たないためである。

**3. 同じ指が近くに戻る打鍵。** ある打鍵で指 `f` が最後に参加した入力との `ΔI` が0か1で、その打鍵が同指連続（`g=0`）でなく、
目標位置（1.と同じ比べ方）が最後の位置と違えば、その打鍵を1と数える。1つの打鍵で数えるのは1までである。親指も数える。
`ΔI` の上限を1にするのは、隣り合うかなの間（「ほう」の `h` と `u`）を数え、2かな離れた「はたす」の `h` と `u` を数えないためである。
上限を `N` にすると、`N` を変えるたびに3.の数え方が変わり、`N` による指の選び方の違いに、距離以外の理由が混ざる。

**順の理由。** 1.を最初に置くのは、同指連続は距離とは別に避けたい動きで、避ける余地があれば必ず避けるためである。
2.を3.より先に置くのは、「けると」の `t` で、左中指で打つ（直前に左人差し指で打った `r` より右へ出て、左右が入れ替わる）と、
左人差し指で打つ（直前のかなの `r` を打った指がすぐ戻る）を比べて、左人差し指を選ぶためである。逆にすると左中指になる。
4.を距離より先に置くのは、距離が0.1u程度違うだけで基本の指以外を選ぶのを避けるためである。例えば `n` は、右人差し指でホームから打つと
1.118u（row-staggered）、右親指なら（親指キーとの間は座標によらず）1uで、距離だけで比べると右親指が選ばれる。
3.を4.より先に置くのは、「ほう」の `u` で、基本の指の右人差し指が直前のかなの `h` を打った指なので、右中指を選ぶためである。
基本の指を総移動距離より先に比べる4.を、1.〜3.が同じ候補の間に置くのは、担当する指を足して同指連続・入れ替わり・近くに戻るで得をしない所では、足す前と同じ指を使うためである。
1.を距離より先に置く理由の例: `j` の次の `u` は、人差し指が残っていれば約1.03、中指がホームから来れば約1.60（row-staggered）になり、
距離だけで最小にすると、担当する指を足して避けようとしている同指連続を選ぶ。

この順は、担当する指を足した割り当ての総移動距離を、足す前より短くするとは限らない。距離を比べるのは、1.〜4.が同じ候補の間だけだからである（§11.9・§12.1）。

各打鍵の距離は、選んだ指について、§6〜§9の規則で求める。

- **範囲の中の最小は、動的計画法で厳密に求める。** 近似や打ち切りはしない。近似を入れると、値が解き方の性質になる。
  状態は、各指について次を持ち、同じ状態は目的の値が小さい方だけを残す
  - 位置（§6の `prev[f]`）。`ΔI` が `max(N, 1)` を超える指は、ホームへ戻した位置にまとめて区別しない。
    距離の計算は `ΔI ≤ N` の指の位置だけを読むが、2.と3.は `ΔI ≤ 1` の指の位置を読むので、`N=0` でも `ΔI=1` までは位置を区別して持つ
  - 最後に参加した入力の終わりから、今の入力の開始までのかな数（§6の `lastEnd[f]` との差。0から `max(N, 1)` までの値と、それを超えたことを表す1つの値。
    今の入力の開始より後ろまで覆う入力に参加した指は、はみ出した文字数を負の値で持つ。次の入力へ進む時に開始の差を足すので、
    はみ出した分を0で打ち切ると、次の入力の `ΔI` が実際より大きくなる）
  - 直前の打鍵に参加したか（§6の `last[f]` が直前の打鍵か。キーを押さえ続けていることによる参加を含む。`g=0` の判定に使う。
    1つの入力が複数の打鍵になるので、かなの位置では判定できない）
  - 押さえ続けているキー（§10.0）と、それを押した指
- 範囲の残りの打鍵が読まない指の状態は、区別しない。2.は打つ指の隣の指の位置を読むので、残りの打鍵で打つ指の隣の指の状態も残す
- 1入力あたりの計算は範囲の大きさで決まり、文章の長さによらない
- **押さえ続けている指は、押さえている間は他のキーに選ばない。** 担当する指がすべて別のキーを押さえている最中なら、
  基本の指で打つ。押さえているキーの扱いは、担当する指が1本のキーだけの割り当てで、キーの指が別のキーを押さえている時と同じ
- **同時押しの打鍵では、打鍵の中のキーの指をまとめて選ぶ。** 1本の指が同じ打鍵の複数のキーを打つ選び方は、
  他の選び方がある時は候補から外す（目的の値を比べる前に外す）。他の選び方が無い時だけ、§4.2の重心を目標にする
- 選んだ指を、その打鍵の指として記録する。手もその指の手とする。同指連続・指ごとの距離・指間距離・
  構造解析（§10.1〜§10.6）・§11の指標・打鍵再生は、すべて記録した指で計算する。キーから指を引き直さない

## 10. 任意時点の指位置

打鍵 `i` の押下直後における指 `f` の位置は、次のように定める。`f` は打鍵ごとに選んだ指（§9.1）で、
親指が親指キー以外のキーを押した後の位置は、そのキーの座標である（§3.1）。

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

Input Alternative Selection Policyで1つのcanonical pathを選択した後、
その `BaseActionRealizationSequence` を `TriggerRealizationPolicy` へ渡す。

```text
SemanticInput.requirements / capabilities
+ BaseActionRealization default/alternate participation
+ TriggerHoldState
+ TriggerRealizationPolicy
        ↓
realizeTriggerActions()
        ↓
RealizedSemanticAction
        ↓
Stroke
```

Faceの `TriggerPersistence='hold-capable'` はcompile時にSemanticInputの
`while-held` Capabilityへ変換される。`single` はCapability不在で表す。
Capabilityは「保持できる」ことを示すだけで、base realizationの時点ではholdを強制しない。

初期Policy:

```ts
type TriggerRealizationPolicy = {
  useHold: boolean; // default false
};
```

`useHold=false` ではselected base realizationをそのままphysical action列へする。
`useHold=true` ではactive `TriggerHoldState` と現在inputのCapability / Requirementを照合する。

- active hold groupは現在inputの `while-held.keys` のいずれかとexact matchする場合だけ候補
- Capabilityが一致してもRequirementを免除しない
- prefix型 `order(trigger -> target)` ではheld triggerを先行状態として継続可能
- suffix型 `order(target -> trigger)` では前入力からtriggerをholdしたまま次targetへ進めない
- `defaultHoldKeys` はauthoring/default realizationが選んだhold groupでありSemanticInput identityではない
- reciprocal inputではactive hold groupに対応するalternate participation viewを選択できる
- continue時はheld keyを新規Pressとして再生成しない
- held keyを除いた結果、logical outputを新たに発生させるfresh physical eventが0件になる場合は
  continueせずrelease/restartする
- held keyの位置は指位置snapshotには残す
- 明示release専用Stroke / Press / Release eventは初期実装では導入しない

旧 `StepSemantic / associatedTriggerKeys / associatedTriggerPersistence` は削除済みで、
Trigger realizationはcanonical factだけを入力にする。aggregationGroupIdやclassificationからhold可能性を推測しない。

後段のChain / Transition / Roll / Timingはrealized Stroke streamだけを読み、
独自にhold可能性を再判定しない。

Policyは数値へ影響するため、条件として §12.3 の解決順に載せる。置けるレベルは全体・Workspace・配列・Setupで、物理配列と打ち方には置かない。
Metrics / structural aggregationのcondition snapshotにも実効値を保存する。

### 10.1 構造解析用のRaw hand runとAnalysis Chain

打鍵列の構造解析では、正規化済みStrokeからいきなりChain境界を決めない。
まず各Strokeの `StrokeParticipation` を手ごとに投影し、連続してその手が参加した区間を
**Raw hand run** として作る。この段階で保持するのは参加factだけで、同指・trigger・親指・
逆手同時入力を理由に区切る判断はしない。

Raw hand runへ **ChainInterpretation** を適用した結果が **Analysis Chain** である。
現時点でPolicyが持つ境界条件は次の4つ。

- `breakOnSameFinger`: 同指移動Strokeを境界にする。既定 `true`
- `breakOnTriggerOnly`: 新規triggerだけでoutputを持たないStrokeを境界にする。
  既定 `false`
- `breakOnThumbOnly`: 対象手の参加指がすべて親指のStrokeを境界にする。
  既定 `true`
- `breakOnOppositeHandSimultaneous`: 同じStrokeに逆手のoutputがある場合を境界にする。
  既定 `false`

親指onlyはtrigger-onlyとは独立した条件として扱う。Raw hand run側の
`thumbOnly` / `thumbTriggerOnly` factは保持し、Policy適用前の事実を失わない。
TriggerPersistenceは「hold可能か」という能力なので、実際のhold利用やChain境界の推測には使わない。

Analysis結果はStrokeを複製せず、1回の結果内で安定する `StrokeIndex` と
`chainIndex` で参照する。永続的なstable IDは作らない。後段のRoll / Redirect /
Arpeggio等の構造要素はAnalysis Chain境界を越えてはならない。

ChainInterpretationは測定条件の一部として全体とWorkspaceのレベルまでに置き、
配列・Setupのレベルには置かない。`Metrics.conditions` のsnapshotにも保存する（§12.3）。

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
- trigger-only Strokeの境界はChainInterpretationへ従う

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

### 10.5 ArpeggioInterpretation / ArpeggioSpan

ArpeggioはLongRoll / standalone TwoRollというstructural factそのものではなく、
それらへ **ArpeggioInterpretation** を適用して得るkeydist固有の派生Spanとする。

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
集計結果には解決済み `TriggerRealizationPolicy` / `ActionRealizationPolicy` / `ChainInterpretation` / `ArpeggioInterpretation` のimmutable snapshotを持たせ、
後からUI stateが変わっても算出条件を追跡できるようにする。

## 11. 出力指標

合成スコアは作らない。各指標を独立に出す。

**11.1指ごとの総移動距離**

```
D_f = Σ cost(...)          [uまたはmm]
```

距離は、その距離を移動して打鍵した指に帰属させる。指fが打った押下（§4.2の重心を含む）の
`cost` だけを足し、他の指の距離は混ぜない。親指も同じ規則で、親指を含む10本すべてを出す。
親指が親指キーだけを打つ間の移動距離は、親指キーが片手に1つの物理配列では0（§3.1）。
親指キー以外のキーを打つ親指には、§3.1の規則で距離が付く。

指の割合と手ごとの小計を、同じ `D_f` から次のとおり求める（新しい量は足さず、割り算と足し算だけで導く）。

```
指fの割合       = D_f / D                      （Dが0の時は0）
手hの小計       = Σ_{f ∈ h} D_f                （hは左手・右手。指の頭文字のLとRで分ける）
手hの割合       = 手hの小計 / D
```

左手の小計と右手の小計の和は `D` に等しい（§11.3）。

**11.2指ごとの押下数**

```
Q_f = 指fが打ったキーの押下数
Q_f / C                         [押下/文字]
```

同時押しでは、押したキーの数だけ押下数に加える。距離が0のホームキーや親指キーも
押下数には含める。生の押下数と入力文字あたりの押下数を、指ごとに独立して出す。

押下数の割合と手ごとの小計も、距離（§11.1）と同じ形で求める。分母は全押下キー数 `Σ_f Q_f`
（0の時は割合を0とする）で、左手の小計と右手の小計の和は `Σ_f Q_f` に等しい。

**右手の割合**

複数の配列を並べて比べる表では、左右の偏りを右手の割合1つで出す。左手の割合は100%から引けば
求まるので、別の量として出さない。右手は親指を含む5本（指の頭文字がR）で、基準を右手に置くのは
右利きの利用者が多く、読む時の基準にしやすいため。値は §11.1・§11.2の手hの割合のうち、hが右手のものと同じ。

```
右手の距離の割合 = Σ_{f ∈ 右手} D_f / D        [%]   （Dが0の時は0）
右手の押下の割合 = Σ_{f ∈ 右手} Q_f / Σ_f Q_f  [%]   （Σ_f Q_fが0の時は0）
```

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

action数は `ActionRealizationPolicy` 適用後のrealized Stroke streamから数える。

```
S = ActionRealizationPolicy適用後のrealized Stroke数
A = S / C                    [アクション/文字]
```

現行pipelineでは1 realized Stroke = 1 analytic action（§4.1）。

trigger activationのaction groupingはcontinuous holdから分離し、
`ActionRealizationPolicy.triggerActivation = 'disabled' | 'semantic'` へ整理する。

`disabled` はfresh triggerとoutputのbase groupingを変更しない。`semantic` はcanonical
Requirementからtrigger activationを次の大分類へ分ける。

- `prepress-required`: triggerがoutputより先である必要がある → 既定 `separate`
- `order-free`: overlap等は必要でも押し順制約はない → 既定 `combined`
- `postpress-required`: outputがtriggerより先である必要がある → 既定 `combined`

ここでの `postpress-required` は将来の「後段分離」を意味しない。将来の後段分離は
`trigger down / output / trigger up` の **release側** を独立event/actionへ分ける拡張を指す。

groupingが `separate` になった場合、同一actionにrealizeされたfresh triggerとfresh outputを、

```text
[fresh trigger + fresh output]
    ↓
[fresh trigger]
[fresh output]
```

としてStroke生成前に分割する。`TriggerRealizationPolicy.useHold` はこの分割とは別軸であり、
`useHold=false` でもfresh triggerを分離できる。`useHold=true` では最初のactivationだけ
triggerを新規Pressし、continueでは保持中triggerを新規Pressしないため、trigger actionは
hold区間ごとに1回だけ増える。

splitはsemantic Requirementを保てる場合だけ行う。trigger / remaining groupがorder境界の
両側へ跨る場合、composition、既にtrigger-only actionが独立しているprefix入力、
trigger/outputが同じphysical Pressを兼ねる場合は追加分割しない。

大分類の既定値はclass overrideで変更でき、さらにcanonical selectorで個別overrideできる。

- `modifierGroupIds`: fresh trigger群が担うlogical modifier group集合
- `triggerKeys`: physical trigger集合

aggregationの `aggregationGroupId` はpolicy selectorへ使わない。優先度は
physical trigger selector > modifier group集合 > activation class > semantic default。
薙刀式ではSandSは `prepress-required`、濁音・半濁音・拗音・外来音等は
`order-free` なので、独立action化を有効にした既定状態ではSandSだけが分離される。

したがってMetricsだけのvirtual action補正は行わない。Policy変更後は
Chain / Transition / Metrics / Timing / Playbackがすべて同じrealized Stroke列を見る。

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

**単打面に配置されている出力文字数 / 全出力文字数**。

分母・分子とも出力文字数ベースで数える。1キーで `きゃ` のような複数文字を
直接出力する見出しは、その出力文字数ぶん分子へ入る。

```
Cbase = 単打面の直接入力で出力される文字数
C     = 打鍵可能だった全出力文字数
singleTapLayerRate = Cbase / C × 100       [%]
```

**11.5.2単打率**

**単打面の文字を出力するaction数 / 全action数**。

単打面の直接入力1件を1actionとして分子へ入れる。複数文字見出しでも1actionである。
ローマ字展開後の `k` / `a` などは、元のかな入力単位を直接出力するactionではないため
分子へ入れない。

```
S1 = 単打面の文字を直接出力するアクション数
A  = Policy適用後の総アクション数
singleTapRate = S1 / A × 100       [%]
```

単打面率とはauthorityは同じだが、分母・分子の単位が異なる。
たとえば1キーで `きゃ` を直接出す入力は、単打面率では2文字分、
単打率では1action分として数える。

**11.5.3 1キー率**

**freshに押す物理キーが1つだけのaction数 / 全action数**。

output / trigger / held-trigger / layer / modifierなどのsemanticは一切条件にしない。
ActionRealizationPolicy適用後のrealized Stroke列だけを見て、そのStrokeで新たに押す
physical keyの種類数が1なら分子へ入れる。

```
K1 = fresh physical keyが1つだけのアクション数
A  = Policy適用後の総アクション数
singleKeyRate = K1 / A × 100       [%]
```

したがってprefix shiftのtrigger-only action、hold継続中にfresh keyを1つ押すaction、
ローマ字入力の各英字actionも、fresh keyが1つなら1キーactionである。
逆に1actionで複数キーを同時入力する場合は分子へ入らない。

比較表では **単打面率 → 単打率 → 1キー率** の順に並べる。

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

**引く値は定数1uではなく、その物理配列・その指割り当てにおける実ホーム間隔。** row-staggeredと
ortholinear・split-ortholinearでは結果的に1.000だが、これは定義ではなくたまたまの値である。column-staggeredは
列ごとのYオフセット（指の長さの差を補正するために意図的に付けている）により隣接ホームの
2次元距離が1.005〜1.024uになる。これは「ホームですでに開いている」のではなく、
**その物理配列で最も無理のない姿勢**であって、開きとして数えるのは向きが逆になる。
定数1uを引くとcolumn-staggeredだけが下駄を履く。

**0でクランプしない。** 指の割り当てはユーザーが定義できるため、打鍵中に隣接指がホームより
近づく姿勢も作れる。「ホームより近い」は実際に起きうる状態であり、負のまま出す。

ペアごとに全打鍵にわたる**平均**と**実測の最大値**を出す。標準偏差も「ばらつき」として
併記してよいが、中心を表す値や裾を表す値の代わりにはしない。標準偏差は、スナップショットを取った
全打鍵（realized Stroke）の `E` を母集団とする母標準偏差（偏差の2乗の平均の平方根。`n` で割る）で、
打鍵が0件なら0とする（単位はすべて距離と同じu。
分散だと単位がu² になり、距離と比較しづらいため標準偏差を採る）。平均は普段どれだけ
開いているか、最大値は実際にどこまで開いたかを表す。値が大きいほど上下段をまたぐ運指が多い。
各ペアのホーム間隔を引く操作は、そのペアの平均・最大値を同じ定数分だけ平行移動するだけなので、
**標準偏差は変わらない**。

**指間距離の分布（状態別の頻度）**

平均・標準偏差・最大値を読むための補助として、ペアごとに `E` の分布を**状態別の頻度**で持つ。
`E` は打鍵位置の組み合わせで決まる離散的な値なので、固定幅の区間に分けず、同じ `E` の値を1つの状態として数える。

```
状態   s = round(E, 6)             [u]（小数第6位に丸める。-0 は 0 に揃える）
頻度   count(s) = round(E, 6) = s となる打鍵の数
割合   share(s) = count(s) / n × 100  [%]
```

- 母集団 `n` は、平均・標準偏差と同じ、スナップショットを取った全打鍵（realized Stroke）。
  そのペアの指がホームにある打鍵も数える。ホームにある打鍵の `E` は、他方の指の位置だけで決まる値として状態に入る。
  したがって頻度の総和は `n`、割合の総和は100%（打鍵が0件なら状態は無い）。
- 丸めは、同じ位置の組から別の計算順序で得た `E` が浮動小数の誤差（1e-15程度）で別の状態に分かれないようにするためで、
  小数第6位は、物理配列の座標が作る実際の状態の差（1e-3以上）よりずっと細かく、誤差よりずっと粗い。
  丸めの境目（小数第7位が5）の真上にちょうど載る値は、誤差でどちらの状態になるかが決まる。
  この丸めで防げるのは境目から離れた値の誤差までで、境目の真上の値は防げない。
- 状態の値は、ペアのホーム間隔を引いた後の `E` の値で、平均・最大値と同じ尺度（0 がホームに並んだ状態）。
- この分布は平均・標準偏差・最大値を変えない。それらは丸める前の `E` から求める。

**11.7同指連続回数**

`g = 0` で、かつ目標位置が同じ指の直前の位置と違うPressの出現回数。同じキーの連打は数えない。

**指ごとの内訳**

同指連続はPress（1本の指の1回の押下。同時押しで1本の指が複数キーを押しても1回）の単位で判定する。
指ごとの内訳も同じ単位で数える。

```
S_f = 指fのPressのうち、g = 0で目標位置が直前の位置と違うものの回数
P_f = 指fのPressの回数
```

- `Σ_f S_f` は全体の同指連続回数に等しい。`Σ_f P_f` は全Pressの数に等しい
- `P_f` は §11.2の `Q_f`（押したキーの数）とは別の量。1本の指が同時に複数キーを押すと `Q_f > P_f` になる
- 比率 `S_f / P_f` [%]（`P_f` が0の時は0）。その指が打った回数のうち、同指連続だった割合を表す
- 割合 `S_f / Σ_f S_f` [%]（`Σ_f S_f` が0の時は0）。全体の同指連続のうち、その指が占める割合を表す

判定規則（`g = 0` かつ目標位置が直前の位置と違う）は全体の回数と同じで、内訳のために変えない。

**11.8コンボ命中数**

コンボ定義数・命中した定義数・延べ命中回数を独立に出す。数える対象は、コンボ枠（§11.10）に帰属する見出しである。
コンボ枠に帰属するのは、配列のコンボ定義（`origin='combo'`）と、`compositionAggregation="combo"` の面が出す出力（`origin='face'`）。
`compositionAggregation="layer"` の面は層に帰属するので、ここでは数えない。

```
B = コンボ枠に帰属する見出しの数
U = 評価中に一度でも命中したコンボ枠の見出しの数
H = コンボ枠の見出しが命中した延べ回数
```

`B` は、コンボ定義の数に、コンボ枠の面が出す出力のうち、コンボ定義の見出しと重ならないものの数
（見出しごとに1件）を足した値である。面の数ではなく、その打ち方で使える出力の数で数える。
`U` と同じ単位（見出し）で数えるので、`U ≤ B` が常に成り立つ。

見出しが命中するのは、その見出しの選ばれたpath（`selected path`）がコンボ枠に帰属する時である。
同じ見出しが層にも打てる場合、層のpathが選ばれた打鍵は命中に数えない。同じ見出しが複数回当たる場合、
`U` は1件、`H` は回数分だけ増える。ヤ行コンボは §4.3の発火条件を満たした場合だけ命中として数える。
`B` はその打ち方で使えるコンボだけを数える。ローマ字を経ない打ち方（英文など）での `romajiOnly` のコンボ（§4.3）は `B` に入れない。
`B` は配列単位で数え、テキスト中のかな由来でない区間があっても変えない。
コンボ枠に帰属する見出しを持たない配列、およびその打ち方で使えるものが無い配列は `B = U = H = 0` とする。

**11.9 N感度曲線**

`N` を0〜10で振り、`D` の変化を記録する。`N=0` は、同じかなの中（`か` の `k` と `a` のように範囲が重なる入力どうし）だけ、
指を残す候補を持つ。

担当する指が1本のキーだけの割り当てでは、`N` を増やして `D` が減るのは `d_stay < d_home` の場面、すなわち
**前のキーが目標キーにホームより近い**場合に限られる。
担当する指が2本以上のキーを持つ割り当てでは、`N` が選ばれる指も変える（§9.1）ので、
この限りではない。同指連続を減らすためだけでなく、指の左右の入れ替わり・同じ指が近くに戻る打鍵・基本の指で打ったキーの数を
距離より先に比べる（§9.1の2.〜4.）ので、`D` が増えることもある。
したがって傾きが大きいほど、ホームから離れた位置での連続打鍵が多い。
傾きが小さい配列は、打鍵がホーム付近で完結している。

**11.10層ごとの打鍵数・割合とヒートマップ**

各キー押下を、その押下を含むステップの帰属先へちょうど1回だけ計上する。

- 通常の単一キー面は、その面の層へ計上する
- triggerの押下は、呼び出した面の層へ計上する。単打面からは引かない
- prefix / suffix面は、triggerと本体の両方を同じ層へ計上する
- 合成濁音のように複数の面を連結した `Sequence` は、各ステップを元の面の層へ分けて計上する
- `composition` の面は、面が宣言する `compositionAggregation`（§4）に従う。`"layer"` の面はtriggerと出力の両方を、
  面ごとに1つの層へ計上する。triggerのキーごとに1つの層になるよう、同じtriggerキーの `"layer"` の面は
  1配列に2枚以上置けない（配列の検証がエラーにする）。`"combo"` の面は、
  通常の層とは別のコンボ枠へ計上する
- triggerが2キー以上の面と、配列のコンボ定義は、常にコンボ枠へ計上する

同じ配列の中で、基本の打ち方に当たる面（かわせみ配列+の行指定キーの面、新小梅の文字キー同時押しの面）は層、
基本の打ち方から外れた拡張（かわせみ配列+の二重母音拡張と左手コンボ拡張、トリガーが2キー以上の面）はコンボ枠に数える。
どの面がどちらかは配列の定義が宣言する。

層 `l` の押下数を `Q_l`、コンボ枠の押下数を `Q_combo` とすると、保存則は次のとおり。

```
Σ_l Q_l + Q_combo = Σ_f Q_f = 押下キー数
```

割合は全押下キー数を分母にする。

```
share_l = Q_l / 押下キー数
share_combo = Q_combo / 押下キー数
```

層ごとの図（Analyzerのヒートマップ（レイヤー）。以下、層別図）は各層に帰属するキー押下数を物理キー位置へ戻して描く。全部のレイヤーを合わせた図（Analyzerのヒートマップ）は、層別図とは別の図である。層操作のために押した
トリガーキーの押下分だけは、層別図の色計算から除いて表示上のスケールを正規化する。
同じ物理キーが別の面の出力キーにもなる場合、その出力としての押下分は色計算に残す。
実際の押下数・保存則・ツールチップの値からは何も除外しない。トリガー押下を除いたキー
押下数の最大値は、層別図をタブで切り替える表示でも隠れた層を含め、層別図の全部で共通にする。全部のレイヤーを合わせた図は、
全キーの押下数で色付けする。これにより、層操作キーの常時押下で色が飽和することを防ぎ
つつ、層キー同士の入力で生じる出力キーの使用量も表示できる。
相互シフトの同時打鍵層では、関係する文字トリガーを2個以上実際に同時押下したステップに
限り、押下した両方のトリガーを表示色に残す。トリガー1個と出力キー1個の通常の同時打鍵では、
トリガーを除外する。これは表示だけの補助であり、集計値には影響しない。
薙刀式の「2面にまとめる」表示では、スペースを使わないレイヤー3以降を単打側へ合算する。
この合算表示に限り、合算したレイヤーで文字トリガーを2個以上同時押下した実トリガーを
単打側の出力として色に残す。トリガー1個の押下は除外し、全レイヤー詳細表示でも通常どおり
層操作キーとして除外する。

この最大値を取る図の組は、表示中の層の分け方（「2面にまとめる」か全レイヤー詳細か）で並ぶ図の全部である。
分け方を切り替えると、組が変わるので最大値も変わる。

全部のレイヤーを合わせた図（Analyzerのヒートマップ。層別図とは別の図）の色の強度は、全キーの押下数 `c` を
最大値 `M` で割った `t = c / M`（線形）とする。最大値を取る図の組は、図を1つだけ出す時はその図自身である。
単体の画面で、Singleの対象の図に加えてMultiの集合の対象の図を並べる時は、並べた図の全部
（Singleの対象の図と、集合の対象のうち計算できた対象の図）にわたって、全キーの押下数の最大値を取って `M` とする。
計算できない対象は組に入れない。これにより、同じ押下数のキーは並べた図のどれでも同じ濃さになる。
並べた図の押下数は、各対象をSingleの対象として選んだ時の押下数と同じで、色の尺度だけが組で決まる。

層別図の色の尺度は線形を標準とし、画面上で対数へ切り替えられる。トリガーを除いたキーの
押下数を `c`、層別図の全部（タブで隠れた層を含む）にわたる最大値を `M` とすると、線形では `t = c / M`、対数では
`t = log(1 + c) / log(1 + M)` を色の強度に使う。これは表示上の変換であり、押下数や
割合の値は変えない。全部のレイヤーを合わせた図は常に線形とする。

**11.11キーの詳細**

キーボード図のキーごとに、そのキーの使われ方を集計する。数値は§9までの距離モデルから導く
追加の集計で、距離・押下数など他の指標の値は変えない。

*単位。* 集計の単位は「面 × 物理キーid」とする。面はTraceの `aggregationGroupId` の値で、
コンボの面（§11.10のコンボ枠）も1つの面に含める。§11.10の「層」はコンボ枠を含まない単位なので、
面とは別の語である。面をまたいで物理キーidごとに合算した値も出す。値は1つの対象
（配列 × 物理配列 × テキスト × 条件）のTraceから出る。

*数え方。* どの量も、1つのPressの `keys` の1キーを1回として数える。1つのPressが複数のキー
（§4.2）を持つ時は、各キーに1回ずつ数え、按分しない。面ごとの押下数の和は、全押下キー数
（§11.10の `Σ_f Q_f`）に等しい。

キー `k` について、次の5つを整数の回数で持つ。割合は表示側で求める。

1. **押下数** `Q_k`: `k` を含むPressの数。
2. **押し方の内訳**: 押下を、その指の参加（Strokeの `participations` のうち、そのPressの指の項目）が持つ役の組ごとに数える。
   役は「出力」「トリガー」「押したままのトリガー」で、参加は指ごとに1つ、役はその指の全キーに対する和である。
   役の組は並べ替えて正規化した1つの値とし、役が1つも無い時は「役なし」として数える。内訳の回数の和は `Q_k` に等しい。
   押下を持たない保持だけの参加は数えない。
3. **前の文字**: `k` を押したStrokeの入力単位（`inputIndex` が同じStrokeのまとまり）の、1つ前の入力単位が持つ `inputChar`
   ごとに数える。「1つ前」は、`inputIndex` が変わる直前のStrokeである。`inputChar` は文字列のまま1つの値として扱い、
   2文字以上でも分けない。打てずに飛ばした文字（`skipped`）を挟んでも、直前のStrokeの `inputChar` を使う。
   1つの入力単位に含まれるStrokeとPress（トリガーを含む）は、どれも同じ「前の文字」を持つ。
   先頭の入力単位は「前の文字なし」として別に数える。ローマ字では、同じかなを打つ複数の打鍵が同じ前の文字を持つ。
   前の文字の回数と「前の文字なし」の和は `Q_k` に等しい。
4. **移動の起点**: そのPressの距離（§9）が採用した候補の起点を、位置ごとに数える。
   起点は§9の表で採用された候補が決める。`d_stay` が採用されれば直前の位置（`prev[f]`）、`d_home` が採用されればその指のホーム
   （`H_f`）である。`g>0` かつ `ΔI ≤ N` で候補が同値の時は `d_stay`、すなわち直前の位置とする。
   その指の最初の打鍵では `lastEnd[f] = -∞` なので `ΔI = ∞ > N` となり、`d_home` が採用される。起点はホームで、ホームから来た回数に数える。
   `g=0` かつ目標がその指のホームキーかつ `sfb_home_cost` が偽の時は、距離が0に固定される（§8）。`g=0` ではホームへ戻る時間が無く、
   `d_home` は候補にならない。候補は `d_stay` だけなので、起点は直前の位置とする。この押下だけは、起点から目標までの距離が記録された距離0と一致しない
   （直前の位置が目標と同じ時を除く）。
   起点は物理キーidではなく位置で持つ。位置は小数第3位で丸め、物理配列の全キー（親指を含む）の丸めた位置と一致するキーのidを全部併せて持つ。
   一致するキーが無ければ空とする（同時押しの後の重心など）。
   親指が親指キー以外のキーを打った時の距離は、起点が親指キーかどうかで§3.1の1uになるので、起点から目標までの座標の距離とは一致しない。
   位置ごとに、直前の位置から来た回数とホームから来た回数を分けて持つ。位置ごとの回数の和は `Q_k` に等しい。
   起点は§9の判定の結果としてTraceに記録した値を読み、集計の側で§9の規則を再現しない。
5. **距離の分布**: `k` を含むPressの距離（§11.1の `cost`）ごとに数える。1つのPressが複数のキーを持つ時は、
   Pressの距離をキーの数で按分せず、各キーに同じ距離として1回ずつ数える。値は小数第3位で丸めた距離で区別する。
   距離ごとの回数の和は `Q_k` に等しい。

*複数の面の合算。* 面を選んで合算した値（レイヤーをまとめて見せる図など）は、選んだ面の値を量ごとに足したものとする。
押下数・押し方・前の文字・前の文字なし・距離の分布は同じ項目の回数を足し、移動の起点は位置が同じものの回数を足す。
全部の面を合算した値は、面をまたいだ合算と一致する。

入力パターン（どの打鍵でどの出力になるか）とトリガーのガイドは、配列の定義から出すので、この集計には含めない。

**11.12 Bigramの組の種類数**

テキストを打った時に実際に現れた、続けて打つ2回の打鍵の組が何種類あるかを数える。配列の全キーから作れる組の数は出さない。
距離・同指連続とは別の量で、配列が打ち手に求める運動の種類の多さを見る。優劣は付けない。

*1打。* Traceの隣り合うStrokeをそのまま組にせず、先に1打にまとめる。文字を出すStroke
（`output` の参加を持つStroke）が1打の核になる。文字を出さないStroke（`trigger` だけを持つ、前置・後置シフトなどの層の操作のStroke）は、
同じ入力の選択（`selectionIndex` が同じ）の中で、自分より後に文字を出すStrokeがあればその最初のものに、無ければ直前の文字を出すStrokeに束ねる。
前置は次の、後置は前の文字を出すStrokeと1打になる。押しっぱなしのトリガー（`held-trigger`）は文字を出すStrokeの中にあるので、束ねる操作は要らない。
Trace・§11.7を含む他の指標は変えない。この指標を数える時だけ束ねる。

*要素。* 1打から2種類の要素を作る。

- **物理キーの要素**: その1打で文字を出したキーの集合。トリガーのキーは入れない。
- **シフトを含む要素**: 物理キーの要素と、その1打のトリガーのキー（束ねたStrokeのトリガーのキーと、文字を出すStrokeの `trigger`・`held-trigger` のキー）の集合の組。
  トリガーのキーはキーごとに区別する（左シフトと右シフト、左右の親指シフトは別の要素）。

役はキーごとに決める。1本の指が文字を出すキーとトリガーのキーを同時に押す打鍵（JISかな配列の左小指で押す Shift と Z など）では、
Strokeがトリガーとして挙げたキーをトリガーとして数え、残りの文字を出す参加のキーを文字を出すキーとして数える。
参加の役は指ごとにまとめた値なので、キーの役の判定には使わない。

*数え方。* 組は束ねた後の隣り合う2打 `(A, B)`。順序を持ち、`A→B` と `B→A` は別の組。親指で打つキーも含め、手の区別で飛ばさない。
要素ごとに、テキスト全体に現れた異なる組の数を数える。1打が1つ以下なら0。
打てない文字は打鍵にならないので、その前後の打鍵は隣り合うものとして組にする（Traceの並びに従う）。

この値はTraceと打鍵の列だけから決まり、条件（§12.3）は距離と同じものが付く。

## 12. 数値の性質

### 12.1下界である

担当する指が1本のキーだけの割り当てでは、出力される総移動距離は**下界**である。指は決まっていて、
指を前のキーに残すかホームへ戻すかを `N` かな先まで見て比べ、小さい方を採る（§7 R4）からである。実際の運指はこれ以上になる。

担当する指が2本以上のキーを持つ割り当てで下界と言えるのは、その部分（選んだ指の下で、残すかホームへ戻すかを比べる部分）だけである。
指は総移動距離が最小になるようには選ばない。同指連続・指の左右の入れ替わり・同じ指が近くに戻る打鍵・基本の指で打ったキーの数を距離より先に比べる（§9.1）ので、
担当する指を足すと、総移動距離が足す前より長くなることがある。また、指の選び方は範囲（`N` かな）を区切って確定していくので、文章全体で見ると、
担当する指を足した時に同指連続の数が増える場合も無いとは言えない。

配列間の比較には使えるが、絶対値は楽観側に振れている。
絶対値を提示する場合はこの性質を併記する。

### 12.2コンボ・同時押しは距離軸に現れない

コンボ（複数キーの同時押しで1文字を出す）や同時押しは、指の移動そのものを
減らす最適化ではなく「複数打鍵を1打にまとめる」最適化である（仮定1・§4.1）。
まとめても押すキーと移動距離は変わらないため、一次的な効果は距離ではなく
**打鍵数（ステップ数）**に出る。

したがって、コンボ化は総距離を必ず減らすとは限らない。むしろステップが減った分
だけ他の指の `g`（§7）が伸びるため、同指連続（sfb）が増えて総距離が増える配列もある。

実測（かな1676文字、N=3、row-staggered、指の割り当ては既定、綴りは訓令式。コンボありは、TK音直入力法のコンボ定義を各配列に足して測った）:

| 配列 | コンボなし | コンボあり | 同指連続 |
|---|---|---|---|
| QWERTY | 1915u | 1764u | 238 → 231 |
| Colemak-DH | 986u | 1047u | 42 → 117 |
| 大西配列 | 1049u | 1058u | 38 → 75 |

移動の多い配列（QWERTY）ではコンボが総距離を減らす方向に、
移動がすでに最小化された配列（Colemak-DH・大西配列）では増やす方向に働く。

綴りを揃えないと比較にならない。上表の大西配列は訓令式で打った場合であり、
大西式綴り（シャ行 `sh` / じ `ji`）では新サンプルのコンボなしで1041u・同指連続32になる（§4.4）。
総距離だけを見て「コンボは効果がない」「コンボは悪化させる」と読むのは早計であり、
そもそもコンボが効く軸（打鍵数）と本モデルが測る軸（距離）が異なる。

コンボ・かな直接入力による打鍵数削減の効果は、入力文字あたりのアクション数
（§11.5。ステップ数を入力文字数で割った指標）に直接出る。入力文字あたりの
総移動距離（§11.4）にも二次的に効くが、そちらは指の移動距離という別の量を
測っているため、打鍵数削減の効果だけを読みたいときは §11.5を見る。どのコンボ定義が
実際に効いたかは §11.8の命中数で確認する。

### 12.3測定条件は数値に付随する

物理配列・指割り当て・窓幅 `N`・綴りの規則など、**測定条件を変えると数値は変わる**。
これは事実の記述であって、条件の違う数値を並べてはならないという規則ではない。

比べ方はモデルが決めることではない。配列ごとに適した物理配列を選んで「その配列の最良」
同士を比べるのも、物理配列を固定して論理配列だけを比べるのも、どちらも成立する問いである。
前者は「この配列を本気で使うとどこまで行くか」を、後者は「同じ土俵で配列の差だけを見るか」
を測っており、片方を正解とする根拠はモデルの側に無い。

したがって条件は**配列ごとに変えられる**。モデルが負う責務は比較の可否を裁定することではなく、
**どの条件で出した数値かを常に数値と一緒に運ぶこと**である。

- 出力（`Metrics`）は使用した条件を保持する。担当する指が2本以上のキーを持つ割り当てで測ったことは、
  条件の要約に分かる形で出す
- 画面は、既定と異なる条件で測った配列について、その差分を数値のそばに示す
- 数値を持ち出す時（書き出し・共有）は、条件を同じ入れ物に入れて運ぶ
- 漢字を読みに直して評価した数値（§4.6の1段目）は、読みの辞書の名前と版、解析器の名前と版を、条件のスナップショットに持つ。
  読みは辞書と解析器の版で変わるので、同じテキストと設定でも、版が違えば数値が変わりうる。
  画面は条件の要約に「読みの辞書: IPADIC（6.2.0）」のように辞書の名前と版を出し、解析器の名前は出さない（スナップショットと書き出しにだけ入れる）。
  辞書を読み込めず漢字を読みに直さずに評価した数値は、読みに直していないことを同じ場所に出す。
  漢字を含まない日本語のテキストと英語のテキストは読みに直す対象でないので、何も付けない。
  読みの辞書と解析器の版は設定項目ではない。利用者が選ぶものではなく、アプリが持つ版が決める
- 利用者が直した読み（§4.6の1段目）で測った数値は、テキストに現れて直しが当たった表記だけについて、表記と読みの対応全体を条件のスナップショットに持つ。
  当たらなかった直し（テキストを編集して現れなくなった表記など）は入れない。同じ数でも中身の違う直しを区別するため、数ではなく対応そのものを持つ。
  画面は条件の要約に、読みを直したことと、直しが当たった表記の数を出す。
  直しは利用者が与える条件で、モデルの挙動を変えない。直していないテキストの数値は、直しの機能が無い時と同じである

読み手が条件を見て比較の意味を判断できる限り、条件を揃えることは要求しない。

#### 条件の解決順

条件の各項目は、次の順に上書きを重ねて解決する（左が弱く、右が強い。`input/settings/levels.ts`）。

```
既定値 → 全体 → Workspace → 物理配列 → 打ち方 → 配列 → Setup
```

- **Workspaceのレベルは、そのWorkspaceが自分の条件として持つ。** 値はWorkspaceの資産に入り、
  そのWorkspaceに載ったペインの数値にだけ入る。他のWorkspaceと単体ページには入らない
- **単体ページはWorkspaceのレベルを持たない。** 単体ページでの条件の変更は全体へ書く。
  同じ配列・同じSetupでも、Workspaceが違えばWorkspaceのレベルの値の分だけ数値が変わりうる。
  そのため画面は、Workspaceのレベルの値が使われている項目に、出どころとして「Workspaceで変更」を示す（本節の「画面は…差分を示す」と同じ要求）
- Workspaceのレベルに値が無ければ、解決は全体のレベルだけの時と同じ結果になる（Workspaceを持たない時の数値は動かない）
- 配列の推奨（`romajiRuleId`・`fingerAssignmentId`）は、配列のレベルの手前で、全体・Workspace・物理配列・打ち方のレベルの値に勝つ
- Traceの数値に入らず、配列を比べる時に混ぜない項目のうち、複数のAnalyzerが読むものは、全体とWorkspaceのレベルまでに置き、
  物理配列・打ち方・配列・Setupのレベルには置かない。解釈（`chainInterpretation` / `arpeggioInterpretation`）がこれにあたる
  （Traceは同じまま、数値の定義だけが変わる。Workspaceの中のペインは同じ条件で並ぶ）
- 評価に渡すテキストの前処理を決める項目（`keepSymbols`、§4.6）は、Traceの入力そのものを変え、全部のAnalyzerが読む。
  配列ごとに分母（入力文字数）が変わると比べられなくなるので、全体とWorkspaceのレベルまでに置き、物理配列・打ち方・配列・Setupのレベルには置かない
- 今1つのAnalyzerだけが読む項目は、数値を変えるものでも、そのAnalyzerの解析設定に置き、条件には置かない。
  再生の時間モデルの項目（基準速度・再生倍率・同じ指の移動時間の考慮・全指の移動時間で律速・個人速度の適用。
  `spec/playback-timing.md` §2）と、再生速度の平均の項目（方式・窓幅・半減時間。同 §5）は、打鍵再生の解析設定に置く。
  別のAnalyzerもその項目を読むようになった時に、条件へ移す
- 再生の時間モデルと再生速度の平均の項目は距離の指標を動かさないので、`Metrics` の条件のスナップショットには入れない。
  これらで動く数値（再生の時間と速度グラフ）を出す打鍵再生のペインが、ペインの中で、解析設定の小窓を開かなくても
  既定と違う値で計算していることが分かるように示す（`spec/playback-timing.md` §2.2）
