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

const KEY = 26;
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

/** 末尾の 0 は落とす。1.000 は 1、1.250 は 1.25、1.0307… は 1.031 */
const n3 = (v: number) => String(Number(v.toFixed(3)));
const u = (v: number) => `${n3(v)}u`;

/** 打鍵順は丸数字で出す。通し番号より目で追いやすい */
const circled=(i: number) => (i >= 1 && i <= 20 ? String.fromCharCode(0x245f + i) : `(${i})`);

interface Arrow {
  from: Point;
  to: Point;
  adopted: boolean;
  tip: string;
}

/** 線の両端をキーの内側に詰めてから、三角の先端を付ける */
function arrow(a: Arrow): string {
  const color = a.adopted ? 'var(--accent)' : 'var(--muted)';
  const dx= a.to.x - a.from.x;
  const dy= a.to.y - a.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx/ len;
  const uy = dy/ len;
  // 隣接キー間のように短い矢印では、詰めと矢頭を縮めないと線が残らず塊になる
  const inset = Math.min(KEY * 0.42, len * 0.3);
  const x1 = a.from.x + ux * inset;
  const y1 = a.from.y + uy * inset;
  const x2 = a.to.x - ux * inset;
  const y2 = a.to.y - uy * inset;
  const head=Math.min(7, Math.max(4, (len - inset * 2) * 0.45));
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const wing=head * 0.5;
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
  const homeId=homeKeyId(geometry);

  /** キー id ごとの丸数字（同じキーを 2 回打つ場合は複数付く） */
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


/** GitHub の alert に倣った囲み。種別は note / important / warning */
const CALLOUT_LABEL: Record<string, string> = {
  note: '注記',
  important: '重要',
  warning: '警告',
};

function callout(kind: keyof typeof CALLOUT_LABEL & string, title: string, lines: string[]): string {
  const head=title || CALLOUT_LABEL[kind];
  return `<div class="callout callout-${kind}">
    <p class="callout-title">${escapeText(head)}</p>
    ${lines.map((line) => `<p>${line}</p>`).join('')}
  </div>`;
}

/** 句点の直後で改行する。文が続く限り 1 文 1 行にする */
function para(text: string): string {
  const html = text.split('。').filter(Boolean).map((t) => `${t}。`).join('<br />');
  return `<p>${html}</p>`;
}

/** 図解の本体。条件・本文・盤面をまとめて返す */
export function gapFigure(geometry: Geometry): string {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  const homeId=homeKeyId(geometry);
  const home = geometry.homes[FOCUS_FINGER];

  const between = (fromKey: string, toKey: string) =>
    dist(geometry.keys.get(fromKey)!, geometry.keys.get(toKey)!);
  const toHome = (toKey: string) => dist(home, geometry.keys.get(toKey)!);

  const ortho = buildGeometry('ortholinear');
  const orthoD = dist(ortho.homes[FOCUS_FINGER], ortho.keys.get('u')!);
  const jU = geometry.keys.get('u')!;
  const jHome = geometry.keys.get(homeId)!;
  const dx= jU.x - jHome.x;
  const dy= jU.y - jHome.y;

  const sfb = figurePresses(geometry, SFB_TEXT);
  const sfbFrom = sfb[0];
  const sfbTo = sfb[1];

  const boardHomeToU = board(geometry, {
    caption: '「jou」— ホームからuへ',
    seq: [at(1), at(2), at(3)],
    focus: [1, 3],
    arrows: [{
      fromKey: homeId, toKey: 'u', adopted: true,
      label: `d(${homeId}u) ＝ ${u(at(3).distance)}`,
    }],
    notes: [`dx ${n3(dx)} ／ dy ${n3(dy)}`],
  });

  const boardUToH = board(geometry, {
    caption: '「uh」— 直前も同じ指',
    seq: [at(3), at(4)],
    focus: [3, 4],
    arrows: [
      { fromKey: 'u', toKey: 'h', adopted: true, label: `d(uh) ＝ ${u(at(4).distance)}（加算）` },
      { fromKey: homeId, toKey: 'h', adopted: false, label: `d(${homeId}h) ＝ ${u(toHome('h'))}（戻る時間が無く、候補にならない）` },
    ],
  });

  const boardUToM = board(geometry, {
    caption: '「um」— 直前も同じ指',
    seq: [at(11), at(12)],
    focus: [11, 12],
    arrows: [
      { fromKey: 'u', toKey: 'm', adopted: true, label: `d(um) ＝ ${u(at(12).distance)}（加算）` },
      { fromKey: homeId, toKey: 'm', adopted: false, label: `d(${homeId}m) ＝ ${u(toHome('m'))}（戻る時間が無く、候補にならない）` },
    ],
  });

  const boardInside = board(geometry, {
    caption: '「meru」— 間に2打鍵。窓の内側',
    seq: [at(12), at(13), at(14), at(15)],
    focus: [12, 15],
    arrows: [
      { fromKey: homeId, toKey: 'u', adopted: true, label: `d(${homeId}u) ＝ ${u(toHome('u'))}（採用）` },
      { fromKey: 'm', toKey: 'u', adopted: false, label: `d(mu) ＝ ${u(between('m', 'u'))}` },
    ],
  });

  const boardOutside = board(geometry, {
    caption: '「uwoatu」— 間に4打鍵。窓の外',
    seq: [at(6), at(7), at(8), at(9), at(10), at(11)],
    focus: [6, 11],
    arrows: [
      { fromKey: homeId, toKey: 'u', adopted: true, label: `d(${homeId}u) ＝ ${u(at(11).distance)}` },
    ],
    notes: [`残っていれば${u(between('u', 'u'))}だが、g=${at(11).gap}>Nなので候補にならない`],
  });

  const boardSfb = board(geometry, {
    caption: '「ik」— ホームキーへ戻る打鍵',
    seq: [sfbFrom, sfbTo],
    focus: [sfbFrom.number, sfbTo.number],
    arrows: [{
      fromKey: sfbFrom.keyId, toKey: sfbTo.keyId, adopted: true,
      label: `d(${sfbFrom.keyId}${sfbTo.keyId}) ＝ ${u(sfbTo.distance)}（既定では加算）`,
    }],
  });

  return `<div class="gap-figure">
    ${callout('important', '前提条件', [
      `${escapeText(FIGURE_LAYOUT_ID.toUpperCase())} ／ ${escapeText(FIGURE_SHAPE)} ／ N = ${FIGURE_WINDOW} ／ ${escapeText(FIGURE_ROMAJI)}`,
    ])}
    ${para('「情報を集める」という文章をタイピングする場合を例として、距離の計算とNの取り扱いを説明します。ここでは人差し指の距離だけに注目します。')}
    ${para('このアプリはそれぞれの指で動きを追跡し、移動距離を求めます。実際は全ての指でこの計算を行っていると思ってください。')}

    <h3>「情報」をタイピングする</h3>
    ${para(`冒頭の${homeId}→o→uとタイピングする時、人差し指は${homeId}→uと移動します。何もない状態で各指はホームポジションにいると定義しているため、${homeId}→uの距離を移動することになります。`)}
    ${para(`この際、キーボードの物理配列により斜め移動になるため、座標を元にd=${u(at(3).distance)}（uはキーピッチ）と求まります。格子配列であるオーソリニアの場合は真上の移動になるためd=${u(orthoD)}となります。`)}
    ${boardHomeToU}
    ${para(`次にu→hと移動します。ホームの${homeId}からなら${u(toHome('h'))}と近いのですが、直前も同じ指なのでホームに戻る時間がありません。そのためu→hの${u(at(4).distance)}が加算されます。`)}
    ${boardUToH}
    ${callout('warning', '', [
      '実際のQWERTYでは運指最適化によって「jouhou」の「u」を中指で取るなど、標準運指を崩して最適化すると思いますが、今のモデルでは運指最適化を行わないため、担当する指で順番にタイピングしていくことになります。',
      'この部分はQWERTYの数字が特に悪化しているように見える要因となるため、今後の機能改善の候補としています。',
    ])}

    <h3>「集める」をタイピングする</h3>
    ${para(`ここからNの設定値による距離算出の変化を説明します。ここではN=${FIGURE_WINDOW}と設定しているものとします。`)}
    <h4>「at<b>um</b>er<b>u</b>」の部分について</h4>
    <ol class="gap-steps">
      <li>
        ${para('最初のu→mは前述の通り連続のため、その距離dを計算します。')}
        ${boardUToM}
      </li>
      <li>
        ${para(`次のm→uはあいだに2打鍵分のキーが含まれますがN=${FIGURE_WINDOW}の範囲内であるため、${homeId}→uの距離とm→uの距離の大小を比較して短い方を移動距離とします。当然ホームからの方が近いのでそちらが採用されますが、これは他の指が動いているあいだに人差し指はホームポジションに戻れていると考えるためです。`)}
        ${boardInside}
      </li>
      <li>
        ${para(`ここで「jouho<b>u</b>woat<b>u</b>meru」の部分にも人差し指の繋がりが見つかります。2つの<b>u</b>のあいだの打鍵数は${at(11).gap}となりますが、設定している${at(11).gap}&gt;Nとなり、指を残していないと判定されてその移動距離は${homeId}→uの距離dとなります。`)}
        ${para(`仮にこの<b>u</b>同士のあいだに人差し指を動かさなくて良い先読みができる（${at(11).gap}≤N）のであれば、2つ目の<b>u</b>にかかる移動距離はd=${u(between('u', 'u'))}となります。`)}
        ${boardOutside}
      </li>
    </ol>
    ${callout('note', '', [
      'あいだに含まれる打鍵数gに対して1≤g≤Nの場合に、この比較が発生するということになります。',
      '5打鍵先まで先読みすると設定したい場合N=4となるので注意が必要です。',
    ])}

    <h3>連続打鍵でホームポジションのキーを押す場合</h3>
    ${para('もう一つ、運指コストの評価のために設定しているルールがあります。')}
    ${para('「行く」のように（最適化をせず）「ik」を中指で順番にタイピングする場合、1キーでホームに戻るのは自然にホームポジションに指が戻っていると解釈するには時間の猶予がないため、i→kへの移動が移動距離に加算されるという計算になっています。')}
    ${boardSfb}
    ${para('この解釈を無効にして、ホームに戻るのは必ずコストゼロと扱いたい場合は、Nの設定バーの下にあるチェックを外すことでコスト加算を無効化できます。')}
  </div>`;
}
