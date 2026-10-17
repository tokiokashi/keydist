import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import { applySentenceMeasurement, measureSentence } from '#interpretation/timing/sentence-measurement.ts';
import {
  pressSentenceKey,
  remainingSentenceKeys,
  remainingSentenceStrokes,
  sentencePlan,
  sentenceRunFinished,
  startSentenceRun,
  upcomingSentenceSteps,
  type SentencePlan,
  type SentenceRun,
} from '#interpretation/timing/sentence-session.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const SELECTION: PersonalSpeedSelection = { layoutId: 'qwerty', shapeId: 'row-staggered', fingerAssignmentId: 'default' };
const label = (id: string) => id.toUpperCase();

function written(
  overrides: SettingsCascadeOverrides,
  ...args: Parameters<typeof setSettingsOverride> extends [unknown, ...infer R] ? R : never
): SettingsCascadeOverrides {
  const result = setSettingsOverride(overrides, ...args);
  assert.ok(result.ok);
  return result.overrides;
}

function build(text: string, selection: Partial<PersonalSpeedSelection> = {}, overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES) {
  const result = personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides } })({ ...SELECTION, ...selection }, text);
  assert.ok(result.ok);
  return result;
}

function planOf(text: string, selection: Partial<PersonalSpeedSelection> = {}, overrides?: SettingsCascadeOverrides) {
  const result = build(text, selection, overrides);
  return { result, plan: sentencePlan(result.analysis, result.spelling) };
}

/** 文字を順に押す。結果の種類の列と、最後の進行を返す。 */
function type(plan: SentencePlan | SentenceRun, keys: string, firstAtMs = 100) {
  let run = 'plan' in plan ? plan : startSentenceRun(plan);
  const kinds: string[] = [];
  [...keys].forEach((key, index) => {
    const pressed = pressSentenceKey(run, { key, code: `Key${key.toUpperCase()}` }, firstAtMs + index * 100, label);
    run = pressed.run;
    kinds.push(pressed.outcome.kind);
  });
  return { run, kinds };
}

const SAVED: PlaybackCalibration = {
  actionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecond: 5,
  sameHandDifferentFingerActionsPerSecondByPair: {},
  fingerRepeatMs: {},
  fingerMoveMsPerUnit: {},
  fallbackRepeatMs: 1000 / 5,
  fallbackMoveMsPerUnit: 1000 / 10,
  measuredAt: 1,
};

/** 示す文のかなごとに、普段の綴りに近い選び方で綴りを決める。 */
function usualSpelling(kana: string, spellings: readonly string[]): string {
  const prefer: Record<string, string> = { し: 'shi', ち: 'chi', つ: 'tsu', しゃ: 'sha', ふ: 'fu', じ: 'ji', じゃ: 'ja', ちゃ: 'cha', ん: 'n' };
  return prefer[kana] !== undefined && spellings.includes(prefer[kana]) ? prefer[kana] : spellings[0];
}

test('訓令式の条件のQWERTYで、shi・chi・tsu・shaと子音の前のn1打を混ぜて示す文を打ち切れ、値は打った綴りの打鍵の列から求める', () => {
  const { result, plan } = planOf('でんしゃがおくれてかいしゃにちこくしたつくえ');
  assert.ok(result.spelling !== undefined);
  const spelled = plan.units.map((unit) => usualSpelling(unit.text, unit.spellings));
  // 「ん」のn1打を選んだ単位の次は、次の単位の最初のキーで確定する。
  const keys = spelled.join('');
  const { run, kinds } = type(plan, keys);
  assert.ok(!kinds.includes('wrong-key'));
  assert.equal(run.unit, plan.units.length);
  assert.deepEqual(run.typed, spelled);
  for (const typical of ['shi', 'chi', 'tsu', 'sha', 'n']) assert.ok(run.typed.includes(typical), typical);

  const analysis = plan.analyze(run.typed);
  assert.ok(analysis !== undefined);
  // 打った綴りの打鍵の列のストロークの数は、数えた打鍵の数と一致する。示した綴りの打鍵の列とは数が違う。
  assert.equal(analysis.strokes.length, run.taps.length);
  assert.equal(analysis.strokes.map((stroke) => stroke.char).join(''), keys);
  assert.notEqual(result.analysis.strokes.length, run.taps.length);

  const saved = applySentenceMeasurement(
    SAVED,
    [{ sentence: 0, analysis, taps: run.taps.map((tap, index) => ({ ...tap, atMs: index * 300 })) }],
    2,
    SAVED,
  );
  assert.ok(saved.ok);
  assert.ok(Object.values(saved.measurement.counts).reduce((a, b) => a + b, 0) > 0);
});

