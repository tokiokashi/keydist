/**
 * 中身をキーにしたキャッシュのための値の正規化。
 *
 * 採る方式: 値をオブジェクトキー順に依存しない形へ正規化してから `JSON.stringify` した文字列
 * をキーにする。ハッシュ（SHA-256等）は採らない。
 *
 * - 衝突: Trace/解釈のキャッシュは「表示中のSetupだけ」を対象にした小さなメモリキャッシュ。正規化した値をそのままJSON文字列にすれば、
 *   異なる内容が同じキーになることは原理的に起きない。この規模でハッシュの衝突耐性は要らない
 * - コスト: 文字列化はSetup・テキスト・カスケードの上書きが変わった時にしか走らない
 *   （描画のたびには走らない）。Trace/Geometry/Layoutのオブジェクトサイズを考えても
 *   他のI/Oに比べて無視できる
 * - デバッグ: キーの文字列をそのままログに出せば、どの入力の違いがキャッシュを外したか
 *   目で追える（ハッシュ値は追えない）。差分を取ればどのフィールドが変わったかも分かる
 *
 * `Map` / `Set` は `JSON.stringify` では消える（`{}` になる）ため、先に配列へ変換する。
 * `Map` のキーがオブジェクト（`Layout.faceLayerIds: ReadonlyMap<Face, string>`）の場合も、
 * そのキー自体を再帰的に正規化してから正規化後の文字列で並べ替える。
 *
 * 注意: `NaN` は `JSON.stringify` を通すと `null` と同じ文字列になる（`number`型のまま
 * `canonicalize` を通過するため）。異なる`NaN`由来の値が同じキーへ潰れても、この関数では
 * 検出も救済もしない。有限値であることは呼び出し側（`resolveEngineInput`等の上流）が
 * 保証している前提とする。
 */

type Canonical = null | string | number | boolean | Canonical[] | { readonly [key: string]: Canonical };

function compareCanonical(a: Canonical, b: Canonical): number {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
}

/** 任意の値をキー順に依存しない、JSON化できる形へ正規化する。 */
export function canonicalize(value: unknown): Canonical {
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([k, v]) => [canonicalize(k), canonicalize(v)] as const);
    entries.sort((a, b) => compareCanonical(a[0], b[0]));
    return { $map: entries.map(([k, v]) => [k, v]) };
  }
  if (value instanceof Set) {
    const items = [...value].map((item) => canonicalize(item));
    items.sort(compareCanonical);
    return { $set: items };
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, Canonical> = {};
    for (const key of Object.keys(source).sort()) {
      const v = source[key];
      // JSON.stringifyがundefinedのプロパティを省略するのと同じ扱いにする。
      if (v === undefined) continue;
      result[key] = canonicalize(v);
    }
    return result;
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  // undefined / function / symbol 等。JSONに無い値はnullへ落とす（JSON.stringifyの既定と同じ）。
  return null;
}

/** 値をキー順に依存しない文字列へ変換する。同じ中身は常に同じ文字列になる。 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
