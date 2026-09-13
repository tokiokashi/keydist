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

export interface LineOptions {
  /**
   * y 軸の上端を固定する。
   * 相対表示のように上限が理論で決まっている図は、目盛りをそこに合わせる。
   */
  yMax?: number;
}

/** 折れ線。x は等間隔の目盛り位置として扱う */
export function lineChart(
  series: LineSeries[],
  xTicks: number[],
  format: (v: number) => string,
  options: LineOptions = {},
): string {
  const W = 700;
  const H = 260;
  // 右余白は終端ラベルの幅。日本語の配列名は長いので広めに取る
  const M = { top: 14, right: 176, bottom: 28, left: 54 };
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  // 比率を見る図なので 0 起点にはしない。データ範囲に余白を足して傾きを読めるようにする
  const lo = Math.min(...all);
  const hi = options.yMax ?? Math.max(...all);
  const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.01, 1e-6);
  const yMin = lo - pad;
  // 上端が指定されていれば余白を足さない。目盛りをちょうどその値で止める
  const yMax = options.yMax ?? hi + pad;
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
  // 文字は地の色で置き、識別は横のマークが担う。系列色で文字を塗ると
  // 暗い色相がテーマによって読めなくなる
  const labelText = labels
    .map(
      (l) => `<rect x="${W - M.right + 10}" y="${l.y - 4}" width="9" height="9" rx="2"
        fill="${l.color}"/>
        <text x="${W - M.right + 24}" y="${l.y + 4}" font-size="12"
        fill="var(--fg)">${escapeText(l.name)}</text>`,
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

export interface ColumnDatum {
  label: string;
  value: number;
  /** 同じ値が続く並びを 1 つの塊として扱い、塊の間に余白を置く（左手 / 右手など） */
  group?: string;
  color?: string;
  tip?: string;
}

export interface ColumnOptions {
  format?: (v: number) => string;
  height?: number;
  width?: number;
}

/**
 * 縦棒。x に並ぶ順序そのものが意味を持つ場合に使う
 * （指を左小指から右小指へ並べると、図の左右が手の左右と一致する）。
 */
export function columnChart(data: ColumnDatum[], options: ColumnOptions = {}): string {
  const format = options.format ?? ((v: number) => v.toFixed(1));
  const W = options.width ?? 420;
  const H = options.height ?? 190;
  const top = 18;
  const bottom = data.some((d) => d.group) ? 34 : 20;
  const plotH = H - top - bottom;
  const max = Math.max(1e-9, ...data.map((d) => d.value));

  // 塊の切れ目に 1 本分の半分の余白を入れる
  const gaps = data.reduce((n, d, i) => (i > 0 && d.group !== data[i - 1].group ? n + 1 : n), 0);
  const slot = W / (data.length + gaps * 0.5);
  const barW = Math.min(slot - 4, 46);

  let cursor = 0;
  const bars = data
    .map((d, i) => {
      if (i > 0 && d.group !== data[i - 1].group) cursor += slot * 0.5;
      const x = cursor + (slot - barW) / 2;
      cursor += slot;
      const h = (d.value / max) * plotH;
      const y = top + plotH - h;
      const fill = d.color ?? 'var(--heat-1)';
      const tipText = d.tip ?? `${d.label}<br><b>${format(d.value)}</b>`;
      // データ端（上）だけ 4px 丸める
      const r = Math.min(4, h);
      const path =
        h <= 0.5
          ? ''
          : `<path d="M${x},${top + plotH} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} ` +
            `h${barW - r * 2} a${r},${r} 0 0 1 ${r},${r} v${h - r} z" fill="${fill}"/>`;
      return `<g data-tip="${escapeAttr(tipText)}">
        <rect x="${cursor - slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
        ${path}
        <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="11"
          fill="var(--muted)" font-variant-numeric="tabular-nums">${format(d.value)}</text>
        <text x="${x + barW / 2}" y="${top + plotH + 14}" text-anchor="middle" font-size="11"
          fill="var(--fg)">${escapeText(d.label)}</text>
      </g>`;
    })
    .join('');

  // 塊のラベルは軸の下にまとめて 1 つ置く
  let groupLabels = '';
  if (data.some((d) => d.group)) {
    let pos = 0;
    const spans = new Map<string, { from: number; to: number }>();
    data.forEach((d, i) => {
      if (i > 0 && d.group !== data[i - 1].group) pos += slot * 0.5;
      const key = d.group ?? '';
      const span = spans.get(key);
      if (span) span.to = pos + slot;
      else spans.set(key, { from: pos, to: pos + slot });
      pos += slot;
    });
    groupLabels = [...spans]
      .map(
        ([name, span]) => `<text x="${(span.from + span.to) / 2}" y="${H - 6}" text-anchor="middle"
          font-size="11" fill="var(--muted)">${escapeText(name)}</text>`,
      )
      .join('');
  }

  const baseline = `<line x1="0" y1="${top + plotH}" x2="${W}" y2="${top + plotH}" stroke="var(--line)"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${baseline}${bars}${groupLabels}</svg>`;
}
