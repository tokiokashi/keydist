/** ツールチップ。SVGの外に置いた1つの要素を使い回す */
const tip = () => document.getElementById('tooltip') as HTMLDivElement;

export function showTip(html: string, event: MouseEvent, wrap = false) {
  const el = tip();
  el.innerHTML = html;
  el.classList.toggle('wrap', wrap);
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

/** 図全体にツールチップの挙動を付ける。data-tipを持つ要素に反応する */
export function bindTips(root: HTMLElement) {
  root.addEventListener('mousemove', (e) => {
    const target = (e.target as Element).closest('[data-tip]');
    // 補足ボタンの文は長いので折り返す。図のツールチップは1行のまま
    if (target) showTip(target.getAttribute('data-tip')!, e, target.classList.contains('info'));
    else hideTip();
  });
  root.addEventListener('mouseleave', hideTip);
}

/**
 * データ端だけを4px丸めた横棒のパス。
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
  /** 省略時はformat(value)。値が個別に表示形式を持つ図で使う */
  valueLabel?: string;
  /** 省略時は単一色（magnitudeの図） */
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
  /** viewBoxの幅。狭い枠に置く図は小さくすると相対的に文字が大きくなる */
  width?: number;
}

/** 横棒グラフ。magnitudeを長さで、identityを色で表す */
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
      const valueLabel = d.valueLabel ?? format(d.value);
      const tipText = d.tip ?? `${d.label}<br><b>${valueLabel}</b>`;
      return `<g data-tip="${escapeAttr(tipText)}">
        <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="12"
          fill="var(--fg)" ${d.emphasise ? 'font-weight="700"' : ''}>${escapeText(d.label)}</text>
        <path d="${barPath(labelW, y + (rowH - barH) / 2, w, barH)}" fill="${fill}"/>
        <text x="${labelW + w + 8}" y="${y + rowH / 2 + 4}" font-size="12"
          fill="var(--muted)" font-variant-numeric="tabular-nums">${valueLabel}</text>
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img">${rows}</svg>`;
}

export interface LineSeries {
  name: string;
  color: string;
  /** yは描画に使う値、rawは併記する生値 */
  points: { x: number; y: number; raw?: number }[];
}

export interface LineOptions {
  /**
   * y軸の上端を固定する。
   * 相対表示のように上限が理論で決まっている図は、目盛りをそこに合わせる。
   */
  yMax?: number;
}

/** 折れ線。xは等間隔の目盛り位置として扱う */
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
  // 比率を見る図なので0起点にはしない。データ範囲に余白を足して傾きを読めるようにする
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

  // 縦方向の当たり判定。x目盛りごとに全系列の値を出す
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
  /** 同じ値が続く並びを1つの塊として扱い、塊の間に余白を置く（左手 / 右手など） */
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
 * 縦棒。xに並ぶ順序そのものが意味を持つ場合に使う
 * （指を左小指から右小指へ並べると、図の左右が手の左右と一致する）。
 */
export function columnChart(data: ColumnDatum[], options: ColumnOptions = {}): string {
  const format = options.format ?? ((v: number) => v.toFixed(1));
  const W = options.width ?? 420;
  const H = options.height ?? 190;
  const top = 18;
  const bottom = data.some((d) => d.group) ? 34 : 20;
  const plotH = H - top - bottom;
  const hi = Math.max(...data.map((d) => d.value), 0);
  const lo = Math.min(...data.map((d) => d.value), 0);
  // 全値が0の場合も、ゼロ基準線は従来どおり図の下端に置く
  const scaleHi = hi === 0 && lo === 0 ? 1 : hi;
  const span = Math.max(1e-9, scaleHi - lo);
  const yOf = (value: number) => top + ((scaleHi - value) / span) * plotH;
  const baselineY = yOf(0);

  // 塊の切れ目に1本分の半分の余白を入れる
  const gaps = data.reduce((n, d, i) => (i > 0 && d.group !== data[i - 1].group ? n + 1 : n), 0);
  const slot = W / (data.length + gaps * 0.5);
  const barW = Math.min(slot - 4, 46);

  let cursor = 0;
  const bars = data
    .map((d, i) => {
      if (i > 0 && d.group !== data[i - 1].group) cursor += slot * 0.5;
      const x = cursor + (slot - barW) / 2;
      cursor += slot;
      // 0を基準に、正値は上向き、負値は下向きに描く
      const valueY = yOf(d.value);
      const h = Math.abs(valueY - baselineY);
      const y = Math.min(valueY, baselineY);
      const fill = d.color ?? 'var(--heat-1)';
      const tipText = d.tip ?? `${d.label}<br><b>${format(d.value)}</b>`;
      const bar = h <= 0.5
        ? ''
        : `<rect data-bar="true" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${fill}"/>`;
      const valueLabelY = d.value < 0 ? y + h + 14 : y - 5;
      return `<g data-tip="${escapeAttr(tipText)}">
        <rect x="${cursor - slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
        ${bar}
        <text x="${x + barW / 2}" y="${valueLabelY}" text-anchor="middle" font-size="11"
          fill="var(--muted)" font-variant-numeric="tabular-nums">${format(d.value)}</text>
        <text x="${x + barW / 2}" y="${top + plotH + 14}" text-anchor="middle" font-size="11"
          fill="var(--fg)">${escapeText(d.label)}</text>
      </g>`;
    })
    .join('');

  // 塊のラベルは軸の下にまとめて1つ置く
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

  const baseline = `<line x1="0" y1="${baselineY}" x2="${W}" y2="${baselineY}" stroke="var(--line)"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${baseline}${bars}${groupLabels}</svg>`;
}

