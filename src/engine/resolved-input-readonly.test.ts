import test from 'node:test';
import type { ResolvedText } from '#input/text/resolve.ts';
import type { ResolvedInput } from './resolved-input.ts';

// 解決済みの入力は、書き換えを型検査で止める（実行時には凍結しない）。`@ts-expect-error`が不要になる
// （書き換えが通るようになる）と、`npm run typecheck`が落ちる。
test('解決済みの入力とテキストの項目は、書き換えると型検査が落ちる', () => {
  const input = {} as ResolvedInput;
  const text = {} as ResolvedText;
  const never = (): boolean => false;
  const same = <T>(value: T): T => value;
  if (never()) {
    // @ts-expect-error
    input.text = 'x';
    // @ts-expect-error
    input.layout = same(input.layout);
    // @ts-expect-error
    input.geometry = same(input.geometry);
    // @ts-expect-error
    input.tracePolicy = same(input.tracePolicy);
    // @ts-expect-error
    input.extractionAssets = same(input.extractionAssets);
    // @ts-expect-error
    input.romajiRuleId = null;
    // @ts-expect-error
    input.cascade = same(input.cascade);
    // @ts-expect-error
    text.text = 'x';
    // @ts-expect-error
    text.ref = same(text.ref);
    // @ts-expect-error
    text.ref.id = 'x';
  }
});
