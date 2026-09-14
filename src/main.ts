import { buildGeometry, ADJACENT_PAIRS, FINGERS, THUMB_ROW, type Finger, type GeometryKind } from './geometry.ts';
import { evaluate, type Options, type Trace } from './evaluate.ts';
import { computeMetrics, type Metrics } from './metrics.ts';
import { nSensitivity } from './sensitivity.ts';
import { LAYOUTS, LAYOUTS_JA, type Layout } from './layouts/index.ts';
import { SAMPLE_TEXT } from './sample-text.ts';
import { SAMPLE_TEXT_JA } from './sample-text-ja.ts';
import { bindTips, columnChart, escapeText, lineChart, barChart, matrixChart } from './chart.ts';
import { setupTheme } from './theme.ts';
import {
  ROMAJI_RULES,
  ROW_LABELS,
  load as loadUserLayouts,
  newId,
  save as saveUserLayouts,
  toJapaneseLayout,
  toLayout,
  validate,
  type RomajiRuleId,
  type UserLayout,
} from './user-layouts.ts';
import { QWERTY_LEGEND } from './geometry.ts';

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
  sensitivityScale: $<HTMLDivElement>('sensitivity-scale'),
  picker: $<HTMLDivElement>('layout-picker'),
  newName: $<HTMLInputElement>('new-name'),
  newRows: $<HTMLDivElement>('new-rows'),
  newRomaji: $<HTMLSelectElement>('new-romaji'),
  newError: $<HTMLParagraphElement>('new-error'),
  addLayout: $<HTMLButtonElement>('add-layout'),
  detailLayout: $<HTMLSelectElement>('detail-layout'),
  heatmap: $<HTMLDivElement>('heatmap'),
  fingerChart: $<HTMLDivElement>('finger-chart'),
  adjacentChart: $<HTMLDivElement>('adjacent-chart'),
  fingerMatrix: $<HTMLDivElement>('finger-matrix'),
  pressMatrix: $<HTMLDivElement>('press-matrix'),
  adjacentMatrix: $<HTMLDivElement>('adjacent-matrix'),
};

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差指', LT: '左親指',
  RT: '右親指', RI: '右人差指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

/** 図の軸に載せる短い指名。左右は塊のラベルで示す */
const SHORT_FINGER: Record<Finger, string> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

/**
 * 配列の識別色。色は一覧での位置に固定するので、選択を外しても残りの色は動かない。
 * スロットは 8 つで、自作配列を足して超えた分は巡回する（被って読みにくければ
 * 選択を外せばよい）。
 */
const PALETTE_SIZE = 8;
const SERIES = (i: number) => `var(--series-${(i % PALETTE_SIZE) + 1})`;

const SAMPLES = {
  en: SAMPLE_TEXT.replace(/\s+/g, ' ').trim(),
  ja: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
} as const;

/** 既定で表示する配列 */
const INITIAL = {
  en: ['qwerty', 'dvorak', 'colemak', 'colemak-dh', 'workman', 'oonishi'],
  ja: ['qwerty', 'colemak-dh', 'oonishi', 'oonishi-custom-combo', 'naginata-v18'],
} as const;

let userLayouts: UserLayout[] = loadUserLayouts();

/** 組み込みの配列に自作のものを足した一覧。自作は末尾に並ぶ */
function layoutsOf(mode: ModeId): Layout[] {
  const built = mode === 'en' ? LAYOUTS : LAYOUTS_JA;
  const mine = userLayouts.map((d) => (mode === 'en' ? toLayout(d) : toJapaneseLayout(d)));
  return [...built, ...mine];
}

const MODES = {
  en: { get layouts() { return layoutsOf('en'); }, sample: SAMPLES.en, initial: INITIAL.en },
  ja: { get layouts() { return layoutsOf('ja'); }, sample: SAMPLES.ja, initial: INITIAL.ja },
};

/** 表示する配列の id。モードごとに覚える */
const selected: Record<ModeId, Set<string>> = {
  en: new Set(),
  ja: new Set(),
};

type ModeId = 'en' | 'ja';
const currentModeId = () => el.mode.value as ModeId;
const currentMode = () => MODES[currentModeId()];

/** 選択されている配列。色のスロットは選択順ではなく一覧順に固定する */
function activeLayouts(): Layout[] {
  const set = selected[currentModeId()];
  return currentMode().layouts.filter((l) => set.has(l.id));
}

el.text.value = currentMode().sample;

