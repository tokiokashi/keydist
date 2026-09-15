/**
 * 「計算方法」モーダルに置く図解（仕様 §7 R3〜R5・§8・§9）。
 *
 * 固定例を評価器に通してから描く。図の数値を手で持たないので、
 * モデルを直せば図もそのまま追従する。
 */
import { escapeAttr, escapeText } from './chart.ts';
import { evaluate } from './evaluate.ts';
import { buildGeometry, dist, HOME_ROW, THUMB_ROW, type Finger, type Geometry, type Point } from './geometry.ts';
import { LAYOUT_BY_ID, withRomaji } from './layouts/index.ts';
import { ROMAJI_RULES } from './romaji/rules.ts';

/** 図の条件。仕様とずれないよう、脇に必ず出す */
export const FIGURE_TEXT = 'じょうほうをあつめる';
/** 同指連続でホームキーを打つ例（§8）。本文の例とは別の語を使う */
export const SFB_TEXT = 'いく';
const FIGURE_LAYOUT_ID = 'qwerty';
const FIGURE_SHAPE = 'row-staggered';
const FIGURE_ROMAJI = ROMAJI_RULES.qwerty.name;
const FIGURE_WINDOW = 3;
/** 追う指。ホームは j */
const FOCUS_FINGER: Finger = 'RI';

const KEY = 24;
const PAD = 8;
/** 盤面に出す段。数字段と親指は例に出てこないので省く */
const ROWS = [1, HOME_ROW, 3];

export interface FigurePress {
  /** 1 始まりの打鍵番号 */
  number: number;
  keyId: string;
  finger: Finger;
  gap: number;
  distance: number;
}

/** 固定例を評価して、押下を 1 列に並べる */
export function figurePresses(geometry: Geometry, text: string = FIGURE_TEXT): FigurePress[] {
  const layout = withRomaji(LAYOUT_BY_ID.get(FIGURE_LAYOUT_ID)!, ROMAJI_RULES.qwerty.table());
  const trace = evaluate(text, layout, geometry, {
    windowSize: FIGURE_WINDOW,
    sfbHomeCost: true,
  });
  const presses: FigurePress[] = [];
  for (const stroke of trace.strokes) {
    for (const press of stroke.presses) {
      presses.push({
        number: presses.length + 1,
        keyId: press.keys[0].id,
        finger: press.finger,
        gap: press.gap,
        distance: press.distance,
      });
    }
  }
  return presses;
}

/** 末尾の 0 は落とす。1.000 → 1、1.250 → 1.25、1.0307… → 1.031 */
const n3 = (v: number) => String(Number(v.toFixed(3)));
const u = (v: number) => `${n3(v)} u`;

/** 打鍵順は丸数字で出す。通し番号より目で追いやすい */
const circled = (i: number) => (i >= 1 && i <= 20 ? String.fromCharCode(0x245f + i) : `(${i})`);

interface Arrow {
  from: Point;
  to: Point;
  adopted: boolean;
  tip: string;
}

/** 線の両端をキーの内側に詰めてから、三角の先端を付ける */
function arrow(a: Arrow): string {
  const color = a.adopted ? 'var(--accent)' : 'var(--muted)';
  const dx = a.to.x - a.from.x;
  const dy = a.to.y - a.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = KEY * 0.42;
  const x1 = a.from.x + ux * inset;
  const y1 = a.from.y + uy * inset;
  const x2 = a.to.x - ux * inset;
  const y2 = a.to.y - uy * inset;
  const head = 7;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const wing = head * 0.5;
  const points = `${x2},${y2} ${bx - uy * wing},${by + ux * wing} ${bx + uy * wing},${by - ux * wing}`;
  return `<g data-tip="${escapeAttr(a.tip)}" opacity="${a.adopted ? 1 : 0.8}">
    <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"
      stroke="${color}" stroke-width="${a.adopted ? 2.2 : 1.6}" stroke-linecap="round"
      ${a.adopted ? '' : 'stroke-dasharray="4 3"'}/>
    <polygon points="${points}" fill="${color}"/>
  </g>`;
}

interface BoardArrow {
  fromKey: string;
  toKey: string;
  adopted: boolean;
  /** 盤面の下に出す 1 行 */
  label: string;
}

interface BoardSpec {
  caption: string;
  /** 表示する打鍵列。並び順のまま ①②③… を振る */
  seq: FigurePress[];
  /** seq のうち濃く出す打鍵の番号 */
  focus: number[];
  arrows: BoardArrow[];
  /** 矢印に紐づかない補足行 */
  notes?: string[];
}

