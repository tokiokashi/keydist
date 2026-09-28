import type { SetupIdGenerator } from '#input/setup/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';

/**
 * Setupの新規id発行（`input/setup/types.ts`の`SetupIdGenerator`）。純粋層である`input`は
 * `crypto.randomUUID`のようなブラウザ/Node APIを直接使わないため、`app`が注入する
 * （`input/setup/types.ts`のコメントどおり）。
 */
export const generateSetupId: SetupIdGenerator = () => crypto.randomUUID();

/** テキストの新規id発行（`input/text/library.ts`の`TextIdGenerator`）。理由は上と同じ。 */
export const generateTextId: TextIdGenerator = () => crypto.randomUUID();
