import { ALL_FINGERS, buildGeometry, THUMB_ROW, type Finger, type GeometryKind } from './geometry.ts';
import { evaluate, type Options, type Trace } from './evaluate.ts';
import { computeMetrics, type Metrics } from './metrics.ts';
import { nSensitivity } from './sensitivity.ts';
import { LAYOUTS, composeRomaji, type Layout } from './layouts/index.ts';
import { kunrei } from './romaji/kunrei.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA } from './sample-text-ja.ts';
import { barChart, bindTips, escapeText, lineChart } from './chart.ts';
import { setupTheme } from './theme.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  mode: $<HTMLSelectElement>('mode'),
  geometry: $<HTMLSelectElement>('geometry'),
  window: $<HTMLInputElement>('window'),
  windowOut: $<HTMLOutputElement>('window-out'),
  sfbHome: $<HTMLInputElement>('sfb-home'),
  text: $<HTMLTextAreaElement>('text'),
  textMeta: $<HTMLParagraphElement>('text-meta'),
  errors: $<HTMLParagraphElement>('errors'),
  compareChart: $<HTMLDivElement>('compare-chart'),
  compare: $<HTMLTableElement>('compare'),
  sensitivity: $<HTMLDivElement>('sensitivity'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  heatmap: $<HTMLDivElement>('heatmap'),
  fingerChart: $<HTMLDivElement>('finger-chart'),
  adjacentChart: $<HTMLDivElement>('adjacent-chart'),
};

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

/** 配列の識別色。順序は検証済みパレットの並びに固定する（循環させない） */
const SERIES = (i: number) => `var(--series-${(i % 5) + 1})`;

const ROMAJI_TABLE = kunrei();

const MODES = {
  en: { layouts: LAYOUTS, sample: SAMPLE_TEXT.replace(/\s+/g, ' ').trim() },
  ja: {
    layouts: LAYOUTS.map((l) => composeRomaji(`${l.id}-ja`, l.name, ROMAJI_TABLE, l)),
    sample: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
  },
} as const;

type ModeId = keyof typeof MODES;
const currentMode = () => MODES[el.mode.value as ModeId];

el.text.value = MODES.en.sample;
for (const layout of LAYOUTS) el.detailLayout.append(new Option(layout.name, layout.id));

function syncSampleText() {
  const untouched = Object.values(MODES).some((m) => m.sample === el.text.value);
  if (untouched) el.text.value = currentMode().sample;
}

interface Result {
  layout: Layout;
  trace: Trace;
  metrics: Metrics;
}

function render() {
  const geometry = buildGeometry(el.geometry.value as GeometryKind);
  const options: Options = {
    windowSize: Number(el.window.value),
    sfbHomeCost: el.sfbHome.checked,
  };
  const text = el.text.value;
  el.windowOut.value = el.window.value;

  const results: Result[] = currentMode().layouts.map((layout) => {
    const trace = evaluate(text, layout, geometry, options);
    return { layout, trace, metrics: computeMetrics(trace, geometry) };
  });

  const first = results[0].metrics;
  const parts = [`${[...text].length} 文字`, `${first.strokes} ステップ`, `${first.presses} 押下`];
  if (first.skipped) parts.push(`${first.skipped} 文字は配列上に無いため除外`);
  el.textMeta.textContent = parts.join(' / ');

  const errors = results.flatMap((r) => r.trace.errors);
  el.errors.textContent = errors.length ? `配列定義の不備: ${errors.join(' / ')}` : '';
  el.errors.hidden = errors.length === 0;

  renderCompare(results);
  renderSensitivity(text, geometry, options);
  renderDetail(results, geometry);
}