/** 盤面の枠。すべての図で同じ座標系を使う */
function frame(geometry: Geometry) {
  const keys = [...geometry.keys.values()].filter((k) => ROWS.includes(k.row) && k.row !== THUMB_ROW);
  const minX = Math.min(...keys.map((k) => k.x));
  const minY = Math.min(...keys.map((k) => k.y));
  const px = (k: { x: number }) => PAD + (k.x - minX) * KEY;
  const py = (k: { y: number }) => PAD + (k.y - minY) * KEY;
  const center = (id: string): Point => {
    const k = geometry.keys.get(id)!;
    return { x: px(k) + KEY / 2, y: py(k) + KEY / 2 };
  };
  const width = Math.max(...keys.map((k) => px(k) + KEY)) + PAD;
  const height = Math.max(...keys.map((k) => py(k) + KEY)) + 6;
  return { keys, px, py, center, width, height };
}

/** 追う指のホームキー */
function homeKeyId(geometry: Geometry): string {
  const home = geometry.homes[FOCUS_FINGER];
  return [...geometry.keys.values()].find((k) => k.x === home.x && k.y === home.y)!.id;
}

function board(geometry: Geometry, spec: BoardSpec): string {
  const { keys, px, py, center, width, height } = frame(geometry);
  const focus = new Set(spec.focus);
  const homeId = homeKeyId(geometry);

  /** キー id → その盤面での丸数字（同じキーを 2 回打つ場合は複数付く） */
  const marks = new Map<string, { mark: string; focused: boolean; press: FigurePress }[]>();
  spec.seq.forEach((press, i) => {
    const list = marks.get(press.keyId) ?? [];
    list.push({ mark: circled(i + 1), focused: focus.has(press.number), press });
    marks.set(press.keyId, list);
  });

  const cells = keys.map((key) => {
    const hits = marks.get(key.id) ?? [];
    const isFocus = hits.some((h) => h.focused);
    const inSeq = hits.length > 0;
    const isHome = key.id === homeId && !isFocus;
    const x = px(key);
    const y = py(key);
    const fill = isFocus
      ? 'color-mix(in oklab, var(--accent) 16%, var(--panel))'
      : inSeq
        ? 'var(--panel-2)'
        : 'var(--panel)';
    const stroke = isFocus ? 'var(--accent)' : inSeq || isHome ? 'var(--line-strong)' : 'var(--line)';
    const textFill = isFocus ? 'var(--fg)' : inSeq ? 'var(--muted)' : 'var(--line-strong)';
    const badge = inSeq
      ? `<text x="${x + 2}" y="${y + 9}" font-size="9" text-anchor="start"
          fill="${isFocus ? 'var(--accent)' : 'var(--muted)'}" pointer-events="none"
          >${hits.map((h) => h.mark).join('')}</text>`
      : '';
    const tipParts = hits.map((h) =>
      `${h.mark} <b>${escapeText(h.press.keyId)}</b> 移動 ${u(h.press.distance)}`,
    );
    if (isHome) tipParts.push('右手人差し指のホーム');
    const tip = tipParts.join('<br>');
    const group = tip ? `<g data-tip="${escapeAttr(tip)}">` : '<g>';
    return `${group}
      <rect x="${x + 1}" y="${y + 1}" width="${KEY - 2}" height="${KEY - 2}" rx="4"
        fill="${fill}" stroke="${stroke}" stroke-width="${isFocus ? 2 : 1}"
        ${isHome ? 'stroke-dasharray="3 2"' : ''}/>
      <text x="${x + KEY / 2}" y="${y + KEY / 2 + 5.5}" text-anchor="middle" font-size="11"
        fill="${textFill}" pointer-events="none">${escapeText(key.id)}</text>
      ${badge}
    </g>`;
  });

  const arrows = spec.arrows.map((a) =>
    arrow({ from: center(a.fromKey), to: center(a.toKey), adopted: a.adopted, tip: a.label }),
  );

  const lines = [...spec.arrows.map((a) => ({ text: a.label, strong: a.adopted })),
    ...(spec.notes ?? []).map((text) => ({ text, strong: false }))];
  const lineY = (i: number) => height + 16 + i * 14;
  const text = lines.map((line, i) =>
    `<text x="${PAD}" y="${lineY(i)}" font-size="11"
      fill="${line.strong ? 'var(--fg)' : 'var(--muted)'}">${escapeText(line.text)}</text>`);
  const H = lines.length ? lineY(lines.length - 1) + 8 : height + 8;

  const order = spec.seq.map((p, i) => `${circled(i + 1)}${p.keyId}`).join(' ');
  return `<figure class="gap-board">
    <figcaption>${escapeText(spec.caption)}<span class="gap-order">${escapeText(order)}</span></figcaption>
    <svg viewBox="0 0 ${width} ${H}" role="img"
      aria-label="${escapeAttr(`${spec.caption}。打鍵順 ${order}。${lines.map((l) => l.text).join(' ')}`)}"
      >${cells.join('')}${arrows.join('')}${text.join('')}</svg>
  </figure>`;
}

