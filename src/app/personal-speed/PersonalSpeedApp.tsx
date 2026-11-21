import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  kanjiDirectLayoutsVersion,
  KANJI_DIRECT_DECLARATIONS,
  requestKanjiDirectLayout,
  subscribeKanjiDirectLayouts,
} from '#input/layouts/kanji-direct-tables.ts';
import { setPersonalSpeedCommand } from '#engine/commands.ts';
import { loadBrowserKeyBindingOverrides } from '#tester/browser-keyboard-bindings.ts';
import { PersonalSpeedEditor } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { SPEC_LINKS } from '../about/links.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { defaultFingerAssignmentIdOf, initialPersonalSpeedSelection, personalSpeedCatalog } from './personal-speed-setup.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

/** 画面の説明から、計算の詳細へ案内する再生時間モデルの仕様書。 */
const TIMING_SPEC_HREF = SPEC_LINKS.find((link) => link.path === 'spec/playback-timing.md')?.url;

/** Testerの画面で割り当てた、押下の`code`からキーのidへの対応。保存先を読めない時は割り当てなしとして扱う。 */
function readKeyBindingOverrides() {
  try {
    return loadBrowserKeyBindingOverrides(window.localStorage);
  } catch {
    return {};
  }
}

/**
 * 個人速度の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 画面を開いた時の選択は保存済みの資産が読み込まれた後の値で決めるので、読み込みの前後で作り直す。
 */
export function PersonalSpeedApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const { userLayouts, userRomajiRules, fingerAssignments } = assets;
  const { overrides } = assets.setupLibrary;
  // 測るキーを選ぶ候補は、表を使える配列だけを出す（表を取得する前の漢直の配列は、刻印が空で選べない）。
  // 画面を開いた時に漢直の表を取得し、取得できた配列から候補に加える
  const kanjiDirectVersion = useSyncExternalStore(subscribeKanjiDirectLayouts, kanjiDirectLayoutsVersion, kanjiDirectLayoutsVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 取得に失敗した表を試し直す合図（`kanjiDirectVersion`）で、取得し直す
  useEffect(() => {
    for (const declaration of KANJI_DIRECT_DECLARATIONS) void requestKanjiDirectLayout(declaration.id);
  }, [kanjiDirectVersion]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 漢直の配列の表は外部の置き場（`kanji-direct-tables.ts`）にあり、取得が済んだら候補と示す文を作り直すため、`kanjiDirectVersion`を依存に入れる
  const catalog = useMemo(
    () => personalSpeedCatalog({ userLayouts, userRomajiRules, fingerAssignments }),
    [userLayouts, userRomajiRules, fingerAssignments, kanjiDirectVersion],
  );
  // 示す文の打鍵の列は、全体の条件（ローマ字規則・Chain・Arpeggioの数え方など）と自作の配列・指の割り当てで決まる。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同じ理由で、`kanjiDirectVersion`を依存に入れる
  const buildSentence = useMemo(
    () => personalSpeedSentenceBuilder({ userLayouts, userRomajiRules, fingerAssignments, setupLibrary: { overrides } }),
    [userLayouts, userRomajiRules, fingerAssignments, overrides, kanjiDirectVersion],
  );
  return (
    <PersonalSpeedEditor
      key={ready ? 'ready' : 'loading'}
      calibration={assets.personalSpeed.calibration}
      ready={ready}
      catalog={catalog}
      initialSelection={initialPersonalSpeedSelection(assets, catalog)}
      defaultFingerAssignmentId={(shapeId) => defaultFingerAssignmentIdOf(shapeId, catalog)}
      buildSentence={buildSentence}
      readKeyBindingOverrides={readKeyBindingOverrides}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onSave={(calibration) => dispatch(setPersonalSpeedCommand(calibration))}
      onDiscard={() => dispatch(setPersonalSpeedCommand(undefined))}
      specHref={TIMING_SPEC_HREF}
    />
  );
}
