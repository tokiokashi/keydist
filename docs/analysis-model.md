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

### Strokeとsemantic role

長文は文字単位ではなく、正規化された **Stroke** の列として解析する。
1 Stroke内には複数Pressを持てるため、同時押しも1ステップとして保持できる。

- **InputRole**: 入力の役割。layer操作や通常出力など、入力列上の意味を表す。
- **FaceMode**: `prefix` / `suffix` / `simultaneous` など、面をどう発火するかを表す。
- **TriggerPersistence**: triggerがそのStrokeだけのactivationか、後続へ保持されるかを表す。

これらはsemantic normalizationの材料であり、それ自体を「Chainを切る」等の規則へ
自動変換しない。構造境界は明示的なPolicyで決める。

### Trigger realization

`TriggerPersistence='hold-capable'` は保持できる能力であり、base normalizationの時点では
通常の `trigger` として残す。評価条件 `TriggerRealizationPolicy.useHold` を有効にした時だけ、
`associatedTriggerKeys` がactive holdのtrigger集合と完全一致する区間を実際の保持へrealizeする。layer idは継続判定に使わない。

- 区間先頭: 新規 `trigger` + `held-trigger/start`
- 継続Stroke: triggerを再押下せず `held-trigger/continue`
- `single` triggerはholdへ昇格しない
- prefix / suffix のoutput stepにも元Faceのtrigger集合を `associatedTriggerKeys` として持たせる
- trigger集合は部分一致ではなく完全一致で継続判定する
- active holdとassociationが一致しないstepの直前をrelease境界とする
- 保持中triggerキー自身がoutputでもある場合はcontinueせずrelease/restartし、新規Pressと `held-trigger/start` にする
- 明示的なrelease専用Stroke/eventは現段階では作らず、将来のPress/Release event形式を先取りして固定しない

既定は `useHold=false` で、従来のStroke列と評価値を維持する。実際にrealizeされた
Stroke streamだけをRaw hand run以降へ渡し、Chain / Transition / Timingが独自にhold判定しない。

`HoldStartActionPolicy` はこのrealizationとは別の**計上Policy**。realize済み
`held-trigger/start` がoutputと同じStrokeにある場合だけ、必要なら+1の独立actionとして数える。
prefix trigger-only Strokeのように既に独立している操作は二重計上しない。Policyを変えても
Stroke列、Press数、距離、構造解析、Timingは書き換えない。

### Raw hand run / Analysis Chain

**Raw hand run** は、各手がStroke列へ連続して参加したというfactだけを集めた区間。
ここには良し悪しやRoll判定を入れない。

**Analysis Chain** はRaw hand runへ **ChainPolicy** を適用した解析用区間。
現在のPolicyは次の3条件を独立に持つ。

- 非親指SFB Strokeで区切るか
- trigger-only Strokeで区切るか
- 逆手の同時outputで区切るか

親指onlyをどのように境界扱いするかは未決事項であり、現在の既定値から推測しない。

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