test('fu・ji・jaでも打てる', () => {
  const { plan } = planOf('ふじかじゃ');
  const { run, kinds } = type(plan, 'fujikaja');
  assert.ok(!kinds.includes('wrong-key'));
  assert.deepEqual(run.typed, ['fu', 'ji', 'ka', 'ja']);
  assert.equal(kinds.at(-1), 'run-finished');
});

test('標準・訓令式・大西式の規則の綴りも、どれの条件でも受け付ける', () => {
  for (const rule of ['qwerty', 'kunrei', 'oonishi']) {
    const overrides = written(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', rule);
    const { plan } = planOf('しゃしちつふじ', {}, overrides);
    const { run, kinds } = type(plan, 'syasitituhuzi');
    assert.equal(kinds.indexOf('wrong-key'), -1, `${rule} ${kinds.join(',')}`);
    assert.equal(kinds.at(-1), 'run-finished', rule);
    const { run: other } = type(plan, 'shashichitsufuji');
    assert.equal(other.unit, plan.units.length, rule);
    assert.equal(run.unit, plan.units.length, rule);
  }
});

test('促音は、次のかなの受け付ける綴りの最初の文字を重ねた形で打てる', () => {
  const { plan } = planOf('まっちゃまっしゅ');
  assert.equal(type(plan, 'macchamasshu').kinds.at(-1), 'run-finished');
  assert.equal(type(plan, 'mattyamassyu').kinds.at(-1), 'run-finished');
  // 「tchi」は受け付けない。
  assert.ok(type(planOf('まっち').plan, 'matchi').kinds.includes('wrong-key'));
});

test('子音の前の「ん」はn1打で次のかなへ進む。母音・y・nの前、記号の前、文の最後は進まない', () => {
  // 子音の前: nの1打で確定し、次のtが「た」の最初の押下になる。
  const consonant = type(planOf('かんた').plan, 'kanta');
  assert.deepEqual(consonant.run.typed, ['ka', 'n', 'ta']);
  assert.equal(consonant.kinds.at(-1), 'run-finished');
  // nnも受け付ける。
  assert.deepEqual(type(planOf('かんた').plan, 'kannta').run.typed, ['ka', 'nn', 'ta']);
  // 母音・y・nの前はn 1打を受け付けず、nnの後に次のかなの最初のキーが続かなければ違うキーになる。
  for (const [text, keys] of [
    ['かんあ', 'kana'],
    ['かんや', 'kanya'],
    ['かんな', 'kanna'],
  ] as const) {
    assert.ok(type(planOf(text).plan, keys).kinds.includes('wrong-key'), text);
  }
  // 記号の前。
  assert.ok(type(planOf('かん、').plan, 'kan,').kinds.includes('wrong-key'));
  assert.ok(type(planOf('かん。').plan, 'kan.').kinds.includes('wrong-key'));
  assert.ok(type(planOf('かんー').plan, 'kan-').kinds.includes('wrong-key'));
  // 文の最後はn 1打では終わらない。
  const last = type(planOf('かん').plan, 'kan');
  assert.ok(!sentenceRunFinished(last.run));
  assert.equal(type(last.run, 'n', 1000).kinds.at(-1), 'run-finished');
});

test('母音・y・nの前の「ん」のn 1打の後の押下は違うキーになり、そのストロークの間隔を数えない', () => {
  const { plan } = planOf('かんあ');
  const played = type(plan, 'kan');
  const wrong = pressSentenceKey(played.run, { key: 'a', code: 'KeyA' }, 1000, label);
  assert.equal(wrong.outcome.kind, 'wrong-key');
  // 続けてnを押せばnnで確定し、次のaで終わる。「ん」のストロークは間隔を数えない印が付く。
  const second = type(wrong.run, 'na', 1100);
  assert.equal(second.kinds.at(-1), 'run-finished');
  assert.deepEqual(
    second.run.taps.map((tap) => tap.clean),
    [true, true, true, false, true],
  );
});

test('綴りを途中で切り替えた押下は違うキーになり、その後は残った綴りの続きで進める', () => {
  const { plan } = planOf('しゃ');
  // sの後にhでshaだけが残る。yは違うキー。
  const played = type(plan, 'shya');
  assert.deepEqual(played.kinds, ['step-finished', 'step-finished', 'wrong-key', 'run-finished']);
  assert.deepEqual(played.run.typed, ['sha']);
  // 違うキーだったのは3打目（a）のストロークなので、そのストロークの間隔は数えない。
  assert.deepEqual(
    played.run.taps.map((tap) => tap.clean),
    [true, true, false],
  );
  // sの後のyならsyaだけが残り、hが違うキーになる。
  const other = type(plan, 'syha');
  assert.deepEqual(other.kinds, ['step-finished', 'step-finished', 'wrong-key', 'run-finished']);
  assert.deepEqual(other.run.typed, ['sya']);
});

test('「し」でsの後はsiとshiの両方を残し、受け付ける綴りに無い押下は違うキーになる', () => {
  const { plan } = planOf('しか');
  const afterS = type(plan, 's');
  assert.equal(afterS.run.threads.length, 2);
  assert.ok(type(afterS.run, 'x', 500).kinds.includes('wrong-key'));
  assert.deepEqual(type(afterS.run, 'ika', 500).run.typed, ['si', 'ka']);
  assert.deepEqual(type(afterS.run, 'hika', 500).run.typed, ['shi', 'ka']);
  // 「ti」と「tsi」のような、表に無い綴りは受け付けない。
  assert.ok(type(planOf('つ').plan, 'tsi').kinds.includes('wrong-key'));
});

test('別の綴りで打ち始めたかなは、次に打つキー・この後・あと何打が打った綴りに合う', () => {
  const { plan } = planOf('しらちか');
  const initial = startSentenceRun(plan);
  // 打ち始める前は今の条件の規則（訓令式ならsi）の綴りで示す。
  assert.deepEqual(remainingSentenceKeys(initial), ['s']);
  assert.equal(remainingSentenceStrokes(initial), 2 + 2 + 2 + 2);
  const sh = type(initial, 'sh').run;
  // shiと打ち始めたので、次はi。「あと」はshiの残り1打と、後ろのかなの先頭の綴りの打数。
  assert.deepEqual(remainingSentenceKeys(sh), ['i']);
  assert.equal(remainingSentenceStrokes(sh), 1 + 2 + 2 + 2);
  const names = upcomingSentenceSteps(sh, 8).map((step) => step.keys.join('+'));
  assert.deepEqual(names, ['r', 'a', 't', 'i', 'k', 'a']);
  // chと打ち始めた「ち」はchiの残りを示す。
  const ch = type(sh, 'irac', 1000).run;
  assert.deepEqual(remainingSentenceKeys(ch), ['h']);
  assert.equal(remainingSentenceStrokes(ch), 2 + 2);
  assert.deepEqual(
    upcomingSentenceSteps(ch, 8).map((step) => step.keys.join('+')),
    ['i', 'k', 'a'],
  );
});

test('ローマ字だけで成立するコンボを持つ配列（TK音直入力法）と、まとめた綴りを持つ規則（AZIK）は、規則の綴りだけを受け付ける', () => {
  const tk = planOf('しゃしんです', { layoutId: 'oonishi-custom' });
  assert.equal(tk.result.spelling, undefined);
  assert.ok(tk.plan.units.every((unit) => unit.spellings.length === 1));
  assert.ok(type(tk.plan, 'shasin').kinds.includes('wrong-key'));

  const azik = planOf('しゃしんです', {}, written(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', 'azik'));
  assert.equal(azik.result.spelling, undefined);
  assert.ok(azik.plan.units.every((unit) => unit.spellings.length === 1));
});

test('かな配列は綴りを選べない', () => {
  assert.equal(build('しゃしんです', { layoutId: 'nicola' }).spelling, undefined);
});

test('回ごとに綴りが違っても、文ごと・構造の種類ごとの下限の数は、その文で数えた回のどれか1回の数に等しい', () => {
  const texts = ['なつやすみにはうみへあそびにいきたい', 'でんしゃがおくれてかいしゃにちこくした', 'こんしゅうのどようびにえいがをみにいく'];
  const kinds = ['arpeggio', 'chain', 'other'] as const;
  for (const text of texts) {
    const { plan } = planOf(text);
    const sampleOf = (pick: (spellings: readonly string[], kana: string) => string) => {
      const analysis = plan.analyze(plan.units.map((unit) => pick(unit.spellings, unit.text)));
      assert.ok(analysis !== undefined);
      return { sentence: 0, analysis, taps: analysis.strokes.map((_, index) => ({ atMs: index * 300, clean: true })) };
    };
    const rule = sampleOf((spellings) => spellings[0]);
    // つはtu、nは1打、候補の最後の綴りなど、綴りの長さが違う回。
    const variants = [
      sampleOf((spellings) => spellings[spellings.length - 1]),
      sampleOf((spellings, kana) => (kana === 'つ' ? 'tu' : kana === 'ん' ? 'n' : spellings[0])),
      sampleOf((spellings, kana) => (kana === 'つ' ? 'tsu' : kana === 'ん' ? 'nn' : spellings[0])),
      sampleOf((spellings) => spellings[Math.min(1, spellings.length - 1)]),
    ];
    for (const mix of [
      [rule, variants[0]],
      [variants[1], variants[2]],
      [variants[3], rule],
      [variants[2], variants[1], rule],
    ]) {
      const counts = measureSentence(mix, SAVED).counts;
      const each = mix.map((sample) => measureSentence([sample], SAVED).counts);
      for (const kind of kinds) {
        assert.equal(counts[kind], Math.max(...each.map((one) => one[kind])), `${text} ${kind}`);
      }
    }
  }
});
