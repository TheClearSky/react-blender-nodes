# Graph-state fixtures

Every fixture in this folder was **built through the real editor UI and exported
through the real Import/Export menu** — never hand-authored. This keeps fixtures
faithful to what the serializers actually produce (handle ids, type snapshots,
zones, group subtrees, recording step shapes).

## Naming convention

```
<topology>-<purpose>-state.json       (exported via  right-click → Import/Export → Export State)
<topology>-<purpose>-recording.json   (exported via  right-click → Import/Export → Export Recording)
```

## Current fixtures

| Fixture                                                | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adder-state-with-inner-noop-loop{,-instant}.json`     | Adder circuit with an inner loop + its instant-mode recording. Loaded by `RunnerStoryView` (`WithRunner` + its preview modes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `preview-demo-and-gate-{state,recording}.json`         | AND(true,true) built live in the editor; the `RunnerFixtureDemos` `and-gate-real-graph` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `group-two-instances-not-chain-{state,recording}.json` | TWO instances of one group type (subtree = NOT gate) chained `BitInput → G1 → G2 → BitOutput`. State carries the full `typeOfNodes` incl. the group type + subtree — load it FULL-STATE (`{...state, dataTypes, typeOfNodes, nodes, edges}`), not nodes/edges-only. The `RunnerFixtureDemos` `group-two-instances` entry; the regression fixture for group execution-path/instance tracking.                                                                                                                                                                                                                         |
| `sdf-shape-studio-state.json`                          | The SDF Shape Studio `Showcase` graph: Heart → Translate → Radial Repeat, smooth-unioned onto a Circle, split two ways — Render, and Less Than → Measure Mask (8 nodes / 7 edges, slider values tuned via the real arrow buttons: Size 0.7·0.9⁴, X 0.4·1.1³). STATE ONLY — sdf/mask values are closures, so recordings lose them by design; the Showcase runs ONCE after load so it opens rendered. Loaded through the REAL import pipeline (`importGraphState` with the story module's `dataTypes`/`typeOfNodes`) so handle `complexSchema`s rehydrate to the module singletons (export strips `z.custom` schemas). |

## Provenance caveat — the two RECORDING fixtures (2026-08-25)

`adder-state-with-inner-noop-loop-instant.json` and
`group-two-instances-not-chain-recording.json` were **migrated in place** to the
identity-key format rather than re-recorded: every structure-record map key
became `structureRecordKey(ownerInstancePath, structureId)` and every record
gained `ownerInstancePath`, derived from each record's own step evidence and
verified against it. The rest of each file is still at its original vintage, so
two artifacts remain that the CURRENT pipeline would not produce:

- `adder-…-instant.json` carried `compilationDuration` where the serializer
  emits `warmupDuration`; the field has been renamed so the value survives
  import (it was being silently discarded as `warmupDuration ?? 0`).
- `group-two-instances-…-recording.json`'s inner-record ids end `-scope-1` /
  `-scope-3`. Those are the OLD `-scope-{startStepIndex}` encoding; `endScope`
  now builds the suffix from the scope token's serial, which for two scopes in
  one run can only be 1 and 2.

Neither affects what the fixtures are loaded for, and the identity keys in both
are correct. Re-record them through the UI flow below when convenient, and this
section goes away.

## Producing a new fixture

1. Build the graph in a running story (`EmptyRunnerPlayground` is the usual
   canvas) using only UI actions — context-menu adds, mouse-drag connections,
   inline inputs. Run it if a recording is needed.
2. Right-click the canvas → `Import/Export` → `Export State` (and
   `Export Recording`).
3. Save the downloads here under the naming convention and import them in
   `FullGraph.stories.tsx` as static JSON modules (`REPLACE_STATE` for states,
   `importExecutionRecord` for recordings).

For agent/e2e automation, the same flow exists as `exportGraphStateViaUi(page)`
(`e2e/actions/importExport/importExport.actions.ts`); in Playwright-MCP use
`await download.path()` and read the temp file (no `Buffer` in that context).