export interface MatrixCell {
  value: number;
  /** 省略時は行ラベル・列ラベル・値から組み立てる */
  tip?: string;
}

export interface MatrixRow {
  label: string;
  /** ラベル横のスウォッチ色。他の図と同じ配列識別色を渡す */
  color: string;
  cells: MatrixCell[];
}

export interface MatrixOptions {
  format?: (v: number) => string;
  labelWidth?: number;
  cellWidth?: number;
  rowHeight?: number;
  /** この列番号の前に隙間を空ける（左手 / 右手の区切りなど） */
  columnSplit?: number;
  /** 隙間の両側に出す見出し。columnSplitとセットで使う */
  columnGroupLabels?: [string, string];
  /**
   * 色の下端をどこに置くか。
   * `zero`（既定）は0を最も薄い色に固定する。0が「無い」を意味する量（距離・押下数）向け。
   * `min` は実測の最小値を下端に取る。ホーム間隔からの超過のように値が狭い帯に固まる量は、
   * 0起点だと全セルが同じ濃さに見えるため、こちらで帯いっぱいに色を割り当てる。
   * 負の値もそのまま下端側に載る（クランプしない）。
   */
  colorBase?: 'zero' | 'min';
  /** 列見出しをクリックしたときの行ソート状態 */
  sort?: MatrixSort;
}

export interface MatrixSort {
  column: number;
  direction: 'asc' | 'desc';
}

/**
 * 配列 × 指のように、行・列どちらも識別を持つ比較に使う。
 * セルの色は打鍵頻度ヒートマップと同じheat系（単一指標の強弱）、
 * 行の識別は左のスウォッチが担う。色は行列全体の最大値を100%として塗る。
 */
export function matrixChart(rows: MatrixRow[], columns: string[], options: MatrixOptions = {}): string {
  const format = options.format ?? ((v: number) => v.toFixed(2));
  const labelW = options.labelWidth ?? 116;
  const cellW = options.cellWidth ?? 54;
  const rowH = options.rowHeight ?? 24;
  const split = options.columnSplit;
  const gap = split !== undefined ? cellW * 0.4 : 0;
  const headerH = options.columnGroupLabels ? 36 : 20;
  const W = labelW + columns.length * cellW + gap;
  const H = headerH + rows.length * rowH;

  const values = rows.flatMap((r) => r.cells.map((c) => c.value));
  const hi = Math.max(...values, 0);
  const lo = options.colorBase === 'min' ? Math.min(...values, hi) : 0;
  const span = Math.max(1e-9, hi - lo);
  const colX = (i: number) => labelW + i * cellW + (split !== undefined && i >= split ? gap : 0);

  const groupLabels = options.columnGroupLabels
    ? (() => {
        const [left, right] = options.columnGroupLabels!;
        const leftMid = labelW + ((split ?? 0) * cellW) / 2;
        const rightMid = colX(split ?? 0) + ((columns.length - (split ?? 0)) * cellW) / 2;
        return `<text x="${leftMid}" y="12" text-anchor="middle" font-size="11"
            fill="var(--muted)">${escapeText(left)}</text>
          <text x="${rightMid}" y="12" text-anchor="middle" font-size="11"
            fill="var(--muted)">${escapeText(right)}</text>`;
      })()
    : '';

  const colHeads = columns
    .map((c, i) => {
      const active = options.sort?.column === i ? options.sort.direction : undefined;
      const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
      const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
      return `<g data-tip="クリックごとに昇順・降順・選択順へ切り替える">
        <text x="${colX(i) + cellW / 2}" y="${headerH - 6}" text-anchor="middle" font-size="11"
        fill="var(--muted)" data-matrix-sort="${i}" role="button" tabindex="0"
        aria-label="${escapeAttr(`${c}で配列を並べ替え`)}" aria-sort="${ariaSort}"
        style="cursor:pointer">${escapeText(c)}${marker}</text></g>`;
    })
    .join('');

  const body = rows
    .map((row, ri) => {
      const y = headerH + ri * rowH;
      const label = `<rect x="0" y="${y + (rowH - 9) / 2}" width="9" height="9" rx="2" fill="${row.color}"/>
        <text x="${labelW - 14}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="12"
          fill="var(--fg)">${escapeText(row.label)}</text>`;
      const cells = row.cells
        .map((cell, ci) => {
          const x = colX(ci);
          const t = Math.min(1, Math.max(0, (cell.value - lo) / span));
          const tipText =
            cell.tip ?? `${escapeText(row.label)} / ${escapeText(columns[ci])}<br><b>${format(cell.value)}</b>`;
          return `<g data-tip="${escapeAttr(tipText)}">
            <rect x="${x + 2}" y="${y + 2}" width="${cellW - 4}" height="${rowH - 4}" rx="4"
              fill="color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))"/>
            <text x="${x + cellW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="11"
              font-variant-numeric="tabular-nums"
              fill="${t > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}">${format(cell.value)}</text>
          </g>`;
        })
        .join('');
      return label + cells;
    })
    .join('');

  // 実寸を属性で持たせる。枚ごとに列数が違っても、CSS側で幅を自動にすれば
  // セルの大きさが揃う（引き伸ばされた図だけセルが大きくなるのを防ぐ）
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${groupLabels}${colHeads}${body}</svg>`;
}
