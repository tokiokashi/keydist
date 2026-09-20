# Keyboard analysis model

keydist の構造解析で使う用語と集計単位をまとめる。一般的なキーボード配列解析の用語と、
keydist 固有の内部モデルは同じものではないため、以下では分けて扱う。

## 一般的な概念

- **bigram**: 連続する2打の組。2打間の関係を見る単位。
- **trigram**: 連続する3打の組。方向反転など、2つの連続Transitionを合わせて見る単位。
- **SFB (same-finger bigram)**: 同じ指を連続して使うbigram。keydistでは構造解析上の
  SFB eventと、従来の距離指標 `metrics.sameFinger` は集計目的が異なる。
- **roll**: 同じ手で指順が一方向へ進む連続打鍵を指す一般語。定義の細部は解析器ごとに異なる。
- **redirect**: 同じ手の指順が3打の途中で反転するtrigramを指す一般語。
- **alternation**: 左右の手を交互に使う系列。keydistではHand Rhythm / Alternationを
  Chainとは別の解析軸として扱い、#196 の範囲に残す。
- **weak redirect / weak-ish redirect**: 配列解析で使われることがある、
  redirectを指の組合せ等で細分する呼び方。keydistの現在の構造結果には
  この名称のbooleanや独立Runを保存しない。必要ならRedirectCandidate等のfactから後段で分類する。

## keydist の構造モデル

### Canonical input / Stroke

Face / Sequence はauthoring表現であり、構造解析のsource of truthではない。
authoring後はlogical outputごとに複数の具体input pathを保持する。

```text
Face / Sequence / combo authoring
        ↓ compile / normalize
CanonicalInputMap
  logical output
    ├ InputAlternative A
    │   ├ SemanticInputSequence
    │   ├ BaseActionRealizationSequence
    │   ├ contextRequirements
    │   └ origin
    └ InputAlternative B ...
        ↓ context requirement filter
eligible InputAlternative[]
        ↓ Input Alternative Selection Policy
selected BaseActionRealizationSequence
        ↓ TriggerRealizationPolicy
RealizedSemanticAction
        ↓
Stroke
```

1つの `SemanticInput` は1つの具体activationを表し、RequirementはANDだけを持つ。
同じlogical outputへ複数の合法なphysical pathがある場合はORをSemanticInputへ入れず、
`InputAlternative[]` として上位に保持する。

例:

```text
「あ」
  alt A -> f
  alt B -> j

「お」
  alt A -> thumb-l + j
  alt B -> thumb-r + j
```

reciprocal Faceのように同じSemanticInputを別のauthoring viewから記述した場合は
alternativeを増やさず、同じSemanticInputへCapability / role / Face membershipをunionし、
BaseActionRealizationのdefault / alternate participation viewとして保持する。

CanonicalInputMap完成時にはkeymap境界のactivation conflictを共通validationする。
異なるlogical outputに同じcanonical activation pathがある場合、または同じphysicalKeysで
Requirement setが両立し得る場合は曖昧なのでrejectする。Capability / classification /
action groupingの差はactivation排他の根拠にしない。逆向きorder等、Requirementから
mutually exclusiveと証明できるpathは共存できる。sequence長違い等のprecedenceは別設計とする。

canonical pathを追加するconstructor / transformは、同じlogical outputに既存pathがあっても
canonical alternativeを上書きせずappendする。legacy `Layout.map` はauthoring default /
presentation互換として先頭pathだけを保持してよいが、canonical alternativesを失ってはならない。

physical activation以外の成立条件は `InputAlternative.contextRequirements` に保持する。
また、pathを生成したtop-level authoring provenanceは `InputAlternative.origin` に保持する。
現在は `sequence / face / combo / composed` を持ち、classificationやlayerIdから逆推測しない。
`comboHits` は実際にselectedされた `origin='combo'` pathだけを数える。
現在は `{ kind: 'youon-only' }` を持ち、logical output全体ではなくそのpathだけへ適用する。
runtimeではまずcontext requirementを満たすalternativeだけをeligibleに絞り、1つも無ければ
その見出し自体を不成立として短い見出しへfallbackする。その後にselection policyを適用する。
`Layout.comboConditions` はlegacy/presentation provenanceであり、evaluate legalityのauthorityではない。

`preferOppositeThumb` はphysical key rewriteではなくalternative selection policyである。
左右どちらの親指も合法なpathとしてauthoring時にcanonicalへ入り、policyがoutputと反対側の
親指を使うpathを優先する。既定ではauthoring上の先頭alternativeを使う。
このPolicyはauthoring defaultとthumb keyだけが異なる合法variantに候補を限定し、
thumb alternative派生時のdedupeはaction列だけではなくcanonical alternative全体のidentityで行う。
Requirement / Capability / classification / role / layer / context / origin等が異なるpathは保持する。

