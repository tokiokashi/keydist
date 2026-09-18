# 打鍵再生 時間モデル仕様

本書は**打鍵再生が1ステップをどれだけの時間で表示するか**を定める。
対象は `src/playback.ts` と `src/playback-calibration.ts` に加え、#200 で定義した
structural analysis の結果を Timing が受け取る境界である。

依存方向は次の一方向とする。

```
Layout definition
  ↓
Stroke semantic normalization
  ↓
Raw hand run
  ↓ ChainPolicy
Analysis Chain
  ↓
Transition facts
  ↓
LongRoll / TwoRoll / Redirect / SFB
  ↓ ArpeggioPolicy
ArpeggioSpan
  ↓
Structural result

PlaybackCalibration ───────────────┐
                                  ↓
Structural result ───────────→ Timing
```

構造解析は `PlaybackCalibration`、速度、時間、`stepMs` を参照しない。
逆に Calibration は Chain / Roll / Redirect / Arpeggio の判定を行わない。
**Timing だけが structural result と Calibration を結合する。**

## 1. 目的と、距離モデルとの関係

`spec/distance-model.md` が定める距離モデルは**時間の概念を持たない**。
出力は u（キーピッチ）の一次元であり、打鍵の速さも間隔も現れない。

本モデルはそれとは別の軸として、**再生の見え方のための時間**を定める。
両者を分ける理由は2つある。

1. 距離モデルの数値は打鍵者に依存しない。時間は打鍵者に強く依存する
2. 時間を距離モデルへ持ち込むと、指の速さという個人差を配列の評価へ混ぜることになる

本モデルの数値は**配列の評価に使わない**。使うのは再生の表示と、
再生から導く実効速度の表示（§5）だけである。

距離 [u] が時間へ入る経路は、同指連続（§3.3）と任意の全指移動制約（§3.8）だけである。
どちらもCalibrationが無い場合は「1u の移動を通常の1アクション相当」とする同じ正規化を使う。

## 2. パラメータ

| 名前 | 単位 | 範囲 | 既定 |
|---|---|---|---|
| 基準速度 `stepsPerSecond` | ステップ/秒 | 0.1 〜 20 | 1.25 |
| 再生倍率 `speedMultiplier` | 倍 | 0.1 〜 10 | 1 |
| 指の移動速度を考慮 `sameFingerDelay` | — | 真偽 | 真 |
| 全指の移動時間で律速 `allFingerMovementDelay` | — | 真偽 | 偽 |
| 個人速度 `calibration` | — | 有無 | 無し |

再生倍率は**測定値・基準速度のどちらに対しても最後に掛かる**（§3.4）。

## 3. 1ステップの表示時間

ステップ `i` の表示時間 `T(i)` を次の順で求める。
判定に使うのは**ステップ `i` と直前のステップ `i-1` の関係だけ**である。

### 3.1 基準となる1アクションの時間

まず、このステップの基準速度 `a`（アクション/秒）を選ぶ。

| 条件 | `a` |
|---|---|
| 個人速度が無い | `stepsPerSecond` |
| 個人速度が有り、`i` と `i-1` が**異手** | 手の方向（L→R / R→L）ごとの測定値。無ければ通常速度 |
| 個人速度が有り、`i` と `i-1` が**同手・別指** | 指の組と方向ごとの測定値。無ければ同手・別指の代表値 |
| 個人速度が有り、上記以外 | 通常速度の測定値 |

そこから `normalMs = 1000 / a` を得る。`a` が有限の正数でない場合は `normalMs = ∞` とする
（速度0は「進まない」を意味し、再生が止まる）。

#### 同手・別指の判定

ステップ `i` のいずれかの押下と、ステップ `i-1` のいずれかの押下が、
**同じ手に属し、かつ異なる指**であれば同手・別指とみなす。
1つでも該当する組があれば成立する。

手の判定は指の識別子の先頭（`L` / `R`）で行うため、**親指も手の判定には参加する**。
ただし指の組の識別子は親指を除く8本でしか作らないため、親指が絡む組み合わせは
組ごとの測定値を引かず、同手・別指の代表値へ落ちる。

### 3.2 同指連続を含まない場合

`sameFingerDelay` が偽、またはステップ `i` に同指連続（`sfb`）の押下が無い場合、

```
T(i) = normalMs / multiplier
```

### 3.3 同指連続を含む場合

`sameFingerDelay` が真で、ステップ `i` に `sfb` の押下が1つ以上ある場合、
**同じ指が離れたキーへ移る時間**を反映する。

個人速度がある場合、`sfb` の各押下について指の移動速度から所要時間を求め、
その最大値と `normalMs` の大きいほうを取る。

