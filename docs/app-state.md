# AppStateV2 persistence policy

UI/runtime preferenceの永続化authorityを
`keydist:app-state` へ統合する。

## Root schema

`AppStateV2` は次のsliceを持つ。

- `workspace`: Testerの`WorkspaceStateV1`
- `inputConverter`: `InputConverterPreferencesV2`
- `appearance`: App-level appearance preference（現在は `theme: light | dark | system`）
- `shell`: シェルの見た目の状態（サイドバーの固定と、畳んだ見出しのまとまり）

文書の `version` は `APP_STATE_VERSION`（現在は2）と一致する時だけ読む。一致しない文書と壊れたJSONは、sliceが無い空の文書として扱う。

読み込みはsliceごとに行い、スキーマに無い項目は読まない。スキーマに無い項目が保存に残っていても、読み込みは失敗せず、別のsliceを保存する時もその項目は書き換えずに残る（保存の内容を削除する処理は持たない）。

## Migration sources and cleanup

次のkeyは、read-once migration sourceとしてのみ扱う。どちらもTesterの保存で、
対応するsliceが無い時だけ読む。

| Legacy key | Destination |
| --- | --- |
| `keydist:workspace-state` | `workspace` |
| `keydist:input-converter-preferences` | `inputConverter` |

移行は「AppStateへ正常に保存 → 旧keyをremove」の順に行う。
AppState側にsliceが既にある場合も、残存する旧keyはcleanupする。

テーマの初期値（`appearance.theme`）は `keydist:app-state` の `appearance` だけから読む。
保存が無い時と値が不正な時は `system` になる。他のkeyは移行元にしない。
`<head>` のscriptも、client bundleより先に同じ項目だけを読んで `data-theme` を確定する。

次のstorageはUI AppStateではなく独立したdomain/user assetなので吸収しない。

- `keydist:input-key-bindings`（および旧 `keydist:input-thumb-key-bindings`）
- `keydist:user-layouts`・`keydist:user-romaji-rules`・`keydist:finger-assignments`（版付きのcodecで読み書きする自作の資産）
- `keydist:setup-library`・`keydist:presets`・`keydist:workspaces`・`keydist:text-library`
- `keydist:single-target-selection`・`keydist:multi-target-selection`・`keydist:standalone-text-selection`・`keydist:standalone-analyzer-options`
- `keydist:personal-speed`（個人速度。版付きのcodecで読み書きする）

上に挙げていないkeyは、このアプリが読まない。

## Writer authority

Workspace / Tester / Shellのpersistent writerはすべて
`src/app/state/app-state-storage.ts` を通す。

各featureはslice単位でpatchし、保存直前に最新rootを読み直す。
これにより別entrypoint/featureのsliceを古いsnapshotで上書きしない。
themeは App Shell の`appearance` writerだけが更新する。

## Share

現時点のリポジトリにはAppState全体の書き出しやshare pipelineは存在しないため、AppState share形式は追加しない。
将来shareを実装する場合も、共有対象を明示した別schemaを設け、local AppStateをそのまま公開形式にしない。

## Dormant Workspace GC

配列切替の A → B → A で位置を復元する必要があるため、
`input.layer:*` のdynamic layer cardだけはdefinitionsから外れてもdormant stateを保持する。

一方で:

- definitionsに無い静的panel ID（例: 廃止済み `input.details`）はpruneする
- dormant `input.layer:*` は128件を上限とする
- 追加のLRU timestampはschemaへ持ち込まず、first-seen順で古いものから落とす

これで動的panel復元を維持しつつ、保存stateが無制限に増えるのを防ぐ。
