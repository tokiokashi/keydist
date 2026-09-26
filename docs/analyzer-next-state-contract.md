# Analyzer Next state / view contract

Issue #505 の新Analyzerで使うstate ownershipとView bindingの契約。旧Analyzerとの互換層ではなく、新route / Workspaceの共通前提として扱う。

## Ownership

| Layer | Authority | Persist | Recompute |
| --- | --- | --- | --- |
| Domain catalog | user layouts / geometry shapes / romaji rules / presets / calibration | existing independent storage | dependent snapshot / derivation |
| AnalysisSession target | mode / text / selected layouts | AppState analyzer session | affected snapshots |
| AnalysisSession distance conditions | distance model defaults + per-layout field overrides | AppState conditions | affected snapshots |
| AnalysisSession timing conditions | playback timing model inputs | Analyzer session timing slice | timing derivation only |
| AnalysisSession focus | current detail layout | AppState analyzer session | no snapshot recompute |
| AnalysisSnapshot | evaluate + structural analysis + metrics per selected layout | no | keyed by resolved analysis inputs |
| ViewConfig | projection / filtering / ordering / visualization choices | host-owned | view derivation/render only |
| Ephemeral | hover / selection / playback cursor | no | local render only |
| App preference | theme | app-level appearance | visual only |
| WorkspaceLayout | pane/split/tab/size/visibility | analyzerWorkspace | placement/render scheduling only |

### Classification rule

Session conditions are model parameters. Changing distance-model conditions changes the meaning of snapshot metrics and therefore invalidates the affected snapshot. Timing-model conditions are also Session-owned, but invalidate only timing derivations.

ViewConfig selects or presents already-defined model output. A ViewConfig may change displayed numbers without becoming an AnalysisSession condition. Bigram Flow source, comparison subset/sort, heatmap presentation and playback display controls are ViewConfig.

Focus is shared Session state but is not a calculation key.

## View invariants

- Workspace layout never owns analysis conditions.
- View components never write storage directly.
- View components do not import Router or Dockview.
- View components do not call `resolveConditions` or `evaluate`.
- Storage / route / Dockview integration belongs to hosts.
- ViewConfig changes are returned through `onConfigChange`.
- Session changes are commands with explicit default/per-layout scope.
- A pane that presents a number must carry the resolved condition delta and the relevant ViewConfig projection in shared pane chrome.

## Binding

A View type has exactly one cardinality.

- `single`: default binding is `focused-layout`; a pane may pin `{ mode, id }`.
- `set`: binding is `session` and sees the selected layout set.

Binding never expands the selected layout set. A pinned layout that is unavailable resolves to a placeholder reason instead of silently changing the Session.

Pinned bindings include `mode` because the same layout id can resolve differently in English and Japanese modes.

Unavailable reasons:

- `empty-selection`: no selected layout exists.
- `not-selected`: the pinned layout exists but is not selected.
- `other-mode`: the pin belongs to another mode.
- `deleted`: the pinned layout no longer exists in that mode.

Focus follows the current selected set. If its previous id is removed, the Session normalizes focus to the first selected id. Pinned views never follow that fallback.

## Stable View types

- `bigram-flow`
- `heatmap`
- `finger-metrics`
- `matrices`
- `comparison`
- `sensitivity`
- `playback`

Instance ids are opaque and never encode the type or layout id. Binding is mutable instance data.

Unknown/removed View types or invalid persisted bindings are rejected during decode. View-specific codecs own config migration and fall back to their defaults.

## Route ownership

Standalone routes and Workspace use the same View component. Route search params may encode View type, binding and compact bookmark-worthy ViewConfig only.

AnalysisSession is never URL authority. A pinned route targeting an unselected layout shows the same placeholder as Workspace and may offer an explicit Session command to add it.

Shared conditions use a separate versioned Condition Bundle in `#share=...`, imported once after confirmation and then removed from the URL.

## Dockview boundary

Dockview is a renderer/host dependency only. Its serialized layout is adapted at the Workspace boundary and is not the analysis-domain schema. View instances and ViewConfig remain separately versioned.

As of 2026-09-26, the selected spike target is `dockview-react@8.3.1` (React 19 compatible). The integration must verify SSR/prerender import safety, resize behavior, tab lifecycle and serialization before the Workspace schema is finalized.
