# Workspace architecture boundary

Issue #413 の Workspace / Panel 基盤は、UI framework と状態モデルを分離して段階移行する。

## Pure state layer

`src/workspace/` は panel identity、registry、versioned state、reducer、viewport clamp の authority とする。

この層は次へ依存しない。

- React / React DOM
- DOM API
- browser storage API
- Input Converter / Analyzer 固有domain component

UI側は原則 `src/workspace/index.ts` の公開APIを使う。

## Persistence contract

`src/persistence/` は保存先そのものではなく、storage interface と version decode contract を提供する。

- schema側から `localStorage` を直接触らない
- Workspace state と feature preference は別sliceとして開始してよい
- legacy `UiStateV1` へ直接fieldを追加してwriterを競合させない
- 将来の統合はversioned migrationで行う

browser localStorage adapter、保存key、write coalescing、WorkspaceStateV1 validatorは Phase 5 で追加する。

## React layer

Phase 1以降の `WorkspaceManager` / `WorkspacePanel` はReact側に置き、pure state APIを操作する。
Panel contentはdocked / floatingの配置を知らない。

Portal、pointer gesture、animation、focus管理などDOM固有の責務はこのReact layerに閉じ込める。

## Core boundary

距離モデル・入力semantic等のcore/domain codeはWorkspace、React、DOM、persistenceへ依存しない。
Workspace導入はUI構造の変更であり、評価結果や入力semanticを変更しない。