function renderCompare(results: Result[]) {
  const best = Math.min(...results.map((r) => r.metrics.totalUnits));

  el.compareChart.innerHTML = barChart(
    results.map((r, i) => ({
      label: r.layout.name,
      value: r.metrics.totalUnits,
      color: SERIES(i),
      emphasise: r.metrics.totalUnits === best,
      tip:
        `${escapeText(r.layout.name)}<br>総移動距離 <b>${r.metrics.totalUnits.toFixed(0)} u</b>` +
        ` (${(r.metrics.totalMm / 1000).toFixed(2)} m)<br>` +
        `1 打鍵あたり <b>${r.metrics.meanPerStroke.toFixed(3)} u</b>`,
    })),
    { format: (v) => v.toFixed(0), labelWidth: 96 },
  );

  const rows = results
    .map((r, i) => {
      const m = r.metrics;
      const variance = m.adjacent.reduce((a, b) => a + b.variance, 0) / m.adjacent.length;
      return `<tr${m.totalUnits === best ? ' class="best"' : ''}>
        <td><span class="swatch" style="background:${SERIES(i)}"></span>${escapeText(r.layout.name)}</td>
        <td class="num">${m.strokes}</td>
        <td class="num">${m.totalUnits.toFixed(0)}</td>
        <td class="num">${(m.totalMm / 1000).toFixed(2)}</td>
        <td class="num">${m.meanPerStroke.toFixed(3)}</td>
        <td class="num">${m.sameFinger}</td>
        <td class="num">${((m.sameFinger / Math.max(1, m.strokes)) * 100).toFixed(1)}%</td>
        <td class="num">${variance.toFixed(4)}</td>
      </tr>`;
    })
    .join('');

  el.compare.innerHTML = `
    <thead><tr>
      <th>配列</th><th>ステップ</th><th>距離 [u]</th><th>距離 [m]</th>
      <th>1打鍵 [u]</th><th>同指連続</th><th>同指連続率</th><th>隣接指分散</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

function renderSensitivity(
  text: string,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
) {
  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const series = currentMode().layouts.map((layout, i) => {
    const points = nSensitivity(text, layout, geometry, options, range);
    const base = points[0].totalUnits || 1;
    return {
      name: layout.name,
      color: SERIES(i),
      points: points.map((p) => ({
        x: p.windowSize,
        y: (p.totalUnits / base) * 100,
        raw: p.totalUnits,
      })),
    };
  });
  el.sensitivity.innerHTML = lineChart(series, range, (v) => `${v.toFixed(0)}%`);
}

function renderDetail(results: Result[], geometry: ReturnType<typeof buildGeometry>) {
  const wanted = el.detailLayout.value;
  const found =
    results.find((r) => r.layout.id === wanted || r.layout.id === `${wanted}-ja`) ?? results[0];
  const { metrics, layout } = found;

  renderHeatmap(metrics, layout, geometry);

  const total = metrics.totalUnits || 1;
  el.fingerChart.innerHTML = barChart(
    ALL_FINGERS.map((f) => ({
      label: FINGER_LABEL[f],
      value: metrics.perFinger[f],
      tip: `${FINGER_LABEL[f]}<br>移動 <b>${metrics.perFinger[f].toFixed(1)} u</b>` +
        ` (全体の ${((metrics.perFinger[f] / total) * 100).toFixed(1)}%)<br>` +
        `押下 <b>${metrics.perFingerPresses[f]}</b> 回` +
        ` (${((metrics.perFingerPresses[f] / Math.max(1, metrics.presses)) * 100).toFixed(1)}%)`,
    })),
    { format: (v) => v.toFixed(1), labelWidth: 76, rowHeight: 26, width: 380 },
  );

  el.adjacentChart.innerHTML = barChart(
    metrics.adjacent.map((s) => ({
      label: `${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]].replace(/^[左右]/, '')}`,
      value: s.variance,
      tip: `${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `分散 <b>${s.variance.toFixed(4)}</b><br>平均 <b>${s.mean.toFixed(3)} u</b>`,
    })),
    { format: (v) => v.toFixed(4), labelWidth: 132, rowHeight: 26, width: 380 },
  );
}

function renderHeatmap(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
) {
  const labels = layout.legends;
  const max = Math.max(1, ...metrics.keyCounts.values());
  const KEY = 46;
  const PAD = 6;
  const THUMB_W = 1.9;
  let maxX = 0;
  let maxY = 0;

  const keys = [...geometry.keys.values()].map((key) => {
    const count = metrics.keyCounts.get(key.id) ?? 0;
    const t = count / max;
    const thumb = key.row === THUMB_ROW;
    const w = (thumb ? THUMB_W : 1) * KEY;
    const x = (key.x - (thumb ? (THUMB_W - 1) / 2 : 0)) * KEY;
    const y = key.y * KEY;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + KEY);
    const label = labels.get(key.id) ?? (thumb ? (key.finger === 'RT' ? '空白' : '親指') : '');
    const share = ((count / Math.max(1, metrics.presses)) * 100).toFixed(1);
    const distance = metrics.keyDistance.get(key.id) ?? 0;
    const tip =
      `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>` +
      `<b>${count}</b> 打 (${share}%)<br>移動 <b>${distance.toFixed(1)} u</b>`;
    // 隣り合う面が地色で 2px 離れるよう、キー矩形は内側に 1px 詰める
    return `<g data-tip="${tip.replace(/"/g, '&quot;')}">
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${KEY - 2}" rx="5"
        fill="color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))"
        stroke="var(--line)"/>
      <text x="${x + w / 2}" y="${y + KEY / 2 + 5}" text-anchor="middle"
        font-size="${thumb ? 12 : 15}" fill="${t > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}"
        pointer-events="none">${escapeText(label)}</text>
    </g>`;
  });

  el.heatmap.innerHTML =
    `<svg viewBox="0 0 ${maxX + PAD} ${maxY + PAD}" role="img" aria-label="打鍵頻度">${keys.join('')}</svg>`;
}

el.mode.addEventListener('input', syncSampleText);
el.mode.addEventListener('change', syncSampleText);
for (const node of [el.mode, el.geometry, el.window, el.sfbHome, el.text, el.detailLayout]) {
  node.addEventListener('input', render);
  node.addEventListener('change', render);
}
bindTips(document.body);
setupTheme(render);
