import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyId } from '../shapes/geometry.ts';
import { LAYOUTS, LAYOUTS_JA } from './index.ts';

/**
 * 出典が示す配置。index.tsの定義とは別に、出典（または第三者の転記）から書き写した行を持つ。
 * 行頭は各段の左端のキー。数字段は出典が定義していない配列では省く。
 */
const SOURCE_ROWS: Record<string, { digits?: string; top: string; home: string; bottom: string }> = {
  eucalyn: { top: 'qw,.;mrdyp', home: 'aoeiugtksn', bottom: 'zxcvfbhjl/' },
  astarte: { digits: '1234567890;=', top: 'qpuy,jdhgw[]', home: "ioea.ktnsr'", bottom: 'zx-c/mlfbv' },
  tomisuke: { digits: '1234567890[]', top: "',.-=lrdyp;/", home: 'aoeiugntskf', bottom: 'xcvwqjhmbz' },
  gallium: { top: 'bldcvjfou,[]', home: 'nrtsgyhaei/', bottom: "xqmwzkp';." },
  'semimak-jq': { top: "flhvz'wuoy", home: 'srntkcdeai;', bottom: 'xjbmqpg,./' },
  recurva: { top: 'frdpvqjuoy', home: 'sntcb.heai/', bottom: "zxkgwml;'," },
  aptv3: { top: 'wgdfbqluoy', home: 'rsthkjneai;', bottom: "xcmpvz,.'/" },
  norman: { top: 'qwdfkjurl;', home: "asetgynioh'", bottom: 'zxcvbpm,./' },
  qgmlwy: { top: 'qgmlwyfub;', home: "dstnriaeoh'", bottom: 'zxcvjkp,./' },
  'colemak-dh-ansi': { top: 'qwfpbjluy;[]', home: "arstgmneio'", bottom: 'xcdvzkh,./' },
  'canary-ansi': { top: 'wlypkzxou;[]', home: "crstbfneia'", bottom: 'jvdgqmh/,.' },
  canary: { top: "wlypbzfou'[]", home: 'crstgmneia;', bottom: 'qjvdkxh/,.' },
  'sturdy-ansi': { top: 'vmlcpxfouj[]', home: 'strdy.naei/', bottom: "kqgwzbh';," },
  sturdy: { top: 'vmlcpxfouj[]', home: 'strdy.naei/', bottom: "zkqgwbh';," },
};

const rowOf = (legends: ReadonlyMap<string, string>, row: number, length: number): string =>
  Array.from({ length }, (_, col) => legends.get(keyId(row, col)) ?? '').join('');

for (const [id, expected] of Object.entries(SOURCE_ROWS)) {
  const layout = LAYOUTS.find((entry) => entry.id === id);

  test(`${id}: 出典の配置と一致する`, () => {
    assert.ok(layout, `${id}が組み込みの英字配列に無い`);
    if (expected.digits !== undefined) assert.equal(rowOf(layout.legends, 0, expected.digits.length), expected.digits);
    assert.equal(rowOf(layout.legends, 1, expected.top.length), expected.top);
    assert.equal(rowOf(layout.legends, 2, expected.home.length), expected.home);
    assert.equal(rowOf(layout.legends, 3, expected.bottom.length), expected.bottom);
  });

  test(`${id}: 英字26文字が1回ずつ現れ、どの文字も1つのキーにだけある`, () => {
    assert.ok(layout, `${id}が組み込みの英字配列に無い`);
    const outputs = [...layout.legends.entries()].map(([, legend]) => legend).filter((legend) => [...legend].length === 1);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      assert.equal(outputs.filter((legend) => legend === letter).length, 1, `${id}: ${letter}`);
    }
    assert.equal(new Set(outputs).size, outputs.length, `${id}: 刻印が重複している`);
  });

  test(`${id}: 日本語のテキスト用の一覧にも同じ配置で入っている`, () => {
    assert.ok(layout);
    const ja = LAYOUTS_JA.find((entry) => entry.id === id);
    assert.ok(ja, `${id}がLAYOUTS_JAに無い`);
    assert.deepEqual([...ja.legends], [...layout.legends]);
  });
}

/**
 * 角度改変の運指で打つ前提の配列は、作者の説明にある規則（下段の左5キーを1つ左へ寄せ、左端の1キーをQWERTYの `b` の位置へ移す）で、
 * 寄せる前の並び（オーソリニア用・ISO用・マトリクス用）から作れる。出典が示す寄せる前の並びを別に持ち、規則で変換した結果が組み込みの下段と一致することを確かめる。
 * Canary（ANSI）は作者が寄せる前の並びを別の文字配置で出しているので、この対象に含めない。
 */
const BEFORE_ANGLE_MOD: Record<string, string> = {
  'colemak-dh-ansi': 'zxcdvkh,./',
  'sturdy-ansi': "zkqgwbh';,",
};

const angleModBottom = (row: string): string => row.slice(1, 5) + row[0] + row.slice(5);

for (const [id, before] of Object.entries(BEFORE_ANGLE_MOD)) {
  test(`${id}: 下段は寄せる前の並びに角度改変の規則を当てた結果と一致する`, () => {
    const layout = LAYOUTS.find((entry) => entry.id === id);
    assert.ok(layout);
    assert.equal(rowOf(layout.legends, 3, 10), angleModBottom(before));
  });
}

// 作者のXKB定義に、角度改変をしない版（noangle）が別に書かれている。ANSI用の下段はその規則の結果と一致する
test('canary-ansi: 下段は作者の角度改変をしない版に規則を当てた結果と一致する', () => {
  const layout = LAYOUTS.find((entry) => entry.id === 'canary-ansi');
  assert.ok(layout);
  assert.equal(rowOf(layout.legends, 3, 10), angleModBottom('qjvdgmh/,.'));
});

const ANGLE_MOD_IDS = ['colemak-dh-ansi', 'canary-ansi', 'sturdy-ansi'];
const NOT_SHIFTED_IDS = ['colemak-dh', 'canary', 'sturdy'];

test('角度改変の運指で打つ前提の3配列だけが、推奨の指の割り当てに角度改変を持つ', () => {
  for (const id of ANGLE_MOD_IDS) {
    assert.deepEqual(LAYOUTS.find((entry) => entry.id === id)?.recommendedFingerAssignmentIds, { ansi: 'angle-mod', jis: 'angle-mod-jis' }, id);
  }
  for (const id of NOT_SHIFTED_IDS) {
    assert.equal(LAYOUTS.find((entry) => entry.id === id)?.recommendedFingerAssignmentIds, undefined, id);
  }
});