opposite-hand variantが無ければdefaultを維持する。同じoutputのnon-thumb pathや
別方式alternativeへ `preferOppositeThumb` だけを理由に切り替えない。

Strokeはselected alternativeをrealizeした結果から生成する。
`stepLayers / stepTriggerKeys / stepSemantics / StepSemantic` はcanonical cutover後に削除済みで、
legacy `Layout.map` だけをauthoring default / presentation互換として残している。

### Semantic role / classification

canonical semanticでは異なる軸を混ぜない。

- `roles`: key単位の特別なsemantic role。現在は `modifier` のみ。
- `requirements`: physical activation上のoverlap / order成立条件。
- `contextRequirements`: path単位のruntime context成立条件。
- `capabilities`: while-held等のrealization能力。
- `layerId`: aggregation上の帰属先。
- `classifications`: 他のfactから再構成できないauthor intent。
- `InputAlternative.origin`: path生成元のtop-level authoring provenance。
- `faceMemberships`: presentation provenance。

`composition` はkey roleではなくclassificationであり、`layerId='combo'` から逆推測しない。
語彙拡張・拗音拡張・撥音拡張・入声拡張・二重母音拡張もpresentation labelだけに落とさず、
stable classification IDとしてcanonical inputへ保持する。geometry、左右hand、距離、
currently-held、preferred alternative等の導出可能factはcanonicalへ重複保存しない。

compatibility用の旧 `InputRole` はStroke生成時にcanonical classification / roleから導出する。

### Trigger realization

Trigger realizationは

```text
SemanticInput.requirements / capabilities
+ BaseActionRealization default/alternate participation
+ TriggerHoldState
+ TriggerRealizationPolicy
        ↓
realizeTriggerActions()
        ↓
RealizedSemanticAction
```

で行う。旧 `StepSemantic / associatedTriggerKeys / associatedTriggerPersistence` は
canonical cutover後に削除済みで、Trigger realizationはcanonical factだけを入力にする。

`while-held` Capabilityは保持できる能力であって、必ずholdする指定ではない。
既定 `useHold=false` ではbase realizationをそのまま使う。`useHold=true` の場合だけ、
active hold groupとCapability / Requirementを照合して継続可否を決める。

- active hold groupはCapabilityのkey groupとexact matchする場合だけ候補になる
- CapabilityがあってもRequirementを免除しない
- prefixの `order(trigger -> target)` はheld triggerを先行状態として継続できる
- suffixの `order(target -> trigger)` はtriggerを前入力から保持したまま次targetへ進めない
- `defaultHoldKeys` はauthoring/default realizationで選ばれたhold groupで、SemanticInput identityではない
- reciprocal inputではactive hold groupに応じてalternate participation viewを選べる
- held keyを除くとlogical outputを発生させるfresh physical eventが消える場合はcontinueせずrelease/restartする
- 明示的なrelease専用Stroke/eventは現段階では作らない

実際にrealizeされたStroke streamだけをRaw hand run以降へ渡し、
Chain / Transition / Timingが独自にhold可能性を再判定しない。

Trigger realizationの後に `ActionRealizationPolicy` を適用し、同じ入力事実を
どのaction列として解析するかを決める。現在の `holdStart` は `combined | separate` を持つ。
`separate` ではlayer / modifierのoutputと同一actionにrealizeされた `held-trigger/start` を
先行trigger actionと、held state下のfresh output actionへ分ける。compositionと、
prefix trigger-only actionのように既に分離済みの操作は変換しない。

この変換はStroke生成**前**に行うため、Metricsだけのvirtual +1は行わない。
Chain / Transition / Metrics / Timing / Playbackはすべて同じPolicy適用後Stroke streamを見る。
UIに残る旧 `holdStartAction.countAsSeparateStep` は保存形式のcompatibility adapterであり、
condition resolution境界で `ActionRealizationPolicy.holdStart` へ変換する。

### Raw hand run / Analysis Chain

**Raw hand run** は、各手がStroke列へ連続して参加したというfactだけを集めた区間。
ここには良し悪しやRoll判定を入れない。

**Analysis Chain** はRaw hand runへ **ChainPolicy** を適用した解析用区間。
現在のPolicyは次の4条件を独立に持つ。

- 非親指SFB Strokeで区切るか
- trigger-only Strokeで区切るか
- 親指only Strokeで区切るか
- 逆手の同時outputで区切るか

親指only境界は既定で有効。trigger-onlyとは独立して設定できる。

### HandTransition / FingerTransition

Analysis Chain内の隣接Stroke pairから、手ごとに **HandTransition** を作る。
各Strokeに同じ手のPressが複数ある場合は、Press×Pressの候補を
**FingerTransition** として全部残す。代表1件へ先に潰さない。

