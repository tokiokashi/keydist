import { HEAT_BLOB_LEVELS } from './heatmap-blob.ts';

/**
 * ヒートマップの多色の配色。押下数（強度0〜1）から、ライトとダークそれぞれの表示色を決める純粋な計算。
 * 描画と、明るさ・文字のコントラストの検査が同じ定義を読む。
 *
 * 並びの決め方はテーマで違う。
 * ライトは、既存の配列評価ツールのKeyboard Layout Analyzerと同じ青→水色→緑→黄→赤の並びで、色の位置も同じ。
 * 色相で強弱を読む人が読み慣れた並びにするためで、青が暗く黄が明るいので、明るさは強度に対して単調にならない。
 * 0.45より低い所は、地の色から青へなめらかにつなぐ。明るさだけで読みたい人は単色を選べる。
 * ダークは、暗い青から明るい黄へ、強いほど明るく（地より明るく）並べる。明るさが一方向にだけ変わるので、明るさだけで読む人にも強弱が逆に見えない。
 */

export type HeatTheme = 'light' | 'dark';
export const HEAT_THEMES = ['light', 'dark'] as const satisfies readonly HeatTheme[];

/** sRGBの各成分（0〜255）。 */
export type HeatRgb = readonly [number, number, number];

/** 1つの点の、テーマごとの表示色。 */
export type HeatSample = Readonly<Record<HeatTheme, HeatRgb>>;

/** 強度0（押下の無い所）の地の色。`theme.css` の `--heat-0` と同じ値にする（検査が突き合わせる）。 */
export const HEAT_GROUND: Readonly<Record<HeatTheme, string>> = { light: '#eef2f6', dark: '#1f2225' };

/** 色の並びの1点。強度 `position`（0〜1）での色。 */
export type HeatStop = readonly [position: number, hex: string];

/**
 * テーマごとの色の並び。位置の昇順で、最初の位置は0、最後は1。隣り合う点の間は線形の光で補間する。
 * ライトの色と位置はKeyboard Layout Analyzerが使うheatmap.js 1.0の既定の配色
 * （0.45: rgb(0,0,255)、0.55: rgb(0,255,255)、0.65: rgb(0,255,0)、0.95: yellow、1.0: rgb(255,0,0)）。
 */
export const HEAT_STOPS: Readonly<Record<HeatTheme, readonly HeatStop[]>> = {
  light: [
    [0, HEAT_GROUND.light],
    [0.45, '#0000ff'],
    [0.55, '#00ffff'],
    [0.65, '#00ff00'],
    [0.95, '#ffff00'],
    [1, '#ff0000'],
  ],
  dark: [
    [0, '#2b4fb8'],
    [0.25, '#1fa3a8'],
    [0.5, '#5cc45a'],
    [0.75, '#f3e45a'],
    [1, '#fff6b0'],
  ],
};

/**
 * サーモグラフィで、低い段を地の色へ不透明度で溶かすテーマ。
 * ライトは並びが地の色から始まるので、溶かす必要が無い。
 */
const BLOB_FADES: Readonly<Record<HeatTheme, boolean>> = { light: false, dark: true };

/** サーモグラフィで、この段までは地の色から色へ不透明度を上げていく。低い段が地へ溶け込み、縁に硬い境目を作らない。 */
const HEAT_BLOB_FADE_LEVELS = HEAT_BLOB_LEVELS / 4;

function rgbOfHex(hex: string): HeatRgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** 小数第2位までに丸める。描画に渡す文字列と、検査が読む値を同じにする。 */
function round2(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)) * 100) / 100;
}

/**
 * 色の並びの、強度 `t`（0〜1）での色。隣り合う点の間は線形の光（ガンマ前）で補間する。
 */
export function heatMultiRgb(theme: HeatTheme, t: number): HeatRgb {
  const stops = HEAT_STOPS[theme];
  const clamped = Math.min(1, Math.max(0, t));
  const upper = Math.max(
    1,
    stops.findIndex(([position]) => position >= clamped),
  );
  const [fromPosition, fromHex] = stops[upper - 1]!;
  const [toPosition, toHex] = stops[upper]!;
  const fraction = (clamped - fromPosition) / (toPosition - fromPosition);
  const from = rgbOfHex(fromHex);
  const to = rgbOfHex(toHex);
  const channel = (n: 0 | 1 | 2) => {
    const a = toLinear(from[n]);
    const b = toLinear(to[n]);
    return round2(fromLinear(a + (b - a) * fraction));
  };
  return [channel(0), channel(1), channel(2)];
}

/** キーの塗りの、強度 `t`（0より大きい）での表示色。 */
export function heatMultiKeySample(t: number): HeatSample {
  return { light: heatMultiRgb('light', t), dark: heatMultiRgb('dark', t) };
}

/**
 * サーモグラフィの段 `level`（1〜`HEAT_BLOB_LEVELS`）の、地（`--heat-0`）の上での表示色。
 * 矩形は重ならず、地の矩形の上に塗るので、不透明度を使わずこの色で塗る。
 * キーの上は地が `--heat-0` なので、文字もこの色の上に載る。
 */
export function heatMultiBlobSample(level: number): HeatSample {
  const color = heatMultiKeySample(level / HEAT_BLOB_LEVELS);
  const opacity = Math.min(1, level / HEAT_BLOB_FADE_LEVELS);
  const shown = (theme: HeatTheme): HeatRgb => {
    if (!BLOB_FADES[theme]) return color[theme];
    const ground = rgbOfHex(HEAT_GROUND[theme]);
    const top = color[theme];
    return [0, 1, 2].map((n) => round2(ground[n]! * (1 - opacity) + top[n]! * opacity)) as unknown as HeatRgb;
  };
  return { light: shown('light'), dark: shown('dark') };
}

/** WCAG 2.xの相対輝度。 */
export function relativeLuminance(rgb: HeatRgb): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/** WCAG 2.xのコントラスト比。 */
export function contrastRatio(a: HeatRgb, b: HeatRgb): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

const BLACK: HeatRgb = [0, 0, 0];
const WHITE: HeatRgb = [255, 255, 255];

/**
 * 表示色の上に載せる文字色。黒と白のうち、コントラスト比が大きい方。
 * 黒と白は、相対輝度が約0.18の色の上で比が最も小さくなり、その最小でも約4.58ある。
 */
export function heatMultiLabelRgb(background: HeatRgb): HeatRgb {
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE;
}

/** 表示色の上の文字色を、テーマごとに決める。 */
export function heatMultiLabelSample(sample: HeatSample): HeatSample {
  return { light: heatMultiLabelRgb(sample.light), dark: heatMultiLabelRgb(sample.dark) };
}

function cssRgb(rgb: HeatRgb): string {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

/** テーマで切り替わるCSSの色。`color-scheme` に従って解決される。 */
export function heatSampleCss(sample: HeatSample): string {
  return `light-dark(${cssRgb(sample.light)}, ${cssRgb(sample.dark)})`;
}

/** 凡例の帯。強度0から1まで、低い側から高い側へ並べたCSSのグラデーション。 */
export function heatMultiGradientCss(steps = 16): string {
  const colors = Array.from({ length: steps }, (_, index) => heatSampleCss(heatMultiKeySample(index / (steps - 1))));
  return `linear-gradient(to right, ${colors.join(', ')})`;
}