/** 図解の本体。条件・本文・盤面をまとめて返す */
export function gapFigure(geometry: Geometry): string {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  const romaji = presses.map((p) => p.keyId).join('');
  const homeId = homeKeyId(geometry);
  const home = geometry.homes[FOCUS_FINGER];

  const between = (fromKey: string, toKey: string) =>
    dist(geometry.keys.get(fromKey)!, geometry.keys.get(toKey)!);
  const toHome = (toKey: string) => dist(home, geometry.keys.get(toKey)!);

  const ortho = buildGeometry('ortholinear');
  const orthoD = dist(ortho.homes[FOCUS_FINGER], ortho.keys.get('u')!);
  const jU = geometry.keys.get('u')!;
  const jHome = geometry.keys.get(homeId)!;
  const dx = jU.x - jHome.x;
  const dy = jU.y - jHome.y;

  const sfb = figurePresses(geometry, SFB_TEXT);
  const sfbFrom = sfb[0];
  const sfbTo = sfb[1];

  const boardHomeToU = board(geometry, {
    caption: '「jou」— ホームから u へ',
    seq: [at(1), at(2), at(3)],
    focus: [1, 3],
    arrows: [{
      fromKey: homeId, toKey: 'u', adopted: true,
      label: `${homeId} → u ＝ ${u(at(3).distance)}`,
    }],
    notes: [`dx ${n3(dx)} ／ dy ${n3(dy)}`],
  });

  const boardUToH = board(geometry, {
    caption: '「uh」— 直前も同じ指',
    seq: [at(3), at(4)],
    focus: [3, 4],
    arrows: [
      { fromKey: 'u', toKey: 'h', adopted: true, label: `u → h ＝ ${u(at(4).distance)}（加算）` },
      { fromKey: homeId, toKey: 'h', adopted: false, label: `${homeId} → h ＝ ${u(toHome('h'))}（戻る時間が無く、候補にならない）` },
    ],
  });

  const boardUToM = board(geometry, {
    caption: '「um」— 直前も同じ指',
    seq: [at(11), at(12)],
    focus: [11, 12],
    arrows: [
      { fromKey: 'u', toKey: 'm', adopted: true, label: `u → m ＝ ${u(at(12).distance)}（加算）` },
      { fromKey: homeId, toKey: 'm', adopted: false, label: `${homeId} → m ＝ ${u(toHome('m'))}（戻る時間が無く、候補にならない）` },
    ],
  });

  const boardInside = board(geometry, {
    caption: '「meru」— 間に 2 打鍵。窓の内側',
    seq: [at(12), at(13), at(14), at(15)],
    focus: [12, 15],
    arrows: [
      { fromKey: homeId, toKey: 'u', adopted: true, label: `${homeId} → u ＝ ${u(toHome('u'))}（採用）` },
      { fromKey: 'm', toKey: 'u', adopted: false, label: `m → u ＝ ${u(between('m', 'u'))}` },
    ],
  });

  const boardOutside = board(geometry, {
    caption: '「uwoatu」— 間に 4 打鍵。窓の外',
    seq: [at(6), at(7), at(8), at(9), at(10), at(11)],
    focus: [6, 11],
    arrows: [
      { fromKey: homeId, toKey: 'u', adopted: true, label: `${homeId} → u ＝ ${u(at(11).distance)}` },
    ],
    notes: [`残っていれば ${u(between('u', 'u'))} だが、g = ${at(11).gap} > N なので候補にならない`],
  });

  const boardSfb = board(geometry, {
    caption: '「ik」— ホームキーへ戻る打鍵',
    seq: [sfbFrom, sfbTo],
    focus: [sfbFrom.number, sfbTo.number],
    arrows: [{
      fromKey: sfbFrom.keyId, toKey: sfbTo.keyId, adopted: true,
      label: `${sfbFrom.keyId} → ${sfbTo.keyId} ＝ ${u(sfbTo.distance)}（既定では加算）`,
    }],
  });

  return `<div class="gap-figure">
    <h3>前提条件</h3>
    <p>このアプリでの距離の算出方法を図解します。</p>
    <p class="note">条件: ${escapeText(FIGURE_LAYOUT_ID.toUpperCase())} ／ ${escapeText(FIGURE_SHAPE)} ／ N = ${FIGURE_WINDOW} ／ ${escapeText(FIGURE_ROMAJI)}</p>
    <p>「情報を集める」という文章をタイピングする場合を例として、距離の計算と N の取り扱いを説明します。ここでは人差し指の距離だけに注目します。</p>
    <p>このアプリはそれぞれの指で動きを追跡し、移動距離を求めます。実際は全ての指でこの計算を行っていると思ってください。</p>
    <p class="note">「${escapeText(FIGURE_TEXT)}」は ${escapeText(romaji)} の ${presses.length} 打鍵になります。</p>

    <h3>「情報」をタイピングする</h3>
    <p>冒頭の ${escapeText(homeId)} → o → u とタイピングする時、人差し指は ${escapeText(homeId)} → u と移動します。何もない状態で各指はホームポジションにいると定義しているため、${escapeText(homeId)} → u の距離を移動することになります。</p>
    <p>この際、キーボードの物理配列により斜め移動になるため、座標を元に d = ${u(at(3).distance)}（u はキーピッチ）と求まります。格子配列であるオーソリニアの場合は真上の移動になるため d = ${u(orthoD)} となります。</p>
    ${boardHomeToU}
    <p>次に u → h と移動します。ホームの ${escapeText(homeId)} からなら ${u(toHome('h'))} と近いのですが、直前も同じ指なのでホームに戻る時間がありません。そのため u → h の ${u(at(4).distance)} が加算されます。</p>
    ${boardUToH}
    <p class="note">実際の QWERTY では運指最適化によって「jouhou」の「u」を中指で取るなど、標準運指を崩して最適化すると思いますが、今のモデルでは運指最適化を行わないため、担当する指で順番にタイピングしていくことになります。この部分は QWERTY の数字が特に悪化しているように見える要因となるため、今後の機能改善の候補としています。</p>

    <h3>「集める」をタイピングする</h3>
    <p>ここから N の設定値による距離算出の変化を説明します。ここでは N = ${FIGURE_WINDOW} と設定しているものとします。</p>
    <h4>「at<b>um</b>er<b>u</b>」の部分について</h4>
    <ol class="gap-steps">
      <li>
        <p>最初の u → m は前述の通り連続のため、その距離 d を計算します。</p>
        ${boardUToM}
      </li>
      <li>
        <p>次の m → u はあいだに 2 打鍵分のキーが含まれますが N = ${FIGURE_WINDOW} の範囲内であるため、${escapeText(homeId)} → u の距離と m → u の距離の大小を比較して短い方を移動距離とします。当然ホームからの方が近いのでそちらが採用されますが、これは他の指が動いているあいだに人差し指はホームポジションに戻れていると考えるためです。</p>
        ${boardInside}
      </li>
      <li>
        <p>ここで「jouho<b>u</b>woat<b>u</b>meru」の部分にも人差し指の繋がりが見つかります。2 つの <b>u</b> のあいだの打鍵数は ${at(11).gap} となりますが、設定している ${at(11).gap} &gt; N となり、指を残していないと判定されてその移動距離は ${escapeText(homeId)} → u の距離 d となります。</p>
        <p>仮にこの <b>u</b> 同士のあいだに人差し指を動かさなくて良い先読みができる（${at(11).gap} ≤ N）のであれば、2 つ目の <b>u</b> にかかる移動距離は d = ${u(between('u', 'u'))} となります。</p>
        ${boardOutside}
      </li>
    </ol>
    <p class="note">あいだに含まれる打鍵数 g に対して 1 ≤ g ≤ N の場合に、この比較が発生するということになります。5 打鍵先まで先読みすると設定したい場合 N = 4 となるので注意が必要です。</p>

    <h3>連続打鍵でホームポジションのキーを押す場合</h3>
    <p>もう一つ、運指コストの評価のために設定しているルールがあります。</p>
    <p>「行く」のように（最適化をせず）「ik」を中指で順番にタイピングする場合、1 キーでホームに戻るのは自然にホームポジションに指が戻っていると解釈するには時間の猶予がないため、i → k への移動が移動距離に加算されるという計算になっています。</p>
    ${boardSfb}
    <p>この解釈を無効にして、ホームに戻るのは必ずコストゼロと扱いたい場合は、N の設定バーの下にあるチェックを外すことでコスト加算を無効化できます。</p>
  </div>`;
}