```
movementMs = max over sfb presses of ( distance / fingerSpeed(finger) × 1000 )
T(i)       = max(normalMs, movementMs) / multiplier
```

`fingerSpeed(f)` はその指の測定値。測定できなかった指は全指の代表値を使う。

個人差を持たない場合は、距離を正規化して掛ける。

```
d      = max(1, max over sfb presses of distance)
T(i)   = (normalMs × d) / multiplier
```

**1u の移動を通常の1アクション相当**とみなす正規化である。
`d` の下限を1に切るのは、ホーム内の短い移動でステップが通常より速くなるのを避けるため。

`max` を取る形（個人速度がある場合）は、
**「速さの上限」と「移動に要する時間」のうち遅いほうが律速する**という読みである。
移動が速く済んでも、1アクションの速さを超えては打てない。

### 3.4 再生倍率

上記いずれの分岐でも、最後に `multiplier` で割る。
`multiplier` が有限の正数でない場合は既定値（1）を使う。

### 3.5 Structural result とアルペジオ

Timing は Arpeggio を独自に再判定しない。#200 の structural analysis が生成した
Transition / LongRoll / TwoRoll / Redirect / SFB / ArpeggioSpan を入力として使う。

keydist における Arpeggio は、幾何条件そのものではなく、LongRoll と standalone TwoRoll を
core とし、`ArpeggioPolicy` を適用して得る派生区間である。

```ts
type ArpeggioPolicy = {
  includeThumb: boolean;                // default false
  bridgeSameFinger: boolean;            // default false
  includeSingleRedirectTail: boolean;   // default false
};
```

旧来の `minHorizontalSpread` / `maxRowReversal` / `maxRowStep` 等は、
Arpeggio の structural condition として扱わない。geometry quality として再利用する場合は、
構造判定とは別の分析軸で定義する。

### 3.6 Transition と Calibration の結合

Timing は各隣接 Stroke 間の Transition を1回だけ評価する。
同手・別指では対応する**有向指ペア**の Calibration を優先し、
値が無ければ既存の順序なしペア値、さらに代表値へフォールバックする。

structural analysis の `inward` / `outward` は指順の事実であり、速度値ではない。
例えば `LM → LI` が inward でも、Timing は「inward 用の一律速度」を使わず、
`LM → LI` の directed pair Calibration を参照する。

異手遷移も同様に L→R / R→L の Calibration を使い、構造ラベルから速度を推測しない。

### 3.7 ArpeggioSpan の重複

ArpeggioSpan は overlap を許容するが、Timing 効果を重複適用しない。
同じ Transition が複数の ArpeggioSpan に含まれていても、その Transition の時間評価は1回だけ行う。

3打以上の Roll / Arpeggio も、内部 Transition ごとの有向ペアとして評価する。
Span 全体へ「Arpeggio だから高速化」「Redirect だから減速」といった任意係数を掛けない。

新しい補正係数が必要な場合は、現象・根拠・既存 Calibration で表現できない理由を
仕様で確定してから追加する。

### 3.8 全指の移動時間によるschedule制約

`allFingerMovementDelay=false` のときは従来どおり、§3.1〜§3.7で得た `T(i)` をそのまま累積する。

`allFingerMovementDelay=true` のときは、各Strokeのbase終了時刻へ全指の移動可能時刻を
**追加のmax制約**として適用する。base duration自体やTransition Calibrationの選択規則は置き換えない。

Stroke `i` の開始時刻を `start(i)`、base durationを `T(i)` とし、
そのStrokeで実際にPressする各指 `f` について、最後に自由になった時刻 `free(f)`、
最後の位置 `pos(f)`、今回のPress target `target(f,i)` から移動時間 `move(f,i)` を求める。

```
baseEnd(i)     = start(i) + T(i)
required(f, i) = free(f) + move(pos(f), target(f, i))
end(i)         = max(baseEnd(i), max over actual presses required(f, i))
start(i + 1)   = end(i)
```

同時押しは各指が並列に移動できるため、必要時刻の**最大値**だけがStrokeを律速する。
normal output / triggerのPress後、その指は `end(i)` で自由になる。
`held-trigger/continue` は新しいPressではないが、そのStroke終了までは指を占有するため、
その指の `free(f)` を `end(i)` まで延長する。明示release eventは無いため、
保持が終わる境界でrelease自体の追加時間は置かない。

`move` は既存の指移動Calibrationを使う。指個別値が無ければ全指fallback値を使う。
Calibration自体が無い場合は§3.3と同じく `stepsPerSecond` を [u/秒] の正規化速度として使う。
いずれも最後に `speedMultiplier` を適用する。

