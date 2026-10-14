import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SENTENCE_ROUNDS,
  pressSentenceKey,
  pressSentenceSessionKey,
  sentenceSamples,
  sentenceSessionFinished,
  startSentenceSession,
  remainingSentenceKeys,
  sentenceRunFinished,
  sentenceSteps,
  stepsSentencePlan,
  sentenceUnmeasurable,
  startSentenceRun,
  type SentenceRun,
  type SentenceStep,
} from './sentence-session.ts';

const step = (keys: string[], inputIndex: number, inputChar = String(inputIndex)): SentenceStep => ({ keys, inputIndex, inputChar });
const keyEvent = (key: string) => ({ key, code: `Key${key.toUpperCase()}` });
const label = (id: string) => id.toUpperCase();
const planOf = (steps: readonly SentenceStep[]) => stepsSentencePlan(steps, () => undefined);

function press(run: SentenceRun, key: string, atMs: number) {
  return pressSentenceKey(run, keyEvent(key), atMs, label);
}

test('正しいキーを順に押すと、ストロークごとの時刻が記録される', () => {
  let run = startSentenceRun(planOf([step(['a'], 0), step(['s'], 1), step(['d'], 2)]));
  for (const [key, atMs, kind] of [['a', 100, 'step-finished'], ['s', 250, 'step-finished'], ['d', 400, 'run-finished']] as const) {
    const pressed = press(run, key, atMs);
    assert.equal(pressed.outcome.kind, kind);
    run = pressed.run;
  }
  assert.ok(sentenceRunFinished(run));
  assert.deepEqual(run.taps, [{ atMs: 100, clean: true }, { atMs: 250, clean: true }, { atMs: 400, clean: true }]);
});

test('違うキーを押すと知らされ、そのストロークの間隔は数えない。次のストロークは数える', () => {
  let run = startSentenceRun(planOf([step(['a'], 0), step(['s'], 1), step(['d'], 2)]));
  run = press(run, 'a', 100).run;
  const wrong = press(run, 'x', 150);
  assert.deepEqual(wrong.outcome, { kind: 'wrong-key', expectedKey: 's', expectedIsOutput: false });
  assert.equal(wrong.run.unit, 1);
  run = press(wrong.run, 's', 300).run;
  run = press(run, 'd', 450).run;
  assert.deepEqual(run.taps.map((tap) => tap.clean), [true, false, true]);
  assert.deepEqual(run.taps.map((tap) => tap.atMs), [100, 300, 450]);
});

test('同時に押すキーは順不同で、ストロークの時刻は最初の押下の時刻になる', () => {
  let run = startSentenceRun(planOf([step(['a'], 0), step(['s', 'd'], 1)]));
  run = press(run, 'a', 100).run;
  const first = press(run, 'd', 220);
  assert.equal(first.outcome.kind, 'partial');
  assert.deepEqual(remainingSentenceKeys(first.run), ['s']);
  const second = press(first.run, 's', 260);
  assert.equal(second.outcome.kind, 'run-finished');
  assert.deepEqual(second.run.taps[1], { atMs: 220, clean: true });
});

test('同時に押すキーのうち、すでに押したキーをもう一度押すと違うキーとして扱う', () => {
  let run = startSentenceRun(planOf([step(['s', 'd'], 0)]));
  run = press(run, 's', 100).run;
  const again = press(run, 's', 120);
  assert.equal(again.outcome.kind, 'wrong-key');
  assert.equal(again.run.threads[0].run.clean, false);
});

test('前のストロークの時刻より後でない押下は無視する', () => {
  let run = startSentenceRun(planOf([step(['a'], 0), step(['s'], 1)]));
  run = press(run, 'a', 100).run;
  const ignored = press(run, 's', 100);
  assert.equal(ignored.outcome.kind, 'ignored');
  assert.equal(ignored.run, run);
});

