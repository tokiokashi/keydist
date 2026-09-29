import type { InputMethod, CascadeLevel } from './levels.ts';

/** 1レベル分の疎な上書き。値の型の写像 `V`（`RegistryValueMap<R>`）の部分集合。 */
export type LevelOverrides<V> = { readonly [K in keyof V]?: V[K] };

/**
 * カスケード全体の保存形式。プレーンなJSONとして持つ（Map等は使わない）。
 * 後続のvalibot codec（Phase 2の別項目）がそのままdecodeできる形を意図している。
 * globalは単一、それ以外は「そのレベルのインスタンスid → 上書き」の辞書。
 * `V` はレジストリから決まる値の写像（`RegistryValueMap<R>`）で、呼び出し側が指定する。
 */
export interface CascadeOverrides<V> {
  readonly global?: LevelOverrides<V>;
  readonly shape?: Readonly<Record<string, LevelOverrides<V>>>;
  readonly inputMethod?: Readonly<Partial<Record<InputMethod, LevelOverrides<V>>>>;
  readonly layout?: Readonly<Record<string, LevelOverrides<V>>>;
  readonly setup?: Readonly<Record<string, LevelOverrides<V>>>;
}

/** 上書きが1つも無い状態。`{}` はどの `V` に対しても妥当なので、呼び出し側の型で使える。 */
export function emptyCascadeOverrides<V>(): CascadeOverrides<V> {
  return {};
}

/**
 * `instanceKey`（配列id・物理配列id・Setup id等、外部（importしたJSON等）から来うる
 * 任意の文字列）を使ったbucketの安全な読み書き。
 *
 * 素のbracketアクセス（`bucket[instanceKey]`）は、instanceKeyが`"__proto__"`だと
 * 「ふつうのプロパティ」ではなく`Object.prototype`の継承accessorを踏んでしまう
 * JSの既知の落とし穴（読み: bucket自身に own property "__proto__" が無ければ
 * bucketの実際のprototypeを返してしまい`undefined`にならない。書き: エントリを
 * 追加する代わりにbucket自身のprototypeを差し替えてしまい、値が消える。
 * `"constructor"` / `"prototype"` は差し替えは起きないが、`Object.prototype`の
 * メソッドを「上書き値」として誤って拾える）。
 *
 * `readBucketEntry`は`Object.hasOwn`でown propertyかを先に確認してから読む。
 * `writeBucketEntry`は`Object.defineProperty`で書く（`__proto__`という名前の
 * exotic setterを経由しない、ふつうのdata propertyとしてbucketへ定義する）ため、
 * どんな文字列のinstanceKeyでも安全に保存・往復できる。
 *
 * この関数群には診断（診断を返すchannel）が無い。ここはUIからの通常の書き込みも
 * 通る純粋な状態遷移関数（codecの外）なので、「怪しい名前を拒否して黙って捨てる」
 * のではなく「どんな名前でも正しく動く」ことを選んだ（codec側の`decodeCascadeOverrides`
 * は逆に外部データの境界として`__proto__`等を診断付きで積極的に捨てる。使い分けは
 * `input/settings/codec.ts`参照）。
 */
function readBucketEntry<V>(
  bucket: Readonly<Record<string, LevelOverrides<V>>> | undefined,
  instanceKey: string,
): LevelOverrides<V> | undefined {
  return bucket !== undefined && Object.hasOwn(bucket, instanceKey) ? bucket[instanceKey] : undefined;
}

function writeBucketEntry<V>(
  bucket: Record<string, LevelOverrides<V>>,
  instanceKey: string,
  value: LevelOverrides<V>,
): void {
  Object.defineProperty(bucket, instanceKey, { value, writable: true, enumerable: true, configurable: true });
}

/** 指定レベルに保存されている上書き（無ければundefined）。 */
export function levelOverrides<V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
): LevelOverrides<V> | undefined {
  switch (level.kind) {
    case 'global': return overrides.global;
    case 'shape': return readBucketEntry(overrides.shape, level.shapeId);
    case 'inputMethod': return readBucketEntry(overrides.inputMethod, level.inputMethod);
    case 'layout': return readBucketEntry(overrides.layout, level.layoutId);
    case 'setup': return readBucketEntry(overrides.setup, level.setupId);
  }
}

/**
 * 指定レベル・1項目だけの生の上書き値を読む（無ければ`undefined`）。`resolveCascade`
 * （`resolve.ts`）はレベルを弱い順に重ねる・`validate`/`isApplicable`まで含めた「実効値」を
 * 求める仕組みだが、`CascadeContext`をまだ組み立てられない場面（例: 配列を対象にした時の
 * 物理配列そのものを決める`defaultShapeId`。`engine/settings-items.ts`の
 * `resolveDefaultShapeId`）では、その前段として「特定の1レベルに書かれた生の値」だけが
 * 要ることがある。`levelOverrides`を1項目ぶんに絞るだけの薄いヘルパー。
 */
export function readOverride<V, K extends keyof V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
  itemId: K,
): V[K] | undefined {
  const stored = levelOverrides(overrides, level);
  return stored === undefined ? undefined : stored[itemId];
}

/**
 * 指定レベルの上書きを丸ごと置き換えた新しいCascadeOverridesを返す（イミュータブル）。
 * `next` が `undefined` ならそのレベルのエントリごと消す（空オブジェクトを残さない）。
 */
export function withLevelOverrides<V>(
  overrides: CascadeOverrides<V>,
  level: CascadeLevel,
  next: LevelOverrides<V> | undefined,
): CascadeOverrides<V> {
  if (level.kind === 'global') {
    if (next === undefined) {
      const { global: _drop, ...rest } = overrides;
      return rest;
    }
    return { ...overrides, global: next };
  }

  const bucketKey = level.kind;
  // `{...source}`はCopyDataProperties相当（`[[DefineOwnProperty]]`）で複製するため、
  // sourceが（`writeBucketEntry`経由で）own property "__proto__" を持っていても
  // 正しくコピーされる（bracket代入の[[Set]]経路ではないのでexotic setterを踏まない）。
  const bucket = { ...(overrides[bucketKey] as Record<string, LevelOverrides<V>> | undefined) };
  const instanceKey = level.kind === 'shape'
    ? level.shapeId
    : level.kind === 'inputMethod'
      ? level.inputMethod
      : level.kind === 'layout'
        ? level.layoutId
        : level.setupId;

  if (next === undefined) {
    // deleteは対象のown propertyしか消さない。bucketがinstanceKeyをown propertyとして
    // 持っていなければ（例: "__proto__"をwriteBucketEntryで書いたことが一度も無い場合）
    // 何も起きず、Object.prototype側は一切影響を受けない（安全）。
    delete bucket[instanceKey];
  } else {
    writeBucketEntry(bucket, instanceKey, next);
  }

  if (Object.keys(bucket).length === 0) {
    const { [bucketKey]: _drop, ...rest } = overrides;
    return rest;
  }
  return { ...overrides, [bucketKey]: bucket };
}
