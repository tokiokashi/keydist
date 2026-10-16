import assert from 'node:assert/strict';
import test from 'node:test';
import { targetChoiceGroups } from '#hosts/shared/target-choices.ts';
import { resolvePaneInput } from '#hosts/shared/resolve-pane-input.ts';
import { traceConditionSummary } from '#hosts/shared/condition-summary.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { DEFAULT_TEXT_REF } from '#input/text/selection.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from '#engine/settings-items.ts';
import { DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { paneCatalog } from './catalog.ts';

const RULE: UserRomajiRule = {
  id: 'romaji-shi',
  name: 'し・ちをshi・chiで打つ',
  base: 'kunrei',
  overrides: { し: 'shi', ち: 'chi' },
  generateSokuon: true,
};
const LAYOUT: UserLayout = {
  id: 'user-mine',
  name: '自作の配列',
  rows: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
  romaji: RULE.id,
};
const TEXT: ResolvedText = {
  ref: DEFAULT_TEXT_REF,
  name: 'テスト',
  text: 'しちじゅうしち',
  language: 'ja',
  languageOverride: undefined,
  isBuiltin: false,
};

test('資産に自作の配列があれば、対象の選択の「自作の配列」に並ぶ', () => {
  const catalog = paneCatalog({ userLayouts: [LAYOUT], userRomajiRules: [RULE] });
  const groups = targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayouts: catalog.userLayouts,
    shapes: catalog.setupCatalog.shapes,
    setups: [],
    selected: [],
  });
  const user = groups.find((group) => group.id === 'user');
  assert.deepEqual(user?.choices.map((choice) => choice.name), ['自作の配列']);
});

test('資産が空なら、組み込みだけのカタログになる', () => {
  const catalog = paneCatalog({ userLayouts: [], userRomajiRules: [] });
  assert.equal(catalog.userLayouts.size, 0);
  assert.deepEqual(catalog.customRomajiRules, []);
  assert.equal(catalog.setupCatalog.layouts.has('qwerty'), true);
});

test('自作の配列を対象に解決でき、条件の要約に自作のローマ字規則の名前が出る', () => {
  const catalog = paneCatalog({ userLayouts: [LAYOUT], userRomajiRules: [RULE] });
  const result = resolvePaneInput(
    { kind: 'layout', layoutId: LAYOUT.id },
    new Map(),
    catalog,
    EMPTY_SETTINGS_OVERRIDES,
    TEXT,
  );
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, RULE.id);

  const rows = traceConditionSummary(result.input.cascade, catalog.setupCatalog);
  assert.equal(rows.find((row) => row.id === 'romajiRuleId')?.displayValue, RULE.name);
});

test('規則が手持ちに無い時、条件の要約は規則のidを出さない', () => {
  const catalog = paneCatalog({ userLayouts: [LAYOUT], userRomajiRules: [RULE] });
  const result = resolvePaneInput(
    { kind: 'layout', layoutId: LAYOUT.id },
    new Map(),
    catalog,
    EMPTY_SETTINGS_OVERRIDES,
    TEXT,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const rows = traceConditionSummary(result.input.cascade, { shapes: catalog.setupCatalog.shapes });
  const display = rows.find((row) => row.id === 'romajiRuleId')?.displayValue;
  assert.equal(display, '見つからないローマ字規則');
});

test('自作の指の割り当てを条件で選ぶと、解決でその割り当てが使われる。手持ちを渡さなければ既定へ戻り診断が付く', () => {
  const mine = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-mine', name: '私の運指' };
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', mine.id);
  assert.ok(written.ok);
  if (!written.ok) return;
  const resolve = (catalog: ReturnType<typeof paneCatalog>) =>
    resolvePaneInput({ kind: 'layout', layoutId: LAYOUT.id }, new Map(), catalog, written.overrides, TEXT);

  const withMine = paneCatalog({ userLayouts: [LAYOUT], userRomajiRules: [RULE], fingerAssignments: [mine] });
  assert.deepEqual([...withMine.customFingerAssignments!.keys()], [mine.id]);
  const found = resolve(withMine);
  assert.ok(found.ok);
  if (!found.ok) return;
  assert.equal(found.input.geometry.assignment.id, mine.id);
  assert.deepEqual(found.input.cascade.fingerAssignmentId.diagnostics, []);

  const without = resolve(paneCatalog({ userLayouts: [LAYOUT], userRomajiRules: [RULE], fingerAssignments: [] }));
  assert.ok(without.ok);
  if (!without.ok) return;
  assert.equal(without.input.geometry.assignment.id, DEFAULT_FINGER_ASSIGNMENT.id);
  assert.equal(without.input.cascade.fingerAssignmentId.diagnostics.length, 1);
});