directed finger-pair / cross-hand Calibrationはすでに `T(i)` のbase durationへ反映済みである。
全指制約側ではそれらをもう一度使わず、**finger movementだけ**を評価する。
これにより同じ現象を加算で二重計上せず、「base Timing」と「物理的に間に合う最短時刻」の遅い方を採る。

`sameFingerDelay` は既存のbase duration規則として残す。両方ONでも加算せずmax制約なので、
同指移動がbase duration内で既に満たされていれば追加延長は発生しない。

### 3.9 未決事項

次は本仕様では確定しない。実装者が推測で Timing / structural analysis の規則へ追加しない。

- `held-trigger/start` を pure roll 境界としてどう扱うか
- 明示的 release 境界の扱い
- Press / Release を独立 event にした場合の詳細
- 親指を含む directed pair の追加 Calibration 測定セット
- 新しい Timing 補正係数


## 4. 再生の進行

再生は `requestAnimationFrame` の経過時間を積算し、
積算値が `T(i)` を超えるたびにカーソルを1つ進める。
1フレームで複数ステップ進むこともある。

1フレームとして受け取る経過時間には**上限（100ms）**を設ける。
非アクティブなタブから戻った時に、溜まった時間で一気に進むのを防ぐため。

カーソルが最後のステップに達したら再生を止め、積算値を0に戻す。

### 4.1 確定Timing scheduleと表示用の先行到着

表示側が各ステップの時間計算を再実装しないよう、Timingは各Strokeについて
`startMs / endMs` を持つ累積scheduleを生成できるものとする。
`allFingerMovementDelay=false` なら§3の `T(i)` をそのまま累積し、
ONなら§3.8の全指max制約を適用したscheduleを確定結果とする。
構造ラベルや表示設定から別のdurationを足さない。
再生・実効速度・指位置表示は同じ確定scheduleを再利用し、描画フレームごとに全StrokeのTimingを再計算しない。

指位置表示の準備時間は、この**確定済みscheduleを読むだけの表示機能**とする。
準備時間を `π`、次にその指が実際にPressする時刻を `T`、現在位置から次位置までの
移動見積もりを `move` とすると、表示上の到着候補を次で求める。

```
idealStart = T - π - move
start      = max(idealStart, previousFingerActionEnd)
arrival    = min(T, start + move)
```

`move` は既存Calibrationの指移動速度を使い、無い場合は§3.3のfallbackと同じ正規化を使う。
`held-trigger/continue` は次のPress候補にはしないが、保持中はその指が塞がっているため `previousFingerActionEnd` のclamp対象に含める。
この表示処理はTimingを遅らせない。物理的に `T` より前へ到着できない場合は、
その指の表示だけを `T` で切り替える。

次のPress探索ではnormalized Stroke participationを使い、`held-trigger` の継続だけを
新しいPressとして扱わない。準備時間が0なら、従来どおり打鍵時刻でのみ指位置が切り替わる。

## 5. かな/秒・アクション/秒の移動平均

再生中の数値表示と推移グラフに出す指標。**直近の完了済みStrokeを、
そのStroke列の確定schedule上の表示時間合計で割る単純移動平均（SMA）**とする。

集計窓 `playbackRateWindow` は **1〜50 Stroke、既定10** とし、
`conditions.defaults` に全配列共通で保存する。per-layout overrideは持たない。
ここで1単位は確定Timing scheduleの1要素、すなわちnormalized Stroke 1件である。
距離モデルの窓幅 `N` とは無関係で、連動しない。

窓は**打ち終えたステップだけ**で作る。カーソルより先のステップは含めない。
まだ打っていない打鍵から現在の速さを求めることはしない。

窓に含まれるステップ列の表示時間の合計を `D` とすると、

- **アクション/秒** = `窓のStroke数 × 1000 / D`
- **かな/秒** = `窓に含まれる入力単位のかな文字数 × 1000 / D`

かなの数え方は、窓の中で**始まりかつ終わる**入力単位だけを数える。
窓の境界にまたがる入力単位は数えない（途中まで打った単位を1文字と数えないため）。

`D` が0以下、または数えた文字数が0の場合は値を出さない。

これらは**再生の表示時間から導く値**であり、実測ではない。
パラメータを変えれば値も変わる。

## 6. 個人速度の測定

`src/playback-calibration.ts` が持つ。測定は**通常速度・移動速度**と
**方向別Transition Calibration** に分け、いずれも**中央値**で代表値を取る
（外れ値の影響を抑えるため）。

### 6.1 通常速度・移動速度

通常の再生に使う代表値を測る。異手・同手別指の往復を含め、方向は区別しない。