test('Space・修飾キー・親指キーなど、取れないキーが要る列は測れない', () => {
  assert.equal(sentenceUnmeasurable([]), 'empty');
  assert.equal(sentenceUnmeasurable([step(['a'], 0), step(['thumb-r'], 1)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['shift-l', 'a'], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['r0c13'], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step([], 0)]), 'uncapturable-key');
  assert.equal(sentenceUnmeasurable([step(['a'], 0), step([';'], 1)]), undefined);
});

test('同じ入力単位を打つステップをまとめて、かな1文字ずつにする', () => {
  const plan = planOf([step(['s'], 0, 'し'), step(['i'], 0, 'し'), step(['a'], 1, 'あ')]);
  assert.deepEqual(plan.units.map((unit) => unit.text), ['し', 'あ']);
  assert.deepEqual(plan.baseSteps.map((steps) => steps.length), [2, 1]);
});

// コンボで打つストロークの出力の文字は、物理位置が違っても文字（key）だけで照合する。
const outputEvent = (key: string) => ({ key, code: 'Digit9' });
const comboStep = (keys: string[], outputChars: string[], inputIndex: number): SentenceStep => ({ ...step(keys, inputIndex), outputChars });

/** 押下の列を順に流して、各押下の結果を返す。 */
function play(steps: SentenceStep[], presses: readonly (string | readonly [string, 'out'])[]) {
  let run = startSentenceRun(planOf(steps));
  const kinds: string[] = [];
  presses.forEach((entry, i) => {
    const pressed = pressSentenceKey(
      run,
      typeof entry === 'string' ? keyEvent(entry) : outputEvent(entry[0]),
      100 + i * 100,
      label,
    );
    run = pressed.run;
    kinds.push(pressed.outcome.kind);
  });
  return { run, kinds };
}

