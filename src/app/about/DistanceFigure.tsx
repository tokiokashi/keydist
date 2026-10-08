import { buildGeometry, dist, HOME_ROW, THUMB_ROW, type Point } from '#input/shapes/geometry.ts';

/**
 * 距離の計算の図（仕様 §8・§9）。「じょうほう」を打つ時の右手人差し指の動きを、
 * ロウスタッガードの物理配列の上に描く。距離は物理配列の座標から計算して出すので、
 * 物理配列の定義を直せば図の数値もそのまま追従する。
 */

const KEY = 34;
const PAD = 6;
/** 図に出す段。数字段と親指は例に出てこないので省く */
const ROWS = [1, HOME_ROW, 3];
/** 打鍵順。右手人差し指が打つキーはj・u・h */
const SEQUENCE = ['j', 'o', 'u', 'h'] as const;
const CIRCLED = ['①', '②', '③', '④'] as const;
const HOME_KEY = 'j';

/** 末尾の0は落とす。1.000は1、1.250は1.25 */
const fmt = (value: number) => `${Number(value.toFixed(3))}u`;

function Arrow({ from, to, adopted }: { readonly from: Point; readonly to: Point; readonly adopted: boolean }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // 両端をキーの内側へ詰める
  const inset = Math.min(KEY * 0.4, length * 0.3);
  return (
    <line
      x1={from.x + (dx / length) * inset}
      y1={from.y + (dy / length) * inset}
      x2={to.x - (dx / length) * inset}
      y2={to.y - (dy / length) * inset}
      className={adopted ? 'distance-figure-arrow is-adopted' : 'distance-figure-arrow'}
      markerEnd={adopted ? 'url(#distance-figure-head-adopted)' : 'url(#distance-figure-head)'}
    />
  );
}

export function DistanceFigure() {
  const geometry = buildGeometry('row-staggered');
  const keys = [...geometry.keys.values()].filter((key) => ROWS.includes(key.row) && key.row !== THUMB_ROW);
  const minX = Math.min(...keys.map((key) => key.x));
  const minY = Math.min(...keys.map((key) => key.y));
  const center = (id: string): Point => {
    const key = geometry.keys.get(id)!;
    return { x: PAD + (key.x - minX) * KEY + KEY / 2, y: PAD + (key.y - minY) * KEY + KEY / 2 };
  };
  const width = Math.max(...keys.map((key) => PAD + (key.x - minX) * KEY + KEY)) + PAD;
  const height = Math.max(...keys.map((key) => PAD + (key.y - minY) * KEY + KEY)) + PAD;

  const get = (id: string) => geometry.keys.get(id)!;
  const homeToU = dist(get(HOME_KEY), get('u'));
  const uToH = dist(get('u'), get('h'));
  const homeToH = dist(get(HOME_KEY), get('h'));

  const label = SEQUENCE.map((id, index) => `${CIRCLED[index]}${id}`).join(' ');
  return (
    <figure className="distance-figure">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`「じょうほう」の最初の4打鍵（${label}）。右手人差し指は、ホームの${HOME_KEY}からuへ${fmt(homeToU)}、続けてuからhへ${fmt(uToH)}動く。`}
      >
        <defs>
          <marker id="distance-figure-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L10 5L0 10z" className="distance-figure-head" />
          </marker>
          <marker id="distance-figure-head-adopted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L10 5L0 10z" className="distance-figure-head is-adopted" />
          </marker>
        </defs>
        {keys.map((key) => {
          const x = PAD + (key.x - minX) * KEY;
          const y = PAD + (key.y - minY) * KEY;
          const order = SEQUENCE.indexOf(key.id as (typeof SEQUENCE)[number]);
          const pressed = order >= 0;
          return (
            <g key={key.id}>
              <rect
                x={x + 1}
                y={y + 1}
                width={KEY - 2}
                height={KEY - 2}
                rx={4}
                className={pressed ? 'distance-figure-key is-pressed' : 'distance-figure-key'}
                strokeDasharray={key.id === HOME_KEY ? '3 2' : undefined}
              />
              <text x={x + KEY / 2} y={y + KEY / 2 + 5} textAnchor="middle" className="distance-figure-legend">
                {key.id}
              </text>
              {pressed ? (
                <text x={x + 3} y={y + 11} className="distance-figure-order">{CIRCLED[order]}</text>
              ) : null}
            </g>
          );
        })}
        <Arrow from={center(HOME_KEY)} to={center('u')} adopted />
        <Arrow from={center('u')} to={center('h')} adopted />
        <Arrow from={center(HOME_KEY)} to={center('h')} adopted={false} />
      </svg>
      <figcaption>
        <p>「じょうほう」を打つ時の、右手人差し指の動きです（ロウスタッガード。1uはキー1つ分の間隔）。破線で囲んだ {HOME_KEY} がこの指のホームです。</p>
        <ul>
          <li>①から③: ホームの {HOME_KEY} からuへ動きます。指は最初ホームにあるので、距離は {fmt(homeToU)} です。</li>
          <li>③から④: uの直後に、同じ指でまたhを打ちます。ホームへ戻る時間が無いので、uからhへの {fmt(uToH)} を足します。ホームからhへの {fmt(homeToH)} は候補になりません（破線の矢印）。</li>
        </ul>
      </figcaption>
    </figure>
  );
}
