# AppStateV2 persistence policy

Issue #413 Phase 8で、UI/runtime preferenceの永続化authorityを
`keydist:app-state` へ統合する。

## Root schema

`AppStateV2` は次のsliceを持つ。

- `workspace`: Testerの`WorkspaceStateV1`
- `analyzerWorkspace`: Analyzer NextのView instance + renderer-independent pane/tab layout
- `inputConverter`: `InputConverterPreferencesV2`
- `appearance`: App-level appearance preference（現在は `theme: light | dark | system`）
- `analyzer`: AnalyzerのUI preference（旧 `UiStateV1.ui` から playback / theme を除いたもの）
- `conditions`: Analyzerの解析条件
- `playback`: Analyzerの再生設定

Analyzer runtimeはPhase 9まで互換のため `UiStateV1` を再構成して使うが、
永続化先として `UiStateV1` を使わない。

## Migration sources and cleanup

次のkeyはPhase 8以降、read-once migration sourceとしてのみ扱う。

| Legacy key | Destination |
| --- | --- |
| `keydist:workspace-state` | `workspace` |
| `keydist:input-converter-preferences` | `inputConverter` |
| `AppStateV2.analyzer.theme` | `appearance.theme` |
| `keydist:ui-state` | `appearance` / `analyzer` / `conditions` / `playback` |
| `keydist:theme` | `appearance.theme` |
| `keydist:selected-layouts` | Analyzer migration source |
| `keydist:text-collapsed` | Analyzer migration source |

移行は「AppStateへ正常に保存 → 旧keyをremove」の順に行う。
AppState側にsliceが既にある場合も、残存する旧keyはcleanupする。

次のstorageはUI AppStateではなく独立したdomain/user assetなので吸収しない。

- `keydist:input-key-bindings`（および旧 `keydist:input-thumb-key-bindings`）
- `keydist:geometry-shapes`
- `keydist:layouts`
- `keydist:romaji-rules`
- `keydist:condition-presets`
- playback calibration storage

## Writer authority

Workspace / Tester / Analyzerのpersistent writerはすべて
`src/persistence/app-state-storage.ts` を通す。

各featureはslice単位でpatchし、保存直前に最新rootを読み直す。
これにより別entrypoint/featureのsliceを古いsnapshotで上書きしない。
Analyzerの3sliceは1回のroot patchでまとめて保存する。themeはAnalyzer writerから除外し、App Shellの`appearance` writerだけが更新する。

## Condition import/export and share

既存の「条件と配列を書き出す」Condition Bundleはdomain dataの交換形式として維持する。
AppState全体のバックアップ形式にはしない。

Condition Bundleに含めるもの:

- conditions
- user layouts
- geometry shapes
- romaji settings
- condition presets

含めないもの:

- Workspace placement / z-order
- Tester practice environment
- Analyzer表示設定
- Playback UI preference

したがってCondition Bundle importはAppState rootを置換せず、conditionsと関連domain dataだけを更新する。
現時点のリポジトリにはURL等によるshare pipelineは存在しないため、Phase 8でAppState share形式は追加しない。
将来shareを実装する場合も、共有対象を明示した別schemaを設け、local AppStateをそのまま公開形式にしない。

## Dormant Workspace GC

配列切替の A → B → A で位置を復元する必要があるため、
`input.layer:*` のdynamic layer cardだけはdefinitionsから外れてもdormant stateを保持する。

一方で:

- definitionsに無い静的panel ID（例: 廃止済み `input.details`）はpruneする
- dormant `input.layer:*` は128件を上限とする
- 追加のLRU timestampはschemaへ持ち込まず、first-seen順で古いものから落とす

これで動的panel復元を維持しつつ、保存stateが無制限に増えるのを防ぐ。


## Analyzer Workspace

Analyzer NextはTesterのfloating Workspaceとは別sliceの `analyzerWorkspace` を使う。
保存するのはversionedなView instanceとrenderer-independentなsplit/tab treeで、Dockview等のlibrary serialized objectをAppState schemaとして直接固定しない。
AnalysisSession（text / selected layouts / conditions / focus）はこのsliceへ混ぜない。