test('コンボで打つストロークは、押すキーの押下だけでも、出力の文字の押下だけでも進む', () => {
  const steps = [comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0), step(['s'], 1)];
  const byKeys = play(steps, ['o', 'i', 'a', 's']);
  assert.deepEqual(byKeys.kinds, ['partial', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(byKeys.run.taps, [{ atMs: 100, clean: true }, { atMs: 400, clean: true }]);
  const byOutput = play(steps, [['y', 'out'], ['o', 'out'], ['u', 'out'], 's']);
  assert.deepEqual(byOutput.kinds, ['partial', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(byOutput.run.taps, [{ atMs: 100, clean: true, outputCompleted: true }, { atMs: 400, clean: true }]);
});

test('出力の文字は物理位置ではなく文字だけで照合し、押すキーは文字でも物理位置でも照合する', () => {
  const steps = [comboStep(['i', 'a'], ['q', 'w'], 0)];
  // 出力の文字は、物理位置がQ・Wのキーでも、文字がq・wでなければ受け付けない。
  assert.equal(pressSentenceKey(startSentenceRun(planOf(steps)), { key: 'x', code: 'KeyQ' }, 100, label).outcome.kind, 'wrong-key');
  // 押すキーは、文字がIでなくても物理位置がIなら受け付ける。
  assert.equal(pressSentenceKey(startSentenceRun(planOf(steps)), { key: 'x', code: 'KeyI' }, 100, label).outcome.kind, 'partial');
});

test('2つの読み方が混ざった押下の列は違うキーになり、そのストロークの間隔を数えない', () => {
  const steps = [comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0), step(['s'], 1)];
  // 押すキーのIの後に、出力の文字のU。
  const mixed = play(steps, ['i', ['u', 'out'], 'a', 'o', 's']);
  assert.deepEqual(mixed.kinds, ['partial', 'wrong-key', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(mixed.run.taps.map((tap) => tap.clean), [false, true]);
  // 出力の文字のYの後に、押すキーのA。
  const reverse = play(steps, [['y', 'out'], 'a', ['o', 'out'], ['u', 'out'], 's']);
  assert.deepEqual(reverse.kinds, ['partial', 'wrong-key', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(reverse.run.taps.map((tap) => tap.clean), [false, true]);
});

test('出力の文字の途中で違うキーを押すと、次の出力の文字を案内する', () => {
  const steps = [comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0)];
  let run = startSentenceRun(planOf(steps));
  run = pressSentenceKey(run, outputEvent('y'), 100, label).run;
  const wrong = pressSentenceKey(run, outputEvent('x'), 150, label);
  assert.deepEqual(wrong.outcome, { kind: 'wrong-key', expectedKey: 'o', expectedIsOutput: true });
  // 押すキーの読み方が残っている間は、押すキーを案内する。
  const first = pressSentenceKey(startSentenceRun(planOf(steps)), keyEvent('i'), 100, label);
  const wrongAfterKey = pressSentenceKey(first.run, keyEvent('x'), 150, label);
  assert.deepEqual(wrongAfterKey.outcome, { kind: 'wrong-key', expectedKey: 'a', expectedIsOutput: false });
});

test('出力の最初の文字が押すキーと同じコンボは、どちらの読み方でも進む', () => {
  // iku: 押すキーI・X、出力i・k・u。最初のIの押下は両方の読み方に一致する。
  const steps = [comboStep(['i', 'x'], ['i', 'k', 'u'], 0), step(['s'], 1)];
  const byKeys = play(steps, ['i', 'x', 's']);
  assert.deepEqual(byKeys.kinds, ['partial', 'step-finished', 'run-finished']);
  assert.deepEqual(byKeys.run.taps.map((tap) => tap.clean), [true, true]);
  const byOutput = play(steps, ['i', ['k', 'out'], ['u', 'out'], 's']);
  assert.deepEqual(byOutput.kinds, ['partial', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(byOutput.run.taps.map((tap) => tap.clean), [true, true]);
  assert.equal(byOutput.run.taps[0].atMs, 100);
});

test('出力に同じ文字が続くコンボは、その回数だけ押すと出力の文字の押下で進む', () => {
  const steps = [comboStep(['j', 'k'], ['i', 'i'], 0), step(['s'], 1)];
  const played = play(steps, [['i', 'out'], ['i', 'out'], 's']);
  assert.deepEqual(played.kinds, ['partial', 'step-finished', 'run-finished']);
  // 1回だけでは進まない。
  assert.equal(play(steps, [['i', 'out']]).kinds[0], 'partial');
  // 押すキーの読み方では、同じキーの2回目は違うキーになる。
  assert.equal(play([comboStep(['j', 'k'], ['n', 'n'], 0)], ['j', 'j']).kinds[1], 'wrong-key');
});

test('一方の読み方の完了が他方の途中にあたるコンボは、続きに一致すればその読み方で続ける', () => {
  // ae: 押すキーA・E・I、出力a・e。A・Eで出力の読み方が完了するが、押すキーの読み方は途中。
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1)];
  const byKeys = play(steps, ['a', 'e', 'i', 's']);
  assert.deepEqual(byKeys.kinds, ['partial', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(byKeys.run.taps, [{ atMs: 100, clean: true }, { atMs: 400, clean: true }]);
  assert.equal(byKeys.run.unit, 2);
});

test('一方の読み方の完了が他方の途中にあたるコンボは、続きに一致しなければ完了した読み方で確定し、その押下を次のストロークで数える', () => {
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1), step(['d'], 2)];
  // 出力の読み方だけで押した列。Sは出力の読み方の続きではないので、1つ目のストロークを出力の読み方で確定し、
  // 次のストロークの最初の押下になる。
  const output = play(steps, [['a', 'out'], ['e', 'out'], 's', 'd']);
  assert.deepEqual(output.kinds, ['partial', 'partial', 'step-finished', 'run-finished']);
  assert.deepEqual(output.run.taps, [
    { atMs: 100, clean: true, outputCompleted: true },
    { atMs: 300, clean: true },
    { atMs: 400, clean: true },
  ]);
  assert.ok(sentenceRunFinished(output.run));
});

test('完了した読み方で確定した押下が次のストロークの最初の押下として違うキーなら、次のストロークの間隔を数えない', () => {
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1)];
  const output = play(steps, [['a', 'out'], ['e', 'out'], 'x']);
  assert.deepEqual(output.kinds, ['partial', 'partial', 'wrong-key']);
  assert.equal(output.run.unit, 1);
  assert.deepEqual(output.run.taps, [{ atMs: 100, clean: true, outputCompleted: true }]);
  assert.equal(output.run.threads[0].run.clean, false);
});

test('読み方が決まる前のaeは、続きの押下が押すキーの残りに一致すると押すキーの読み方で進み、その押下はaeに取られる', () => {
  // 出力の文字でa・eと打った直後に、次のストロークの最初の文字がIと一致する。限界として仕様に書いてある挙動。
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['i'], 1), step(['d'], 2)];
  const played = play(steps, [['a', 'out'], ['e', 'out'], 'i', 'd']);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'step-finished', 'wrong-key']);
});

