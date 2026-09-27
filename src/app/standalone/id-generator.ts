import type { SetupIdGenerator } from '#input/setup/index.ts';

/**
 * Setupの新規id発行（`input/setup/types.ts`の`SetupIdGenerator`）。純粋層である`input`は
 * `crypto.randomUUID`のようなブラウザ/Node APIを直接使わないため、`app`が注入する
 * （`input/setup/types.ts`のコメントどおり）。
 */
export const generateSetupId: SetupIdGenerator = () => crypto.randomUUID();
