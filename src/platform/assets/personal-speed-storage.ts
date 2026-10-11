/**
 * 個人速度（`PersonalSpeed`、`#interpretation/timing/calibration-codec.ts`）の保存先キー。
 * 配列・Setup・Workspaceの資産とは別のキーに置き、他タブがそれらを書いても個人速度の
 * 履歴を巻き込まない。codecは`interpretation`にあり、`platform`は`interpretation`を
 * importできないので、束ねるのは`app`（`app/standalone/asset-storage-specs.ts`）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const PERSONAL_SPEED_STORAGE_KEY = 'keydist:personal-speed';