test('出力の文字だけで完了したコンボの後は、aeの後に押すキーの残りと同じ押下が続いても出力の読み方で進む', () => {
  // you: 出力の文字y・o・uで完了し、押すキーの読み方は外れている。以後は出力の読み方だけで進める。
  const steps = [
    comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0),
    comboStep(['a', 'e', 'i'], ['a', 'e'], 1),
    step(['i'], 2),
  ];
  const played = play(steps, [['y', 'out'], ['o', 'out'], ['u', 'out'], ['a', 'out'], ['e', 'out'], 'i']);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'step-finished', 'partial', 'step-finished', 'run-finished']);
  assert.ok(played.run.taps.every((tap) => tap.clean));
  assert.ok(sentenceRunFinished(played.run));
});

test('押すキーだけで完了したコンボの後は、押すキーの読み方だけで進み、出力の文字は受け付けない', () => {
  const steps = [comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0), comboStep(['j', 'k', 'l'], ['q', 'w'], 1)];
  const played = play(steps, ['o', 'i', 'a', 'j', 'k', 'l']);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'step-finished', 'partial', 'partial', 'run-finished']);
  assert.ok(sentenceRunFinished(played.run));
  // 決まった後の出力の文字の押下は、違うキーになる。
  const output = play(steps, ['o', 'i', 'a', ['q', 'out']]);
  assert.equal(output.kinds[3], 'wrong-key');
});

test('次の押下で他方の読み方が外れて確定したコンボからも、読み方が決まる', () => {
  // aeを出力の文字で打ち、続くsが押すキーの残りIと一致しないので、出力の読み方に決まる。
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1), comboStep(['a', 'e', 'i'], ['a', 'e'], 2), step(['i'], 3)];
  const played = play(steps, [['a', 'out'], ['e', 'out'], 's', ['a', 'out'], ['e', 'out'], 'i']);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'step-finished', 'partial', 'step-finished', 'run-finished']);
});

test('他方が先に完了していた読み方では、後から完了した読み方に決めない', () => {
  // ae を出力の文字で打ち、続けて押すキーの残り I を押す。出力の読み方は先に完了していたので、どちらにも決めない。
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 1)];
  const played = play(steps, [['a', 'out'], ['e', 'out'], 'i', ['y', 'out'], ['o', 'out'], ['u', 'out']]);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'step-finished', 'partial', 'partial', 'run-finished']);
  assert.ok(played.run.taps.every((tap) => tap.clean));
});

test('完了後の押下が次のストロークにも一致しない打ち間違いでは、読み方を決めない', () => {
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 1)];
  // ae を A・E で押した後の Q は、どちらの読み方にも続かない。その後は押すキーで正しく押す。
  const played = play(steps, ['a', 'e', 'q', 'o', 'i', 'a']);
  assert.deepEqual(played.kinds, ['partial', 'partial', 'wrong-key', 'partial', 'partial', 'run-finished']);
  assert.deepEqual(played.run.taps.map((tap) => tap.clean), [true, false]);
});

test('最後のストロークは、一方の読み方が完了した時点で確定する', () => {
  const steps = [step(['s'], 0), comboStep(['a', 'e', 'i'], ['a', 'e'], 1)];
  const played = play(steps, ['s', ['a', 'out'], ['e', 'out']]);
  assert.deepEqual(played.kinds, ['step-finished', 'partial', 'run-finished']);
  assert.ok(sentenceRunFinished(played.run));
});