| 測定 | 何を打つか | 回数 | 得る量 |
|---|---|---|---|
| 通常速度 | 左右の人差し指のホームキーを交互に連打 | 9間隔 | アクション/秒 |
| 指の移動速度 | 各指のホームと、その指の下段の最遠キーを交互に打つ | 各指6回 | u/秒 |
| 同手・別指 | 同じ手の2指のホームキーを交互に連打。全組合せ | 各方向6回（計12間隔） | アクション/秒 |

### 6.2 方向別Transition Calibration

Arpeggio所属とは無関係に、隣接Stroke間のTransitionへ使う方向別速度を測る。
始点→終点の片道だけを測定値として残し、終点→始点の戻りは手を戻すための間隔として捨てる。
したがって、例えば `F`→`J` を測る場合も `F`→`J`→`F` を繰り返し、
`J`→`F` は `L→R` の値に含めない。

| 測定 | 何を打つか | 回数 | 得る量 |
|---|---|---|---|
| 異手 L→R / R→L | 左右人差し指のホームキーを指定方向へ繰り返す | 各方向9間隔 | `actionsPerSecondByDirection` |
| 同手・別指の全組合せ | 同じ手のホームキー2本を指定方向へ繰り返す | 各組・各方向6間隔 | `sameHandDifferentFingerActionsPerSecondByDirectedPair` |

通常速度・移動速度と方向別Transition Calibrationは別々に開始できる。
方向別枠で測定しなかった方向・組の保存値は更新せず、既存値をそのまま使う。
保存schemaは互換維持のため変更しない。

- **通常速度**は連続する打鍵の間隔 [ms] の中央値の逆数を取る（`1000 / 中央値`）
- **指の移動速度**は各試行の `距離 / 所要時間` を取り、指ごとに中央値を取る。
  ホームと最遠キーは交互に打ち、**片道を1回と数える**（どちらの向きも距離は同じ）。
  測定できなかった指のために、全試行を通した中央値も代表値として持つ
- **方向別Transition速度**は、指定方向の間隔だけを取り出して中央値から求める。未測定の方向や飛び指の組は、既存の順序なしペア値または代表値へフォールバックする
- **同手・別指**は組ごとに間隔の中央値から求め、あわせて全組を通した代表値も持つ

測定に使うキーは、選択中の配列で**文字・コンマ・ピリオドが刻印された物理キー**に限る。
刻印の無いキーを打たせないため。指の移動速度はホーム段の1つ下の段から選び、
数字段は使わない。

### 保存

`localStorage` に保存する。値の範囲（アクション/秒は 0.1 〜 40、
指の移動速度は 0.1 〜 100 [u/秒]）を外れる保存値は読み込まず、個人速度無しとして扱う。

## 7. 本モデルの適用範囲

現行モデルが**扱っていないこと**を明示する。欠陥ではなく、範囲の記述である。

### 7.1 異手（交互打鍵）は方向別の測定値を持つ

異手の連続には L→R / R→L の方向別速度を使う。方向別の測定値が無ければ、
通常速度へ落ちる。

通常速度は旧保存値との互換用のフォールバックでもある。片手に閉じた連続で別指でないもの
（同じ指の連打など）は通常速度へ落ちる。

### 7.2 同手・別指の速度は方向を持つ

指の組と方向で引くため、`LM` → `LI` と `LI` → `LM` は別の値を持てる。
方向別の測定値が無ければ、既存の順序なしペア値、さらに同手・別指の代表値へ落ちる。

### 7.3 TimingはTransitionを1回だけ評価する

通常の打鍵時間は隣接 Stroke 間の Transition を基準に決める。
LongRoll / TwoRoll / Redirect / ArpeggioSpan の区間所属は構造・表示・集計用であり、
duration sourceにはしない。

3打以上の Roll / Arpeggio も内部 Transition 単位で directed pair Calibration を適用する。
同じTransitionが複数Spanへ属してもTiming評価は1回だけで、Span先頭への追加delayや
before/distributed配置は行わない。

### 7.4 打鍵以外の待機を持たない

句読点の前後、語の切れ目、変換の操作などに伴う待機は無い。
表示時間はすべて打鍵そのものの時間として積まれる。
したがって §5 の実効速度は、打鍵の速さだけを反映する。

### 7.5 移動平均の集計窓は全配列共通

§5 の集計窓は `playbackRateWindow` で変更できるが、配列ごとの上書きは持たない。
同じ画面で配列を比較する時に別々の窓幅を混ぜないためである。
窓が入力全体より大きい場合は、存在する完了済みStrokeだけを使う。

### 7.6 個人速度は配列に紐づかない

個人速度は打鍵者の性質であり、選択中の配列や物理形状とは独立に保存される。
測定に使うキーの選択にだけ、選択中の配列の刻印が影響する。
