import { buildGeometry, dist, HOME_ROW, THUMB_ROW, type Point } from '#input/shapes/geometry.ts';

/**
 * 距離の計算の図（仕様 §8・§9）。「ぬいぐるみ」（訓令式の綴りは nuigurumi）の最初の3打鍵のうち、
 * 右手人差し指の動きを、QWERTYのロウスタッガードの物理配列の上に描く。距離は物理配列の座標から計算して出すので、
 * 物理配列の定義を直せば図の数値もそのまま追従する。
 */

const KEY = 48;
const PAD = 6;
/** 図に出す段。数字段と親指は例に出てこないので省く */
const ROWS = [1, HOME_ROW, 3];
/** 打鍵順。n・uは右手人差し指、iは右手中指が打つ */
const SEQUENCE = ['n', 'u', 'i'] as const;
const CIRCLED = ['①', '②', '③'] as const;
/** 別の指が打つキー。矢印は引かず、図で区別する */
const OTHER_FINGER = 'i';
/** 図に出す列の範囲（キーのx座標）。例に出てくる指の周りだけにして、狭い画面でもキーを大きく描く */
const X_RANGE = [5.25, 8.75] as const;
const HOME_KEY = 'j';

/** 末尾の0は落とす。1.000は1、1.250は1.25 */
const fmt = (value: number) => `${Number(value.toFixed(3))}u`;

function Arrow({ from, to, adopted }: { readonly from: Point; readonly to: Point; readonly adopted: boolean }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // 両端をキーの内側へ詰める
  const inset = Math.min(KEY * 0.3, length * 0.2);
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
  const keys = [...geometry.keys.values()].filter((key) => ROWS.includes(key.row) && key.row !== THUMB_ROW && key.x >= X_RANGE[0] && key.x <= X_RANGE[1]);
  const minX = Math.min(...keys.map((key) => key.x));
  const minY = Math.min(...keys.map((key) => key.y));
  const center = (id: string): Point => {
    const key = geometry.keys.get(id)!;
    return { x: PAD + (key.x - minX) * KEY + KEY / 2, y: PAD + (key.y - minY) * KEY + KEY / 2 };
  };
  const width = Math.max(...keys.map((key) => PAD + (key.x - minX) * KEY + KEY)) + PAD;
  const height = Math.max(...keys.map((key) => PAD + (key.y - minY) * KEY + KEY)) + PAD;

  const get = (id: string) => geometry.keys.get(id)!;
  const homeToN = dist(get(HOME_KEY), get('n'));
  const nToU = dist(get('n'), get('u'));
  const homeToU = dist(get(HOME_KEY), get('u'));

  const label = SEQUENCE.map((id, index) => `${CIRCLED[index]}${id}`).join(' ');
  return (
    <figure className="distance-figure">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`「ぬいぐるみ」（訓令式のnuigurumi）の最初の3打鍵（${label}）。右手人差し指は、ホームの${HOME_KEY}からnへ${fmt(homeToN)}、続けてnからuへ${fmt(nToU)}動きます。`}
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
                className={pressed ? (key.id === OTHER_FINGER ? 'distance-figure-key is-other' : 'distance-figure-key is-pressed') : 'distance-figure-key'}
                strokeDasharray={key.id === HOME_KEY ? '3 2' : undefined}
              />
              <text x={x + KEY / 2} y={y + KEY / 2 + 6} textAnchor="middle" className="distance-figure-legend">
                {key.id}
              </text>
              {pressed ? (
                <text x={x + 4} y={y + 14} className="distance-figure-order">{CIRCLED[order]}</text>
              ) : null}
            </g>
          );
        })}
        <Arrow from={center(HOME_KEY)} to={center('n')} adopted />
        <Arrow from={center('n')} to={center('u')} adopted />
        <Arrow from={center(HOME_KEY)} to={center('u')} adopted={false} />
      </svg>
      <figcaption>
        <p>「ぬいぐるみ」を訓令式のローマ字（nuigurumi）で、QWERTYのロウスタッガードで打つ時の、右手人差し指の動きです（1uはキー1つ分の間隔）。破線で囲んだ {HOME_KEY} がこの指のホームです。</p>
        <ul>
          <li>①: ホームの {HOME_KEY} からnへ動きます。指は最初ホームにあるので、距離は {fmt(homeToN)} です。</li>
          <li>②: nの直後に、同じ指でuを打ちます。ホームへ戻る時間が無いので、nからuへの {fmt(nToU)} を足します。ホームからuへの {fmt(homeToU)} の方が短くても候補になりません（破線の矢印）。</li>
          <li>③: iは右手の中指が打つので、人差し指の距離には入りません（色を変えたキー）。</li>
        </ul>
      </figcaption>
    </figure>
  );
}