test('コンボで打たない同時押しのストロークは、出力の文字では進まず、押すキーの押下だけで進む', () => {
  const steps = [step(['j', 'k'], 0), step(['s'], 1)];
  assert.deepEqual(play(steps, ['k', 'j', 's']).kinds, ['partial', 'step-finished', 'run-finished']);
  // 同じキーでも、コンボで打つストロークなら受け付ける出力の文字を、コンボで打たないストロークは受け付けない。
  assert.equal(play([step(['j', 'k'], 0)], ['q']).kinds[0], 'wrong-key');
  assert.equal(play([comboStep(['j', 'k'], ['q', 'w'], 0)], ['q']).kinds[0], 'partial');
});

test('1回の入力の選択が複数のストロークになるコンボと、取れない文字を含むコンボは、出力の文字を持たない', () => {
  const stroke = (selectionIndex: number, char: string, aggregationGroupId: string) => ({
    selectionIndex,
    char,
    aggregationGroupId,
    inputIndex: 0,
    inputChar: 'x',
    presses: [{ keys: [{ id: 'a' }] }],
  });
  const analysis = {
    strokes: [
      stroke(0, 'you', 'combo'),
      stroke(1, 'ab', 'combo'),
      stroke(1, 'ab', 'combo'),
      stroke(2, 'a b', 'combo'),
      stroke(3, 'ょ', 'single'),
    ],
  } as unknown as Parameters<typeof sentenceSteps>[0];
  assert.deepEqual(sentenceSteps(analysis).map((s) => s.outputChars), [
    ['y', 'o', 'u'],
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

/** 押下の列を、1つの測定の進行へ順に流す。 */
function playSession(plans: ReturnType<typeof planOf>[], presses: readonly string[], firstAtMs = 100) {
  let session = startSentenceSession(plans);
  const kinds: string[] = [];
  presses.forEach((key, index) => {
    const pressed = pressSentenceSessionKey(session, keyEvent(key), firstAtMs + index * 100, label);
    session = pressed.session;
    kinds.push(pressed.outcome.kind);
  });
  return { session, kinds };
}

test('文ごとに3回続けて打ち、1回を打ち終えるたびに次の回へ進む。最後の回で全体が済む', () => {
  const plans = [planOf([step(['a'], 0), step(['s'], 1)]), planOf([step(['d'], 0), step(['f'], 1)])];
  assert.equal(SENTENCE_ROUNDS, 3);
  const once = playSession(plans, ['a', 's']);
  assert.deepEqual(once.kinds, ['step-finished', 'round-finished']);
  assert.deepEqual([once.session.sentence, once.session.round], [0, 1]);
  const all = playSession(plans, [...'asasas', ...'dfdfdf']);
  assert.equal(all.kinds.at(-1), 'run-finished');
  assert.ok(sentenceSessionFinished(all.session));
  assert.deepEqual(all.session.records.map((record) => [record.sentence, record.round]), [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
});

test('回の記録は回ごとに別で、回をまたぐ間隔は記録に入らない', () => {
  const plans = [planOf([step(['a'], 0), step(['s'], 1)])];
  const { session } = playSession(plans, [...'asasas']);
  for (const record of session.records) assert.equal(record.taps.length, 2);
  // 2回目の最初のストロークの時刻は、1回目の最後のストロークの時刻とは別の記録にある。
  assert.deepEqual(session.records[1].taps.map((tap) => tap.atMs), [300, 400]);
});

test('各文の1回目は数えず、2回目以降だけが標本になる', () => {
  const plans = [planOf([step(['a'], 0), step(['s'], 1)])];
  const analysis = { strokes: [{}, {}] } as never;
  const withAnalysis = [{ ...plans[0], analyze: () => analysis }];
  const { session } = playSession(withAnalysis, [...'asasas']);
  const samples = sentenceSamples(withAnalysis, session.records);
  assert.ok(samples !== undefined);
  assert.deepEqual(samples.map((sample) => sample.taps.map((tap) => tap.atMs)), [[300, 400], [500, 600]]);
  // 打った綴りの打鍵の列のストロークの数が記録と合わない回があれば、標本を作らない。
  const mismatched = [{ ...plans[0], analyze: () => ({ strokes: [{}] }) as never }];
  assert.equal(sentenceSamples(mismatched, session.records), undefined);
});

test('決まったコンボの打ち方は、次の文・回へ持ち越す', () => {
  // 1本目のcomboは出力の文字だけで完了して、出力の読み方に決まる。2本目の最初のストロークは、aeを出力の文字で打った後にIが続くが、
  // 出力の読み方に決まっているので、出力の読み方で確定して次の押下になる。
  const first = planOf([comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0)]);
  const second = planOf([comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['i'], 1)]);
  const out = (key: string) => ({ key, code: 'Digit9' });
  let session = startSentenceSession([first, second], 1);
  const kinds: string[] = [];
  let atMs = 0;
  for (const event of [out('y'), out('o'), out('u'), out('a'), out('e'), keyEvent('i')]) {
    atMs += 100;
    const pressed = pressSentenceSessionKey(session, event, atMs, label);
    session = pressed.session;
    kinds.push(pressed.outcome.kind);
  }
  assert.ok(!kinds.includes('wrong-key'), kinds.join());
  assert.ok(sentenceSessionFinished(session));
  assert.equal(session.run.reading, 'output');
});

test('出力の文字の読み方で完了したストロークだけが、出力の文字の読み方で完了した印を持つ', () => {
  const taps = (steps: SentenceStep[], presses: readonly (string | readonly [string, 'out'])[]) =>
    play(steps, presses).run.taps.map((tap) => tap.outputCompleted === true);
  // 押すキーの読み方で完了したコンボと、コンボで打たないストロークは持たない。
  assert.deepEqual(taps([comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0), step(['s'], 1)], ['o', 'i', 'a', 's']), [false, false]);
  // 出力の文字の読み方だけで完了したコンボは持つ。
  assert.deepEqual(taps([comboStep(['i', 'a', 'o'], ['y', 'o', 'u'], 0), step(['s'], 1)], [['y', 'out'], ['o', 'out'], ['u', 'out'], 's']), [true, false]);
  // 出力の文字の読み方が先に完了し、押すキーの読み方が途中のまま次の押下で確定したものは持つ。確定させた押下が次の単位のものでも同じ。
  assert.deepEqual(taps([comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1), step(['d'], 2)], [['a', 'out'], ['e', 'out'], 's', 'd']), [true, false, false]);
  // 押すキーの読み方が途中のまま、最後のストロークで確定したものは持つ。
  assert.deepEqual(taps([step(['s'], 0), comboStep(['a', 'e', 'i'], ['a', 'e'], 1)], ['s', ['a', 'out'], ['e', 'out']]), [false, true]);
  // 出力の文字の読み方が先に完了しても、押すキーの読み方が後から完了したものは持たない。
  assert.deepEqual(taps([comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1)], [['a', 'out'], ['e', 'out'], 'i', 's']), [false, false]);
});

test('両方の読み方が同じ押下で完了したコンボは、出力の文字の読み方で完了した印を持たない', () => {
  // 押すキーと出力の文字が同じコンボ。
  const played = play([comboStep(['j', 'k'], ['j', 'k'], 0), step(['s'], 1)], ['j', 'k', 's']);
  assert.deepEqual(played.run.taps, [{ atMs: 100, clean: true }, { atMs: 300, clean: true }]);
});

test('出力の文字の読み方で完了したストロークは、次の単位の最初の押下で確定しても印を持つ', () => {
  // 単位の最後のストロークが出力の文字で完了し、次の単位の最初の押下で確定する。
  const steps = [comboStep(['a', 'e', 'i'], ['a', 'e'], 0), step(['s'], 1)];
  const played = play(steps, [['a', 'out'], ['e', 'out'], 's']);
  assert.equal(played.run.taps[0].outputCompleted, true);
});