/** 配列を追加する欄。段ごとに 1 行、数字段は任意 */
function setupAddForm() {
  const inputs: HTMLInputElement[] = ROW_LABELS.map((label, i) => {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = QWERTY_LEGEND[i];
    if (i === 0) input.dataset.optional = 'true';
    row.append(span, input);
    el.newRows.append(row);
    return input;
  });

  for (const [id, rule] of Object.entries(ROMAJI_RULES)) {
    el.newRomaji.append(new Option(rule.name, id));
  }

  el.addLayout.addEventListener('click', () => {
    const rows = inputs.map((i) => i.value.trim());
    const errors = validate(rows);
    el.newError.textContent = errors.join(' / ');
    el.newError.hidden = errors.length === 0;
    if (errors.length) return;

    const def: UserLayout = {
      id: newId(),
      name: el.newName.value.trim() || '自作配列',
      rows: [rows[0], rows[1], rows[2], rows[3]],
      romaji: el.newRomaji.value as RomajiRuleId,
    };
    userLayouts = [...userLayouts, def];
    saveUserLayouts(userLayouts);

    // 追加したものは自動で表示に入れる
    selected.en.add(def.id);
    selected.ja.add(def.id);

    for (const input of inputs) input.value = '';
    el.newName.value = '';
    fillPicker();
    fillDetailOptions();
    render();
  });
}

function removeUserLayout(id: string) {
  userLayouts = userLayouts.filter((l) => l.id !== id);
  saveUserLayouts(userLayouts);
  selected.en.delete(id);
  selected.ja.delete(id);
  fillPicker();
  fillDetailOptions();
  render();
}

/** 配列の選択欄。色は一覧での位置に固定するので、外しても他の色は動かない */
function fillPicker() {
  const set = selected[currentModeId()];
  el.picker.replaceChildren();
  currentMode().layouts.forEach((layout, i) => {
    const on = set.has(layout.id);
    const label = document.createElement('label');
    label.className = on ? '' : 'off';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('change', () => {
      if (box.checked) set.add(layout.id);
      else set.delete(layout.id);
      label.className = box.checked ? '' : 'off';
      fillDetailOptions();
      render();
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = SERIES(i);

    label.append(box, swatch, document.createTextNode(layout.name));

    if (userLayouts.some((u) => u.id === layout.id)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost remove';
      remove.textContent = '削除';
      remove.title = `${layout.name} を削除する`;
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        removeUserLayout(layout.id);
      });
      label.append(remove);
    }

    el.picker.append(label);
  });
}

/** 詳細セレクタはモードで配列の顔ぶれが変わるので作り直す */
function fillDetailOptions() {
  const keep = el.detailLayout.value;
  const layouts = activeLayouts();
  el.detailLayout.replaceChildren();
  for (const layout of layouts) {
    el.detailLayout.append(new Option(layout.name, layout.id));
  }
  if (layouts.length === 0) return;
  el.detailLayout.value = layouts.some((l) => l.id === keep) ? keep : layouts[0].id;
}

function syncSampleText() {
  const untouched = Object.values(MODES).some((m) => m.sample === el.text.value);
  if (untouched) el.text.value = currentMode().sample;
}

interface Result {
  layout: Layout;
  trace: Trace;
  metrics: Metrics;
  /** 一覧での位置。色はこれで決まるので、選択を外しても他の色は動かない */
  slot: number;
}

function render() {
  const geometry = buildGeometry(el.geometry.value as GeometryKind);
  const options: Options = {
    windowSize: Number(el.window.value),
    sfbHomeCost: el.sfbHome.checked,
  };
  const text = el.text.value;
  el.windowOut.value = el.window.value;

  const set = selected[currentModeId()];
  const results: Result[] = currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((r) => set.has(r.layout.id))
    .map(({ layout, slot }) => {
      const trace = evaluate(text, layout, geometry, options);
      return { layout, trace, metrics: computeMetrics(trace, geometry), slot };
    });

  if (results.length === 0) {
    el.textMeta.textContent = '配列を 1 つ以上選ぶ';
    el.compareChart.innerHTML = '';
    el.compare.innerHTML = '';
    el.sensitivity.innerHTML = '';
    el.heatmap.innerHTML = '';
    el.fingerChart.innerHTML = '';
    el.adjacentChart.innerHTML = '';
    el.fingerMatrix.innerHTML = '';
    el.pressMatrix.innerHTML = '';
    el.adjacentMatrix.innerHTML = '';
    el.errors.hidden = true;
    return;
  }

  // ステップ数と押下数は配列ごとに異なるので表に出す。ここは入力そのものの大きさだけ
  const parts = [`${[...text].length} 文字`];
  const skipped = results.filter((r) => r.trace.skipped > 0);
  if (skipped.length) {
    const worst = Math.max(...skipped.map((r) => r.trace.skipped));
    parts.push(`${skipped.length} 配列で最大 ${worst} 文字が打てない`);
  }
  el.textMeta.textContent = parts.join(' / ');

  const errors = results.flatMap((r) => r.trace.errors);
  el.errors.textContent = errors.length ? `配列定義の不備: ${errors.join(' / ')}` : '';
  el.errors.hidden = errors.length === 0;

  renderCompare(results);
  renderMatrices(results);
  renderSensitivity(text, geometry, options);
  renderDetail(results, geometry);
}

