import assert from 'node:assert/strict';
import { finishKeystrokeRecord, recordBaseTrace, recordPlanOf, windowedSignatureOf, type RecordMeta } from '#engine/keystroke-record.ts';
import { resolveEngineInput, type ResolveEngineInputOptions, type ResolvedInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { isThumbKeyId, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { pressSentenceSessionKey, sentenceSessionFinished, startSentenceSession, type SentencePlan } from '#interpretation/timing/sentence-session.ts';

/**
 * 打鍵の記録を使うテストの材料。実際に打った記録は使わず、テストの中で組み立てた時刻の列から記録を作る。
 */

export const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** 約2300字（範囲が2つ）。し・ち・つ・ふ・じ・ん・促音・拗音と、読点・句点を含む。 */
const SENTENCES = [
  'ふじさんのしゃしんをとったよ。',
  'ぼくはちかくのきっさてんでいっぷくした。',
  'しんぶんをよんで、つぎのひにじゅぎょうがあった。',
  'ちゃいろのつくえのうえにしゅくだいがある。',
  'おんがくをきいてほんをよんだ。',
];
export const RECORD_TEXT = SENTENCES.join('').repeat(Math.ceil(2300 / SENTENCES.join('').length));

export const RECORD_META: RecordMeta = {
  id: 'record-1',
  recordedAt: '2026-11-15T00:00:00.000Z',
  appVersion: 'test',
  target: { kind: 'layout', layoutId: 'qwerty' },
  targetName: 'QWERTY',
  textIdentity: 'user:t',
  textName: 'テスト',
};

export function resolveRecordInput(
  layoutId: string,
  extra: Partial<Pick<ResolveEngineInputOptions, 'comboBarriers' | 'text' | 'overrides'>> = {},
): ResolvedInput {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: extra.overrides ?? EMPTY_SETTINGS_OVERRIDES,
    text: extra.text ?? RECORD_TEXT,
    language: 'ja',
    ...(extra.comboBarriers === undefined ? {} : { comboBarriers: extra.comboBarriers }),
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.input;
}

/** 範囲の計画を、単位ごとに`choose`が選ぶ綴りで最後まで打つ。時刻は組み立てた値で、`gapOf`が単位ごとの間隔を決める。 */
export function typeRecordRange(
  plan: SentencePlan,
  choose: (unit: number, spellings: readonly string[]) => string,
  gapOf: (unit: number) => number = (unit) => 90 + (unit % 7) * 13,
) {
  let session = startSentenceSession([plan], 1);
  const typed: string[] = [];
  let at = 1000;
  for (let unit = 0; unit < plan.units.length; unit++) {
    const spelling = choose(unit, plan.units[unit]!.spellings);
    const steps = plan.candidateSteps(typed, unit, spelling);
    assert.ok(steps !== undefined, `${unit}番目の単位を${spelling}で打てない`);
    typed.push(spelling);
    for (const step of steps) {
      for (const key of step.keys) {
        at += gapOf(unit);
        const event = isThumbKeyId(key) ? { key: ' ', code: 'Space', physicalKey: key } : { key, code: '' };
        const pressed = pressSentenceSessionKey(session, event, at, (id) => id);
        assert.notEqual(pressed.outcome.kind, 'wrong-key', `${unit}番目の単位の${key}が違うキーになった`);
        session = pressed.session;
      }
    }
  }
  assert.ok(sentenceSessionFinished(session));
  return session.records[0]!;
}

/** 範囲を打って、保存する記録を作る。 */
export function buildRecord(
  input: ResolvedInput,
  rangeIndex: number,
  choose: (unit: number, spellings: readonly string[]) => string,
  options: { readonly gapOf?: (unit: number) => number; readonly meta?: Partial<RecordMeta>; readonly unclean?: readonly number[] } = {},
): KeystrokeRecord {
  const trace = recordBaseTrace(input);
  const planned = recordPlanOf(input, trace, rangeIndex);
  assert.ok(planned.ok);
  const typed = typeRecordRange(planned.plan, choose, options.gapOf);
  const windowed = planned.rebuild === undefined ? undefined : windowedSignatureOf(planned.rebuild, typed.typed);
  const taps = typed.taps.map((tap, index) => (options.unclean?.includes(index) ? { ...tap, clean: false } : tap));
  const finished = finishKeystrokeRecord(input, trace, rangeIndex, typed.typed, taps, { ...RECORD_META, ...options.meta }, windowed);
  assert.ok(finished.ok, finished.ok ? '' : finished.reason);
  return finished.record;
}
