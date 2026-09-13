import { ALL_FINGERS, buildGeometry, THUMB_ROW, type Finger, type GeometryKind } from './geometry.ts';
import { evaluate, type Options } from './evaluate.ts';
import { computeMetrics, type Metrics } from './metrics.ts';
import { nSensitivity } from './sensitivity.ts';
import { LAYOUTS, composeRomaji, type Layout } from './layouts/index.ts';
import { kunrei } from './romaji/kunrei.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA } from './sample-text-ja.ts';

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
  compare: $<HTMLTableElement>('compare'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  heatmap: $<HTMLDivElement>('heatmap'),
  perFinger: $<HTMLTableElement>('per-finger'),
  adjacent: $<HTMLTableElement>('adjacent'),
  sensitivity: $<HTMLDivElement>('sensitivity'),
};

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

const ROMAJI_TABLE = kunrei();

/** 入力方式ごとの配列と既定テキスト */
const MODES = {
  en: {
    layouts: LAYOUTS,
    sample: SAMPLE_TEXT.replace(/\s+/g, ' ').trim(),
  },
  ja: {
    layouts: LAYOUTS.map((l) => composeRomaji(`${l.id}-ja`, l.name, ROMAJI_TABLE, l)),
    sample: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
  },
} as const;

type ModeId = keyof typeof MODES;

const currentMode = () => MODES[el.mode.value as ModeId];

el.text.value = MODES.en.sample;
for (const layout of LAYOUTS) {
  el.detailLayout.append(new Option(layout.name, layout.id));
}

// 入力方式を変えたら既定テキストも入れ替える。ただし利用者が書き換えたものは残す。
// select は input と change の両方を発火するので、描画より先に走る input 側で入れ替える
function syncSampleText() {
  const untouched = Object.values(MODES).some((m) => m.sample === el.text.value);
  if (untouched) el.text.value = currentMode().sample;
}
el.mode.addEventListener('input', syncSampleText);
el.mode.addEventListener('change', syncSampleText);

function currentOptions(): Options {
  return {
    windowSize: Number(el.window.value),
    sfbHomeCost: el.sfbHome.checked,
  };
}

function render() {
  const geometry = buildGeometry(el.geometry.value as GeometryKind);
  const options = currentOptions();
  const text = el.text.value;
  el.windowOut.value = el.window.value;

  const results = currentMode().layouts.map((layout) => {
    const trace = evaluate(text, layout, geometry, options);
    return { layout, trace, metrics: computeMetrics(trace, geometry) };
  });

  const first = results[0].metrics;
  const parts = [`${text.length} 文字`, `${first.strokes} ステップ`, `${first.presses} 押下`];
  if (first.skipped) parts.push(`${first.skipped} 文字は配列上に無いため除外`);
  el.textMeta.textContent = parts.join(' / ');

  const errors = results.flatMap((r) => r.trace.errors);
  el.errors.textContent = errors.length ? `配列定義の不備: ${errors.join(' / ')}` : '';
  el.errors.hidden = errors.length === 0;

  renderCompare(results, geometry.pitchMm);
  renderDetail(results, geometry);
  renderSensitivity(text, geometry, options);
}

