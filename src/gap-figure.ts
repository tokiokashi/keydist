/**
 * 「この数値の読み方」に置く g の図解（仕様 §7 R3〜R5・§8・§9）。
 *
 * 固定例を評価器に通してから描く。図の数値を手で持たないので、
 * モデルを直せば図もそのまま追従する。
 */
import { escapeAttr, escapeText } from './chart.ts';
import { evaluate } from './evaluate.ts';
import { dist, HOME_ROW, THUMB_ROW, type Finger, type Geometry, type Point } from './geometry.ts';
import { LAYOUT_BY_ID, withRomaji } from './layouts/index.ts';
import { ROMAJI_RULES } from './romaji/rules.ts';

/** 図の条件。仕様とずれないよう、脇に必ず出す */
export const FIGURE_TEXT = 'じょうほうをあつめる';
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

interface FigurePress {
  /** 1 始まりの打鍵番号。ローマ字列の並びと一致する */
  number: number;
  keyId: string;
  finger: Finger;
  gap: number;
  distance: number;
}

/** 固定例を評価して、押下を 1 列に並べる */
export function figurePresses(geometry: Geometry): FigurePress[] {
  const layout = withRomaji(LAYOUT_BY_ID.get(FIGURE_LAYOUT_ID)!, ROMAJI_RULES.qwerty.table());
  const trace = evaluate(FIGURE_TEXT, layout, geometry, {
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

const u = (v: number) => `${v.toFixed(3)} u`;
const u2 = (v: number) => v.toFixed(2);

/** 盤面に引く矢印。採らなかった候補もグレーで残す（仕様 §9） */
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
  return `<g data-tip="${escapeAttr(a.tip)}" opacity="${a.adopted ? 1 : 0.75}">
    <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"
      stroke="${color}" stroke-width="${a.adopted ? 2.2 : 1.6}" stroke-linecap="round"/>
    <polygon points="${points}" fill="${color}"/>
  </g>`;
}

interface BoardSpec {
  /** 面の見出し */
  title: string;
  /** 強調する 2 打鍵 */
  focus: FigurePress[];
  /** 間に挟まった打鍵。この数がそのまま g */
  between: FigurePress[];
  arrows: { fromKey: string; toKey: string; adopted: boolean; tip: string }[];
  /** 盤面の下に置く行 */
  lines: string[];
  /** 採用の一言 */
  takeaway: string;
  notes?: string[];
}

function board(geometry: Geometry, spec: BoardSpec): string {
  const keys = [...geometry.keys.values()].filter((k) => ROWS.includes(k.row) && k.row !== THUMB_ROW);
  const minX = Math.min(...keys.map((k) => k.x));
  const minY = Math.min(...keys.map((k) => k.y));
  const px = (k: { x: number }) => PAD + (k.x - minX) * KEY;
  const py = (k: { y: number }) => PAD + (k.y - minY) * KEY;
  const center = (id: string): Point => {
    const k = geometry.keys.get(id)!;
    return { x: px(k) + KEY / 2, y: py(k) + KEY / 2 };
  };

  const numbers = new Map<string, FigurePress[]>();
  for (const p of [...spec.focus, ...spec.between]) {
    const list = numbers.get(p.keyId) ?? [];
    list.push(p);
    numbers.set(p.keyId, list);
  }
  const focusKeys = new Set(spec.focus.map((p) => p.keyId));
  const betweenKeys = new Set(spec.between.map((p) => p.keyId));
  const homeKey = [...geometry.keys.values()]
    .find((k) => k.x === geometry.homes[FOCUS_FINGER].x && k.y === geometry.homes[FOCUS_FINGER].y)!;

  const cells = keys.map((key) => {
    const focus = focusKeys.has(key.id);
    const between = !focus && betweenKeys.has(key.id);
    const isHome = key.id === homeKey.id && !focus;
    const x = px(key);
    const y = py(key);
    const fill = focus
      ? 'color-mix(in oklab, var(--accent) 16%, var(--panel))'
      : between
        ? 'var(--panel-2)'
        : 'var(--panel)';
    const stroke = focus ? 'var(--accent)' : between || isHome ? 'var(--line-strong)' : 'var(--line)';
    const textFill = focus ? 'var(--fg)' : between ? 'var(--muted)' : 'var(--line-strong)';
    const marks = (numbers.get(key.id) ?? [])
      .map((p) => `#${p.number}`)
      .join(' ');
    const badge = marks
      ? `<text x="${x + 2.5}" y="${y + 8.5}" font-size="7.5" text-anchor="start"
          fill="${focus ? 'var(--accent)' : 'var(--muted)'}" pointer-events="none">${marks}</text>`
      : '';
    const tipParts = (numbers.get(key.id) ?? []).map((p) =>
      `#${p.number} <b>${escapeText(p.keyId)}</b> g = ${p.gap === Infinity ? '—' : p.gap} 距離 ${u(p.distance)}`,
    );
    if (isHome) tipParts.push('右手人差し指のホーム');
    const tip = tipParts.join('<br>');
    const group = tip ? `<g data-tip="${escapeAttr(tip)}">` : '<g>';
    return `${group}
      <rect x="${x + 1}" y="${y + 1}" width="${KEY - 2}" height="${KEY - 2}" rx="4"
        fill="${fill}" stroke="${stroke}" stroke-width="${focus ? 2 : 1}"
        ${isHome ? 'stroke-dasharray="3 2"' : ''}/>
      <text x="${x + KEY / 2}" y="${y + KEY / 2 + 5.5}" text-anchor="middle" font-size="11"
        fill="${textFill}" pointer-events="none">${escapeText(key.id)}</text>
      ${badge}
    </g>`;
  });

  const arrows = spec.arrows.map((a) =>
    arrow({ from: center(a.fromKey), to: center(a.toKey), adopted: a.adopted, tip: a.tip }),
  );

  const boardW = Math.max(...keys.map((k) => px(k) + KEY)) + PAD;
  const boardH = Math.max(...keys.map((k) => py(k) + KEY)) + 6;
  const lines = [...spec.lines, spec.takeaway, ...(spec.notes ?? [])];
  const lineY = (i: number) => boardH + 16 + i * 14;
  const text = lines.map((line, i) => {
    const takeaway = i === spec.lines.length;
    const note = i > spec.lines.length;
    return `<text x="${PAD}" y="${lineY(i)}" font-size="${note ? 9.5 : 11}"
      fill="${takeaway ? 'var(--fg)' : 'var(--muted)'}">${escapeText(line)}</text>`;
  });
  const H = lineY(lines.length - 1) + 8;

  return `<figure class="gap-board">
    <figcaption>${escapeText(spec.title)}</figcaption>
    <svg viewBox="0 0 ${boardW} ${H}" role="img" aria-label="${escapeAttr(`${spec.title}。${lines.join(' ')}`)}"
      >${cells.join('')}${arrows.join('')}${text.join('')}</svg>
  </figure>`;
}

/** 3 面ぶんの図と、条件・ローマ字列の添え書きを返す */
export function gapFigure(geometry: Geometry): string {
  const presses = figurePresses(geometry);
  const at = (n: number) => presses.find((p) => p.number === n)!;
  const romaji = presses.map((p) => p.keyId).join('');
  const home = geometry.homes[FOCUS_FINGER];
  const homeKeyId = [...geometry.keys.values()]
    .find((k) => k.x === home.x && k.y === home.y)!.id;

  /** 候補距離。仕様 §9 の d_stay / d_home */
  const stay = (fromKey: string, toKey: string) =>
    dist(geometry.keys.get(fromKey)!, geometry.keys.get(toKey)!);
  const toHome = (toKey: string) => dist(home, geometry.keys.get(toKey)!);

  const sfb = at(12);      // m。g = 0
  const inside = at(15);   // u。g = 2（窓の内側）
  const outside = at(11);  // u。g = 4（窓の外）

  const boards = [
    board(geometry, {
      title: `g = 0 — 戻る時間が無い`,
      focus: [at(11), sfb],
      between: [],
      arrows: [{
        fromKey: at(11).keyId,
        toKey: sfb.keyId,
        adopted: true,
        tip: `残った場合 <b>${u(stay(at(11).keyId, sfb.keyId))}</b><br>候補はこれだけ`,
      }],
      lines: [
        `#${sfb.number} ${sfb.keyId} を打つ。直前も同じ指`,
        `残った ${u2(stay(at(11).keyId, sfb.keyId))} ／ ホームから ${u2(toHome(sfb.keyId))}`,
        `採用 ${u(sfb.distance)}`,
      ],
      takeaway: 'ホームが近くても、長い方を払う。',
      notes: [
        'ホームキーへ戻る打鍵も距離に加える。',
        'sfb_home_cost で切り替えられる（§8）。',
      ],
    }),
    board(geometry, {
      title: `g = ${inside.gap} — 窓の内側。短い方が勝つ`,
      focus: [sfb, inside],
      between: [at(13), at(14)],
      arrows: [
        {
          fromKey: sfb.keyId,
          toKey: inside.keyId,
          adopted: false,
          tip: `残った場合 <b>${u(stay(sfb.keyId, inside.keyId))}</b><br>採らなかった候補`,
        },
        {
          fromKey: homeKeyId,
          toKey: inside.keyId,
          adopted: true,
          tip: `ホームから <b>${u(toHome(inside.keyId))}</b><br>採った候補`,
        },
      ],
      lines: [
        `#${inside.number} ${inside.keyId} を打つ。間に #13 ${at(13).keyId} #14 ${at(14).keyId}`,
        `残った ${u2(stay(sfb.keyId, inside.keyId))} ／ ホームから ${u2(toHome(inside.keyId))}`,
        `採用 ${u(inside.distance)}`,
      ],
      takeaway: '2 本を比べて、小さい方を採る。',
    }),
    board(geometry, {
      title: `g = ${outside.gap} — 窓の外。戻り切っている`,
      focus: [at(6), outside],
      between: [at(7), at(8), at(9), at(10)],
      arrows: [{
        fromKey: homeKeyId,
        toKey: outside.keyId,
        adopted: true,
        tip: `ホームから <b>${u(toHome(outside.keyId))}</b><br>候補はこれだけ`,
      }],
      lines: [
        `#${outside.number} ${outside.keyId} を打つ。#6 と同じキー`,
        `残った ${u2(stay(at(6).keyId, outside.keyId))} ／ ホームから ${u2(toHome(outside.keyId))}`,
        `採用 ${u(outside.distance)}`,
      ],
      takeaway: '残れば 0 でも、戻った分を払う。',
    }),
  ];

  const numbered = presses
    .map((p) => `<span class="gap-romaji-key"><b>${escapeText(p.keyId)}</b>${p.number}</span>`)
    .join('');

  return `<div class="gap-figure">
    <p class="note">条件: ${escapeText(FIGURE_LAYOUT_ID.toUpperCase())} ／ ${escapeText(FIGURE_SHAPE)} ／ N = ${FIGURE_WINDOW} ／ ${escapeText(FIGURE_ROMAJI)}</p>
    <p>例文「${escapeText(FIGURE_TEXT)}」は ${escapeText(romaji)} の ${presses.length} 打鍵になる。</p>
    <div class="gap-romaji" aria-label="打鍵の番号">${numbered}</div>
    <p>追うのは右手人差し指。ホームは ${escapeText(homeKeyId)}。</p>
    <p>g は前に同じ指を使ってから挟まった他の打鍵数。薄いキーの数がそのまま g になる。</p>
    <div class="gap-boards">${boards.join('')}</div>
    <p class="note">面は g の順に並べる。打鍵順とは一致しない。</p>
  </div>`;
}