function renderCompare(results: Result[]) {
  const best = Math.min(...results.map((r) => r.metrics.totalUnits));

  el.compareChart.innerHTML = barChart(
    results.map((r) => ({
      label: r.layout.name,
      value: r.metrics.totalUnits,
      color: SERIES(r.slot),
      emphasise: r.metrics.totalUnits === best,
      tip:
        `${escapeText(r.layout.name)}<br>総移動距離 <b>${r.metrics.totalUnits.toFixed(0)} u</b>` +
        ` (${(r.metrics.totalMm / 1000).toFixed(2)} m)<br>` +
        `1 打鍵あたり <b>${r.metrics.meanPerStroke.toFixed(3)} u</b>` +
        `<br>1 文字あたり <b>${r.metrics.perCharUnits.toFixed(3)} u</b>` +
        `<br>アクション/文字 <b>${r.metrics.perCharSteps.toFixed(3)}</b>` +
        `<br>押下/文字 <b>${r.metrics.perCharPresses.toFixed(3)}</b>`,
    })),
    // 日本語の配列名は長い。ラベル欄は widest に合わせて広めに取る
    { format: (v) => v.toFixed(0), labelWidth: 150 },
  );

  const rows = results
    .map((r) => {
      const m = r.metrics;
      const adjacentMean = m.adjacent.reduce((a, b) => a + b.mean, 0) / m.adjacent.length;
      return `<tr${m.totalUnits === best ? ' class="best"' : ''}>
        <td><span class="swatch" style="background:${SERIES(r.slot)}"></span>${escapeText(r.layout.name)}</td>
        <td class="num">${m.strokes}</td>
        <td class="num">${m.totalUnits.toFixed(0)}</td>
        <td class="num">${(m.totalMm / 1000).toFixed(2)}</td>
        <td class="num">${m.meanPerStroke.toFixed(3)}</td>
        <td class="num">${m.perCharUnits.toFixed(3)}</td>
        <td class="num">${m.perCharSteps.toFixed(3)}</td>
        <td class="num">${m.perCharPresses.toFixed(3)}</td>
        <td class="num">${m.sameFinger}</td>
        <td class="num">${((m.sameFinger / Math.max(1, m.strokes)) * 100).toFixed(1)}%</td>
        <td class="num">${adjacentMean.toFixed(3)}</td>
      </tr>`;
    })
    .join('');

  el.compare.innerHTML = `
    <thead><tr>
      <th>配列</th><th>ステップ</th><th>距離 [u]</th><th>距離 [m]</th>
      <th>1打鍵 [u]</th><th>1文字 [u]</th><th>アクション/文字</th><th>押下/文字</th>
      <th>同指連続</th><th>同指連続率</th><th>隣接指平均 [u]</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

/**
 * 配列 × 指の粒度でマトリックスに並べる。行は総移動距離の表と同じ選択順
 * （色のスロットが他の図と揃うことを優先し、総距離順の並べ替えはしない）。
 *
 * 指ごとの移動距離は入力文字数で正規化する（u/文字）。生の u は評価テキストの
 * 長さに引きずられるため、テキストを変えても配列間の比較が揺れないようにする。
 * 隣接指の平均・最大値はもともと打鍵ごとの統計であり文字数に依存しないので、
 * こちらは生値のまま出す（比較表の「隣接指平均」列と同じ単位）。
 */
function renderMatrices(results: Result[]) {
  const fingerRows = results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: FINGERS.map((f) => {
      const perChar = r.metrics.perFinger[f] / Math.max(1, r.metrics.inputChars);
      const share = (r.metrics.perFinger[f] / Math.max(1e-9, r.metrics.totalUnits)) * 100;
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} u/文字</b> (全体の ${share.toFixed(1)}%)`,
      };
    }),
  }));

  el.fingerMatrix.innerHTML = matrixChart(
    fingerRows,
    FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 4,
      columnGroupLabels: ['左手', '右手'],
    },
  );

  const pressRows = results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: FINGERS.map((f) => {
      const perChar = r.metrics.perFingerPresses[f] / Math.max(1, r.metrics.inputChars);
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} 押下/文字</b><br>` +
          `押下 <b>${r.metrics.perFingerPresses[f]}</b> 回`,
      };
    }),
  }));

  el.pressMatrix.innerHTML = matrixChart(
    pressRows,
    FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 4,
      columnGroupLabels: ['左手', '右手'],
    },
  );

  const adjacentRows = results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: r.metrics.adjacent.map((s) => ({
      value: s.mean,
      tip:
        `${escapeText(r.layout.name)} / ${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `平均 <b>${s.mean.toFixed(3)} u</b><br>` +
        `実測最大 <b>${s.max.toFixed(3)} u</b><br>標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
  }));

  el.adjacentMatrix.innerHTML = matrixChart(
    adjacentRows,
    ADJACENT_PAIRS.map((p) => `${SHORT_FINGER[p[0]]}–${SHORT_FINGER[p[1]]}`),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 3,
      columnGroupLabels: ['左手', '右手'],
    },
  );
}

/**
 * 相対は N=0 を 100% とした減り方、絶対はそのままの総移動距離。
 * 相対は傾きの比較に、絶対は配列間の差の比較に効く。
 */
type SensitivityScale = 'relative' | 'absolute';
let sensitivityScale: SensitivityScale = 'relative';

function renderSensitivity(
  text: string,
  geometry: ReturnType<typeof buildGeometry>,
  options: Options,
) {
  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const relative = sensitivityScale === 'relative';
  const set = selected[currentModeId()];
  const series = currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((s) => set.has(s.layout.id))
    .map(({ layout, slot }) => {
    const points = nSensitivity(text, layout, geometry, options, range);
    const base = points[0].totalUnits || 1;
    return {
      name: layout.name,
      color: SERIES(slot),
      points: points.map((p) => ({
        x: p.windowSize,
        y: relative ? (p.totalUnits / base) * 100 : p.totalUnits,
        // 絶対表示では y 自身が生値なので併記しない
        raw: relative ? p.totalUnits : undefined,
      })),
    };
  });
  // N を増やしても候補集合が広がるだけで距離は減る一方なので、相対値は 100% を超えない。
  // 上端を 100% に固定して、自動調整で 105% のような目盛りが出るのを防ぐ
  el.sensitivity.innerHTML = relative
    ? lineChart(series, range, (v) => `${v.toFixed(0)}%`, { yMax: 100 })
    : lineChart(series, range, (v) => `${v.toFixed(0)} u`);
}

function renderDetail(results: Result[], geometry: ReturnType<typeof buildGeometry>) {
  const found = results.find((r) => r.layout.id === el.detailLayout.value) ?? results[0];
  const { metrics, layout } = found;

  renderHeatmap(metrics, layout, geometry);

  const total = metrics.totalUnits || 1;
  // 並び順が手の左右と一致するよう、左小指から右小指へ横に並べる
  el.fingerChart.innerHTML = columnChart(
    FINGERS.map((f) => ({
      label: SHORT_FINGER[f],
      group: f[0] === 'L' ? '左手' : '右手',
      value: metrics.perFinger[f],
      tip: `${FINGER_LABEL[f]}<br>移動 <b>${metrics.perFinger[f].toFixed(1)} u</b>` +
        ` (全体の ${((metrics.perFinger[f] / total) * 100).toFixed(1)}%)<br>` +
        `押下 <b>${metrics.perFingerPresses[f]}</b> 回` +
        ` (${((metrics.perFingerPresses[f] / Math.max(1, metrics.presses)) * 100).toFixed(1)}%)`,
    })),
    { format: (v) => v.toFixed(0) },
  );

  el.adjacentChart.innerHTML = columnChart(
    metrics.adjacent.map((s) => ({
      label: `${SHORT_FINGER[s.pair[0]]}–${SHORT_FINGER[s.pair[1]]}`,
      group: s.pair[0][0] === 'L' ? '左手' : '右手',
      value: s.mean,
      tip: `${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `平均 <b>${s.mean.toFixed(3)} u</b><br>` +
        `実測最大 <b>${s.max.toFixed(3)} u</b><br>` +
        `標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
    { format: (v) => v.toFixed(3) },
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

function setSensitivityScale(scale: SensitivityScale) {
  sensitivityScale = scale;
  for (const button of el.sensitivityScale.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scale === scale));
  }
  render();
}
el.sensitivityScale.addEventListener('click', (e) => {
  const button = (e.target as Element).closest<HTMLButtonElement>('button[data-scale]');
  if (button) setSensitivityScale(button.dataset.scale as SensitivityScale);
});

function onModeChange() {
  syncSampleText();
  fillPicker();
  fillDetailOptions();
}
el.mode.addEventListener('input', onModeChange);
el.mode.addEventListener('change', onModeChange);
for (const node of [el.mode, el.geometry, el.window, el.sfbHome, el.text, el.detailLayout]) {
  node.addEventListener('input', render);
  node.addEventListener('change', render);
}
// 既定の選択を用意してから初回描画する
for (const id of ['en', 'ja'] as ModeId[]) {
  for (const key of MODES[id].initial) selected[id].add(key);
  for (const def of userLayouts) selected[id].add(def.id);
}
setupAddForm();
fillPicker();
fillDetailOptions();
bindTips(document.body);
setupTheme(render);