function renderCompare(
  results: { layout: Layout; metrics: Metrics }[],
  pitchMm: number,
) {
  const best = Math.min(...results.map((r) => r.metrics.totalUnits));
  const rows = results
    .map(({ layout, metrics }) => {
      const variance =
        metrics.adjacent.reduce((a, b) => a + b.variance, 0) / metrics.adjacent.length;
      const cls = metrics.totalUnits === best ? ' class="best"' : '';
      return `<tr${cls}>
        <td>${layout.name}</td>
        <td class="num">${metrics.strokes}</td>
        <td class="num">${metrics.totalUnits.toFixed(0)}</td>
        <td class="num">${(metrics.totalMm / 1000).toFixed(2)}</td>
        <td class="num">${metrics.meanPerStroke.toFixed(3)}</td>
        <td class="num">${metrics.sameFinger}</td>
        <td class="num">${((metrics.sameFinger / metrics.strokes) * 100).toFixed(1)}%</td>
        <td class="num">${variance.toFixed(4)}</td>
      </tr>`;
    })
    .join('');

  el.compare.innerHTML = `
    <thead><tr>
      <th>配列</th><th>ステップ</th><th>総距離 [u]</th><th>総距離 [m]</th>
      <th>1打鍵 [u]</th><th>同指連続</th><th>同指連続率</th><th>隣接指分散</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
  el.compare.dataset.pitch = String(pitchMm);
}

function renderDetail(
  results: { layout: Layout; metrics: Metrics }[],
  geometry: ReturnType<typeof buildGeometry>,
) {
  const wanted = el.detailLayout.value;
  const found =
    results.find((r) => r.layout.id === wanted || r.layout.id === `${wanted}-ja`) ?? results[0];
  const { metrics } = found;
  const layout = found.layout;

  // ヒートマップ
  const labels = layout.legends;
  const max = Math.max(1, ...metrics.keyCounts.values());
  const KEY = 46;
  const PAD = 8;
  let maxX = 0;
  let maxY = 0;
  const THUMB_W = 1.9;
  const keys = [...geometry.keys.values()].map((key) => {
    const count = metrics.keyCounts.get(key.id) ?? 0;
    const t = count / max;
    const thumb = key.row === THUMB_ROW;
    const w = (thumb ? THUMB_W : 1) * KEY;
    const x = (key.x - (thumb ? (THUMB_W - 1) / 2 : 0)) * KEY;
    const y = key.y * KEY;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + KEY);
    const label = labels.get(key.id) ?? '';
    const share = ((count / Math.max(1, metrics.strokes)) * 100).toFixed(1);
    // oklab で補間する。srgb だと暗い地色と暖色の中間が濁る
    return `<g>
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${KEY - 2}" rx="5"
        fill="color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))"
        stroke="var(--line)"><title>${label} — ${count} 打 (${share}%)</title></rect>
      <text x="${x + w / 2}" y="${y + KEY / 2 + 5}" text-anchor="middle"
        font-size="${thumb ? 12 : 15}" fill="${t > 0.55 ? 'var(--on-heat)' : 'var(--fg)'}"
        >${escapeHtml(label)}</text>
    </g>`;
  });

  el.heatmap.innerHTML =
    `<svg viewBox="0 0 ${maxX + PAD} ${maxY + PAD}" role="img" aria-label="打鍵頻度">${keys.join('')}</svg>`;

  // 指ごと
  const total = metrics.totalUnits || 1;
  el.perFinger.innerHTML = `
    <thead><tr><th>指</th><th>距離 [u]</th><th>割合</th></tr></thead>
    <tbody>${ALL_FINGERS.map((f) => {
      const d = metrics.perFinger[f];
      return `<tr><td>${FINGER_LABEL[f]}</td>
        <td class="num">${d.toFixed(1)}</td>
        <td class="num">${((d / total) * 100).toFixed(1)}%</td></tr>`;
    }).join('')}</tbody>`;

  // 隣接指
  el.adjacent.innerHTML = `
    <thead><tr><th>ペア</th><th>平均 [u]</th><th>分散</th></tr></thead>
    <tbody>${metrics.adjacent
      .map(
        (s) => `<tr><td>${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}</td>
          <td class="num">${s.mean.toFixed(3)}</td>
          <td class="num">${s.variance.toFixed(4)}</td></tr>`,
      )
      .join('')}</tbody>`;
}

function renderSensitivity(
  text: string,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
) {
  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const series = currentMode().layouts.map((layout) => ({
    name: layout.name,
    points: nSensitivity(text, layout, geometry, options, range),
  }));

  const W = 720;
  const H = 260;
  const M = { top: 12, right: 96, bottom: 30, left: 52 };
  const all = series.flatMap((s) => s.points.map((p) => p.totalUnits));
  // テキストが空、または配列で 1 文字も打てない場合に 0 除算へ落ちないようにする
  const yMax = Math.max(1, Math.max(0, ...all) * 1.05);
  const x = (n: number) =>
    M.left + (n / (range.length - 1)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / yMax) * (H - M.top - M.bottom);

  const palette = [1, 2, 3, 4, 5].map((i) => `var(--series-${i})`);
  // ラベルが重ならないよう、終端の y を昇順に並べて最小間隔を確保する
  const labels = series
    .map((s, i) => ({
      name: s.name,
      color: palette[i % palette.length],
      y: y(s.points[s.points.length - 1].totalUnits),
    }))
    .sort((a, b) => a.y - b.y);
  const GAP = 14;
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + GAP);
  }

  const paths = series
    .map((s, i) => {
      const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${x(j)},${y(p.totalUnits)}`).join('');
      return `<path d="${d}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="2"/>`;
    })
    .join('');

  const lines =
    paths +
    labels
      .map(
        (l) => `<text x="${x(range.length - 1) + 8}" y="${l.y + 4}"
          font-size="12" fill="${l.color}">${l.name}</text>`,
      )
      .join('');

  const xTicks = range
    .map((n, j) => `<text x="${x(j)}" y="${H - 10}" text-anchor="middle" font-size="11"
      fill="var(--muted)">${n}</text>`)
    .join('');
  const yTicks = [0, 0.5, 1]
    .map((t) => {
      const v = yMax * t;
      return `<line x1="${M.left}" y1="${y(v)}" x2="${W - M.right}" y2="${y(v)}"
        stroke="var(--line)"/>
        <text x="${M.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11"
          fill="var(--muted)">${v.toFixed(0)}</text>`;
    })
    .join('');

  el.sensitivity.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="N を振った時の総移動距離">
    ${yTicks}${lines}${xTicks}
    <text x="${(M.left + W - M.right) / 2}" y="${H - 10}" text-anchor="middle"
      font-size="11" fill="var(--muted)" opacity="0"></text>
  </svg>`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

for (const node of [el.mode, el.geometry, el.window, el.sfbHome, el.text, el.detailLayout]) {
  node.addEventListener('input', render);
  node.addEventListener('change', render);
}
render();