FingerTransitionは inward / outward / same、finger step、dx / dy等のfactを保持する。
geometryは品質分析に使える事実であり、Roll成立条件へ暗黙に逆流させない。

### LongRoll / RollElement / TwoRoll

**LongRoll** は同一Analysis Chain内で同方向Transitionが2本以上、つまり3 Stroke以上続く
maximalな区間。部分LongRollを重ねて作らない。finger jumpだけを理由に除外しない。

**RollElement** はRollの構成を参照するための概念で、Transition詳細を重複コピーしない。

**TwoRoll** はLongRollに含まれない独立した2 Stroke directional pair。
LongRollとTwoRollは排他的で、`AnyRoll = LongRoll ∪ TwoRoll`。

### RedirectEvent / RedirectCandidate

3 Stroke windowで inward ↔ outward が反転し、前後のTransitionが同じpivot Press /
participationを通る場合、そのwindowを **RedirectEvent** とする。

成立pathは **RedirectCandidate** として複数保持できるが、candidate数にかかわらず
1 windowのEventは最大1件。別pivot同士の候補を継ぎ接ぎして架空のredirectを作らない。

Redirectの**構造**と物理geometryの**quality**は分離する。各RedirectCandidateについて、
前後Transitionの `dx` が物理的にも反転する場合だけ、pivotを境にx方向へ実際に
引き返した共通量を次で導出する。

```text
horizontalReversal =
  sign(before.dx) != sign(after.dx)
    ? min(abs(before.dx), abs(after.dx))
    : 0
```

単位は `u`。finger-direction上はRedirectでもphysical xが反転しなければ0になる。
この値はcandidateごとのraw quality factであり、Event単位のmax/minや閾値判定へ
自動集約しない。また、この値によってRedirectEvent / Roll / ArpeggioSpanを削除しない。

### ArpeggioSpan / ArpeggioPolicy

keydistの **Arpeggio** は一般語としてのrollそのものではなく、LongRoll / standalone TwoRollへ
**ArpeggioPolicy** を適用して得る派生Span。

Policyは次の3項目だけを持つ。

- `includeThumb`: output親指を含むRollをcoreとして採用する
- `bridgeSameFinger`: same Transitionを中立bridgeとしてSpanだけを拡張する
- `includeSingleRedirectTail`: 末尾直後の逆方向1 Transitionだけを吸収する

旧 `minHorizontalSpread` / `maxRowReversal` / `maxRowStep` /
`breakOnOppositeHand` はArpeggio構造条件ではない。geometry / reversalを品質分析として
再導入する場合は#184で別軸として定義する。

ArpeggioSpanはoverlapを許容する。隣接しただけのSpanもmergeしない。
UIもこのSpanをconsumerとして表示し、表示都合で再分類しない。

### StrokeAnnotation

各Strokeへ `inLongRoll` / `inTwoRoll` / `inArpeggio` /
`inRedirect` / `inSfb` を非排他的に投影する。
たとえば同じStrokeがArpeggioかつSFBでもよく、単一カテゴリへ潰さない。

長文の簡易表示やcoverageはこのAnnotationを参照できる。

## raw countとcoverage

構造指標は「何を1件と数えるか」と「何Strokeが関与したか」を分ける。

- **raw count**: Event / Spanそのものの件数。SFB Eventが2件なら2。
- **coverage**: 対象Event / Spanに含まれるStroke indexのunion。
- **rate**: coverageのユニークStroke数を、解析対象Stroke数で割った値。

たとえば `A → A → A` ではSFB Eventは2件だが、関与Strokeは3。
overlapするArpeggioSpanが2件あっても、重複Strokeをcoverageで二重計上しない。

したがって、raw countとcoverageは互いの代用品ではなく、分母・集計単位を明示して読む。

## Calibrationと構造解析

構造解析は「どのStroke/Transitionがどの構造に属するか」を決め、
**Calibration** は「そのTransitionにどれだけ時間を割り当てるか」を決める。
両者は分離する。

Playback TimingはTransitionを1回だけ評価し、同手別指では有向指ペア、
異手ではL→R / R→LのCalibrationを使う。ArpeggioSpan所属そのものをduration sourceにせず、
overlap Spanでも同じTransition時間を重複適用しない。

旧 `arpeggioEnabled` / `arpeggioDelayMode` / lead delayはTiming modelから廃止した。
方向別測定も「Arpeggio専用速度」ではなくTransition Calibrationとして扱う。

## 解析軸の境界

- Hand Rhythm / Alternationは#196で扱い、Chainへ吸収しない。
- geometry / reversal品質は#184で扱い、Arpeggio構造定義へ戻さない。
- 親指onlyのChainPolicy既定値は未決事項を本モデルから推測しない。
