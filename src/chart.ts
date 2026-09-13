/** ツールチップ。SVG の外に置いた 1 つの要素を使い回す */
const tip = () => document.getElementById('tooltip') as HTMLDivElement;

export function showTip(html: string, event: MouseEvent) {
  const el = tip();
  el.innerHTML = html;
  el.hidden = false;
  const pad = 12;
  const rect = el.getBoundingClientRect();
  const x = Math.min(event.clientX + pad, window.innerWidth - rect.width - 8);
  const y = Math.max(event.clientY - rect.height - pad, 8);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function hideTip() {
  tip().hidden = true;
}

/** 図全体にツールチップの挙動を付ける。data-tip を持つ要素に反応する */
export function bindTips(root: HTMLElement) {
  root.addEventListener('mousemove', (e) => {
    const target = (e.target as Element).closest('[data-tip]');
    if (target) showTip(target.getAttribute('data-tip')!, e);
    else hideTip();
  });
  root.addEventListener('mouseleave', hideTip);
}

/**
 * データ端だけを 4px 丸めた横棒のパス。
 * 起点（軸側）は角を立てたまま、伸びた先だけ丸める。
 */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= r) return `M${x},${y} h${w} v${h} h${-w} z`;
  return (
    `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} ` +
    `v${h - r * 2} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** 省略時は単一色（magnitude の図） */
  color?: string;
  /** ツールチップに出す補足 */
  tip?: string;
  emphasise?: boolean;
}

export interface BarOptions {
  /** 値の表示形式 */
  format?: (v: number) => string;
  /** ラベル列の幅 [px] */
  labelWidth?: number;
  rowHeight?: number;
  /** viewBox の幅。狭い枠に置く図は小さくすると相対的に文字が大きくなる */
  width?: number;
}

/** 横棒グラフ。magnitude を長さで、identity を色で表す */
export function barChart(data: BarDatum[], options: BarOptions = {}): string {
  const format = options.format ?? ((v: number) => v.toFixed(0));
  const labelW = options.labelWidth ?? 92;
  const rowH = options.rowHeight ?? 26;
  const barH = 14;
  const valueW = 64;
  const W = options.width ?? 640;
  const H = data.length * rowH;
  const plotW = W - labelW - valueW;
  const max = Math.max(1e-9, ...data.map((d) => d.value));

  const rows = data
    .map((d, i) => {
      const y = i * rowH;
      const w = Math.max(0, (d.value / max) * plotW);
      const fill = d.color ?? 'var(--heat-1)';
      const tipText = d.tip ?? `${d.label}<br><b>${format(d.value)}</b>`;
      return `<g data-tip="${escapeAttr(tipText)}">
        <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="12"
          fill="var(--fg)" ${d.emphasise ? 'font-weight="700"' : ''}>${escapeText(d.label)}</text>
        <path d="${barPath(labelW, y + (rowH - barH) / 2, w, barH)}" fill="${fill}"/>
        <text x="${labelW + w + 8}" y="${y + rowH / 2 + 4}" font-size="12"
          fill="var(--muted)" font-variant-numeric="tabular-nums">${format(d.value)}</text>
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img">${rows}</svg>`;
}

export interface LineSeries {
  name: string;
  color: string;
  /** y は描画に使う値、raw は併記する生値 */
  points: { x: number; y: number; raw?: number }[];
}

/** 折れ線。x は等間隔の目盛り位置として扱う */
export function lineChart(
  series: LineSeries[],
  xTicks: number[],
  format: (v: number) => string,
): string {
  const W = 700;
  const H = 260;
  const M = { top: 14, right: 104, bottom: 28, left: 54 };
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  // 比率を見る図なので 0 起点にはしない。データ範囲に余白を足して傾きを読めるようにする
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.12, hi * 0.01, 1e-6);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const span = yMax - yMin || 1;
  const x = (i: number) => M.left + (i / Math.max(1, xTicks.length - 1)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - yMin) / span) * (H - M.top - M.bottom);

  const grid = [0, 0.5, 1]
    .map((t) => {
      const v = yMin + span * t;
      return `<line x1="${M.left}" y1="${y(v)}" x2="${W - M.right}" y2="${y(v)}"
        stroke="var(--line)"/>
        <text x="${M.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11"
          fill="var(--muted)" font-variant-numeric="tabular-nums">${format(v)}</text>`;
    })
    .join('');

  const paths = series
    .map(
      (s) =>
        `<path d="${s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join('')}"
          fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`,
    )
    .join('');

  // 終端ラベルは重ならないよう最小間隔を確保する
  const labels = series
    .map((s) => ({ name: s.name, color: s.color, y: y(s.points[s.points.length - 1].y) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
  }
  const labelText = labels
    .map(
      (l) => `<text x="${W - M.right + 10}" y="${l.y + 4}" font-size="12"
        fill="${l.color}">${escapeText(l.name)}</text>`,
    )
    .join('');

  // 縦方向の当たり判定。x 目盛りごとに全系列の値を出す
  const bands = xTicks
    .map((tick, i) => {
      const half = (W - M.left - M.right) / Math.max(1, xTicks.length - 1) / 2;
      const rows = series
        .map((s) => {
          const p = s.points[i];
          const raw = p.raw === undefined ? '' : ` <span style="color:var(--muted)">(${p.raw.toFixed(0)} u)</span>`;
          return `<span style="color:${s.color}">■</span> ${escapeText(s.name)} <b>${format(p.y)}</b>${raw}`;
        })
        .join('<br>');
      return `<g data-tip="${escapeAttr(`N = ${tick}<br>${rows}`)}">
        <rect x="${x(i) - half}" y="${M.top}" width="${half * 2}" height="${H - M.top - M.bottom}"
          fill="transparent"/>
      </g>`;
    })
    .join('');

  const xLabels = xTicks
    .map(
      (t, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11"
        fill="var(--muted)" font-variant-numeric="tabular-nums">${t}</text>`,
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${paths}${labelText}${xLabels}${bands}</svg>`;
}

export const escapeText = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');
