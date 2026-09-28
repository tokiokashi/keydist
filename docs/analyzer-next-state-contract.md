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
| AnalysisSnapshot | generateTrace + structural analysis + metrics per selected layout | no | keyed by resolved analysis inputs |
| ViewConfig | projection / filtering / ordering / visualization choices | host-owned | view derivation/render only |
| Ephemeral | hover / selection / playback cursor | no | local render only |
| App preference | theme | app-level appearance | visual only |
| WorkspaceLayout | pane/split/tab/size/visibility | analyzerWorkspace | placement/render scheduling only |

### Classification rule

Session conditions are model parameters. Changing distance-model conditions changes the meaning of snapshot metrics and therefore invalidates the affected snapshot. Timing-model conditions are also Session-owned, but invalidate only timing derivations.

ViewConfig selects or presents already-defined model output. A ViewConfig may change displayed numbers without becoming an AnalysisSession condition. Bigram Flow source, comparison subset/sort, heatmap presentation and playback display controls are ViewConfig.

Focus is shared Session state but is not a calculation key.


## Field-level classification

This table is the implementation authority for #505 §1.4 / §1.5. New code should not need the Issue text to decide ownership.

### Session target / focus

| Legacy field | New owner | Notes |
| --- | --- | --- |
| `ui.input.mode` | Session target | Mode changes are atomic with the selected set / focus via `setTarget`. |
| `ui.input.selectedSampleByMode` / `customText` | Session target text | Text changes invalidate distance snapshots. |
| `ui.layouts.selectedByMode` | Session target | Only selected layouts are evaluated. |
| `ui.layouts.detailByMode` | Session focus | Focus is normalized into the selected set and is not a calculation key. |
| `ui.input.geometry` | removed | Migration fallback only; conditions are authoritative. |

### Distance-model Session fields

| Field | Scope |
| --- | --- |
| `geometry` | default + per-layout sparse override |
| `windowSize` | default + per-layout sparse override |
| `sfbHomeCost` | default + per-layout sparse override |
| `preferOppositeThumb` | default + per-layout sparse override |
| `chain` | default + per-layout sparse override |
| `arpeggioPolicy` | default + per-layout sparse override |
| `triggerRealization` | default + per-layout sparse override |
| `actionRealization` | default + per-layout sparse override |
| `romajiRule` | per-layout sparse override; effective only for a romaji-capable layout in the current mode |
| geometry shape / assignment | Session distance input resolved through the Domain catalog |

Per-layout overrides are field-level. An empty legacy per-layout object has no semantic effect and is discarded during migration.

### Timing-model Session fields

| Field | Scope |
| --- | --- |
| `playbackRateAverage` | global-only |
| `playbackRateWindow` | global-only |
| `playbackRateHalfLifeSeconds` | global-only |
| `stepsPerSecond` | default + per-layout sparse override |
| `speedMultiplier` | default + per-layout sparse override |
| `sameFingerDelay` | default + per-layout sparse override |
| `allFingerMovementDelay` | default + per-layout sparse override |
| `useCalibration` | default + per-layout sparse override |

The three playback-rate averaging fields are intentionally absent from the per-layout override type/API.

### ViewConfig

| View | Fields |
| --- | --- |
| Bigram Flow | `source`, `selectedFingers`, `lineScale`, `layerOrder`, `hoverScale`, `movementScaleMode`, `polarBandwidth`, `polarGain` |
| Heatmap | `view`, `colorScale`, `showLayerDetails`, `keyPatternGuide`, `activeLayerId`, `panels.layerStats`, `panels.modifierList`, `panels.comboTable` |
| Comparison | `baselineLayoutId`, `chartColumn`, `sort` |
| Matrices | per-matrix sorts |
| Sensitivity | `scale` |
| Playback | `showFingers`, `showRomajiPlan`, `showPlanKeys`, `showTrail`, `trailTau`, `showOrderLabels`, `showSameFingerMotion`, `keyFeedbackStyle`, `fingerPreparationSeconds`, `showChain`, `showArpeggio`, rate-chart chain/arpeggio visibility, `scale`, playback/rate-chart open state |

Playback timing parameters are never ViewConfig. Saved per-layout display settings from the legacy `perLayout[id].playback` are discarded at cutover.

### Shell / Ephemeral / Domain catalog

- Analyzer shell preference: text/add-layout panel openness.
- Ephemeral: Bigram hover, Heatmap key/combo selection, Playback cursor/running/elapsed/settings-dialog openness.
- Domain catalog: user layouts, geometry shapes, romaji rules/assignments, condition presets and playback calibration. Long-lived browser hosts keep the AnalysisSession stable and replace the catalog source explicitly when those independent storages change.
- Theme is app-level appearance and never Analyzer state.

### Command scope

Session commands that mutate a model condition always identify either the default scope or one layout id. Mode changes must use one atomic target command carrying `mode + selectedLayoutIds + focusLayoutId`; a mode-only state transition is not valid.

## View invariants

- Workspace layout never owns analysis conditions.
- View components never write storage directly.
- View components do not import Router or Dockview.
- View components do not call `resolveConditions` or `generateTrace`.
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

Unknown/removed View types or invalid persisted bindings are rejected during decode. View-specific codecs receive the saved config version, own migration from older versions, and reject future versions at the instance decoder boundary.

## Route ownership

Standalone routes and Workspace use the same View component. Route search params may encode View type, binding and compact bookmark-worthy ViewConfig only.

AnalysisSession is never URL authority. A pinned route targeting an unselected layout shows the same placeholder as Workspace and may offer an explicit Session command to add it.

Shared conditions use a separate versioned Condition Bundle in `#share=...`, imported once after confirmation and then removed from the URL.

## Dockview boundary

Dockview is a renderer/host dependency only. Its serialized layout is adapted at the Workspace boundary and is not the analysis-domain schema. View instances and ViewConfig remain separately versioned.

As of 2026-09-26, the selected spike target is `dockview-react@8.3.1` (React 19 compatible). The integration must verify SSR/prerender import safety, resize behavior, tab lifecycle and serialization before the Workspace schema is finalized.
