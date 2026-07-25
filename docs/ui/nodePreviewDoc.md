# Node-Type Preview Components (`nodePreviews`)

## Overview

A **node preview** is an OPTIONAL, consumer-provided React component registered
**per node type** that renders on top of the node and receives that node's
current runner values. It is the Blender node-preview analog — a thumbnail, a
computed-result readout, a mini chart — living on the node itself. Previews are
purely a canvas/UI concern: they have **zero** effect on execution, compilation,
codegen, or connection validation. They only READ recorded values.

Previews are registered through the `nodePreviews` prop on `FullGraph`
(`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraphProps`), which
mirrors the per-data-type `inputComponents` input-editor registry. Like
`functionImplementations` and `inputComponents`, it is a map passed as a prop
and kept OUT of serialized state. Unlike `functionImplementations` (which
excludes built-in node types), it may target any node type id — including nodes
INSIDE group subtrees, whose previews are instance-aware (see
[Group instances](#group-instances-instance-aware-previews)).

Define the registry at **module level** (or memoize it). A fresh
`nodePreviews={{ … }}` object literal every render gives each entry a new
component identity, which REMOUNTS the preview (state loss + error-boundary
reset). `satisfies NodePreviewRegistry<YourNodeTypeId>` keeps each entry's
precise component type while checking the keys against your node-type union.

```tsx
// module scope — stable identity across renders
const nodePreviews = {
  adder: ({ nodeName, visualState, live }: NodePreviewProps) => (
    <div>
      {nodeName} · {visualState}
      {' → '}
      {String(live?.outputValues.get('Sum')?.value ?? '—')}
    </div>
  ),
} satisfies NodePreviewRegistry<MyNodeTypeId>;

function Editor() {
  return (
    <FullGraph
      state={state}
      dispatch={dispatch}
      functionImplementations={impls}
      nodePreviews={nodePreviews}
    />
  );
}
```

## The registry

The registry types live in
`src/components/organisms/FullGraph/NodePreviewRegistryContext.ts`:

- `NodePreviewRegistry<NodeTypeUniqueId>`
  (`src/components/organisms/FullGraph/NodePreviewRegistryContext.ts` ›
  `NodePreviewRegistry`) —
  `Partial<Record<NodeTypeUniqueId, ComponentType<NodePreviewProps>>>`, the
  shape of the `nodePreviews` prop.
- `NodePreviewProps`
  (`src/components/organisms/FullGraph/NodePreviewRegistryContext.ts` ›
  `NodePreviewProps`) — the props each registered component receives (see
  below).
- `NodePreviewRegistryContext` + `useNodePreviewRegistry`
  (`src/components/organisms/FullGraph/NodePreviewRegistryContext.ts` ›
  `useNodePreviewRegistry`) — the context the prop is provided through and the
  hook internal components read it with. `FullGraph` wraps its whole subtree in
  the provider (regardless of `functionImplementations`), so the panel + eye
  toggle appear wherever a preview is registered.

## `NodePreviewProps`

| Prop          | Type                           | Description                                                                                                                     |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `nodeId`      | `string`                       | Instance id of the node this preview renders for.                                                                               |
| `nodeTypeId`  | `string`                       | The node's type id (the registry key). Widened to `string` (mirrors `InputComponentProps`).                                     |
| `nodeName`    | `string`                       | The node's type display name — available even before the node runs.                                                             |
| `customName`  | `string \| undefined`          | The instance's user custom name, if any (`Custom : Type` labeling).                                                             |
| `visualState` | `NodeVisualState \| undefined` | LIVE per-node overlay status (`idle`/`running`/`completed`/`errored`/`skipped`/`warning`). `undefined` when there is no runner. |
| `live`        | `ExecutionStepRecord \| null`  | The node's most-recently-computed step, or `null` if it hasn't run.                                                             |
| `atStep`      | `ExecutionStepRecord \| null`  | The node's step at/≤ the current timeline position (the scrub/replay head), or `null`.                                          |

`live` and `atStep` are the already-public `ExecutionStepRecord`
(`src/utils/nodeRunner/types.ts` › `ExecutionStepRecord`): read `inputValues` /
`outputValues` (keyed by handle NAME), `status`, `error`, `stepIndex`,
`loopIteration`, plus timing and group/loop context. The recorded value types
(`RecordedInputHandleValue`, `RecordedOutputHandleValue`,
`RecordedInputConnection`, `ExecutionStepRecordStatus`, `GraphError`,
`GraphErrorPathEntry`) and `formatGraphError` are re-exported from the public
package so consumers can annotate their preview code:

```ts
import {
  formatGraphError,
  type RecordedOutputHandleValue,
  type GraphError,
} from '@theclearsky/react-blender-nodes';
```

### `live` vs `atStep`

- **`live`** is the node's LATEST computed occurrence. During step-by-step runs
  it streams as steps complete; for an instant run it appears at completion.
- **`atStep`** reflects the CURRENT timeline position (the scrub/replay head,
  `currentStepIndex`), so it follows the scrubber. It is `null` until the node
  has run by that point.

Both are derived in a single pass over the flat `record.steps` (see below).

### Two status axes

`visualState` and `ExecutionStepRecord.status` are DIFFERENT axes:

- `visualState` is the LIVE 6-valued node overlay state (the same one
  `NodeStatusIndicator` paints) — includes `idle`/`running`/`warning`.
- `snapshot.status` (`ExecutionStepRecordStatus`) is the RECORDED 3-valued
  terminal outcome of that step: `completed` / `errored` / `skipped`.

Use `visualState` for "is this node running / idle now"; use `live.status` /
`atStep.status` for "did that recorded step complete, error, or get skipped".

### Which fields are stable for previews

Read these `ExecutionStepRecord` fields freely — they are part of the preview
contract: `inputValues`, `outputValues`, `status`, `error`, `stepIndex`,
`nodeId`, `nodeTypeId`, `nodeTypeName`, `customName`, `loopIteration`,
`instancePath` (PROVISIONAL while execution-path tracking stabilizes), and the
timing fields (`startTime` / `endTime` / `duration`).

The rest are recorder-internal bookkeeping OUTSIDE the preview stability promise
— avoid depending on them: `concurrencyLevel`, `pauseAdjustment`,
`estimatedTiming`, the loop/switch phase vocabulary (`loopPhase` / `switchPhase`
/ `inputSource`), `loopStructureId` / `switchStructureId`, and the `@deprecated`
`parentLoopStructureId` / `parentLoopIteration` pair. Group context
(`groupNodeId` / `groupDepth`) is present, but its meaning for multi-instance
groups is provisional (see [Caveats](#caveats)).

## Sizing & typography

Nodes render text at the canvas scale — `text-[27px] leading-[27px] font-main` —
so a preview styled at "normal web" sizes (11–14px) is illegible on the canvas.
The panel therefore applies a node-scale default (`text-[27px]`) that your
component inherits unless it sets its own font size, plus `max-h-[320px]` +
`overflow-auto` and `nodrag nopan nowheel` containment (the last is deliberately
unconditional, so scrolling inside the panel never pans the canvas). The panel
is width-matched to the node (`w-0 min-w-full`) and renders ON TOP of the node,
OUTSIDE the runner status border; oversized content scrolls rather than widening
the node. Placement is fixed to "top" today (bottom/left/right are future
options). Set explicit pixel sizes in your component when you want something
other than the node scale.

## The eye toggle (persisted, undoable)

When a preview is registered for a node's type, `ConfigurableNode`
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode`) adds an eye header action that collapses/expands the panel
per node instance. The collapsed state is a `previewCollapsed?: boolean` field
on `node.data` (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx`
› `ConfigurableNodeProps`; absent = expanded), so it rides export/import for
free (like `customName`) AND is undoable.

Toggling dispatches the `UPDATE_NODE_PREVIEW_COLLAPSED` action, whose plan is
`UpdateNodePreviewCollapsedPlan`
(`src/utils/nodeStateManagement/planApply/types.ts` ›
`UpdateNodePreviewCollapsedPlan`). It clones `UPDATE_NODE_CUSTOM_NAME`: a pure,
scope-aware validator (with a `MISSING_ENDPOINT` guard and a normalized-boolean
NOOP so `undefined ≡ false`), and a single-field write in `applyPlan` that
stores `undefined` for the expanded state. It is undoable (a deliberate product
decision; absent from `NON_UNDOABLE_PLAN_KINDS`).

## Value derivation

`RunnerOverlay` (`src/components/organisms/FullGraph/RunnerOverlay.tsx` ›
`RunnerOverlay`) derives a per-node `{ live, atStep }` map and places it on
`RunnerContext` (`src/components/organisms/FullGraph/FullGraphState.ts` ›
`RunnerContextValue`, the optional `nodePreviewValues` field). The derivation is
gated on a non-empty registry, so idle / no-preview graphs pay zero cost and the
context value keeps a stable identity.

The map is built by `computeNodePreviewValues`
(`src/utils/nodeRunner/computeNodePreviewValues.ts` ›
`computeNodePreviewValues`) in a SINGLE O(n) pass over `record.steps`.
`record.steps` is already the complete, flat, globally-monotonic list of EVERY
step at every nesting depth (the recorder appends all steps — top-level, loop
body, switch branch, group inner — to one array with a global `stepIndex`;
nested records hold duplicate references), so no recursion is needed. `live` =
the max-`stepIndex` step per node; `atStep` = the
max-`stepIndex`-≤-`currentStepIndex` step per node.

## Data flow

```
consumer <FullGraph nodePreviews={{ type: Preview }} functionImplementations={…} />
   │
   ├─ NodePreviewRegistryContext.Provider (wraps the graph, incl. RunnerOverlay)
   │
   └─ RunnerOverlay (mounts only when functionImplementations is provided)
        useNodePreviewRegistry → hasNodePreviews? ── no ⇒ stable EMPTY map (R1) ──┐
        computeNodePreviewValues(executionRecord, currentStepIndex)  (1 pass)     │
        RunnerContext.Provider value={{ …, nodePreviewValues }} ◄─────────────────┘
              │
              ▼  (per node)
        ConfigurableNode → NodePreviewPanel
        (src/components/organisms/ConfigurableNode/SupportingSubcomponents/NodePreviewPanel.tsx
         › NodePreviewPanel)
          registry?.[nodeTypeId] → Component; reads nodePreviewValues.get(nodeId)
          renders <ErrorBoundary><Component nodeId nodeTypeId nodeName customName
                                            visualState live atStep /></ErrorBoundary>
```

The panel is its OWN nested `ErrorBoundary` (the whole node already has one at
the ReactFlow wrapper) so a throwing consumer preview is contained to the panel;
its `resetKey` tracks the rendered step indices, so it auto-recovers when new
values arrive. The wrapper is `nodrag nopan nowheel` with
`max-h`/`overflow-auto` containment so an arbitrary consumer component can't
blow out the node layout, and a `node.previewPanel` theme slot is merged last.

## Tiers and degradation

The panel renders nothing unless a preview is registered for the type, a
`nodeId` is present, and it is not collapsed — so it is safe to mount
unconditionally and degrades cleanly across three tiers via optional-chained
context reads:

1. **Standalone `<ConfigurableNode>`** (no providers) → no registry, renders
   nothing.
2. **In-graph, no runner** (no `functionImplementations`) → registry present,
   but `RunnerContext` is absent, so `live`/`atStep` are `null` (the consumer
   renders its own empty state).
3. **In-graph, with runner** → `live`/`atStep` populate from the record.

## Group instances (instance-aware previews)

A group type's subtree nodes share ids across instances, and every recorded step
carries an `instancePath` (`src/utils/nodeRunner/types.ts` ›
`ExecutionStepRecord`) — the chain of group-instance node ids down to the scope
that executed it. When the viewport is standing INSIDE a group instance (opened
via the node's open button, so the `openedNodeGroupStack` carries a `nodeId`
chain), `RunnerOverlay` filters the preview values and visual states to steps
whose `instancePath` equals the open chain
(`src/utils/nodeRunner/computeNodePreviewValues.ts` ›
`computeNodePreviewValues`). Two instances of one group type therefore show
their OWN values on the same template node. Two deliberate edges:

- **Template opens aggregate.** Opening a group via the top-left selector edits
  the TYPE (no instance identity) — previews stay unfiltered there
  (last-instance-wins), by design.
- **Legacy recordings.** Recordings exported before `instancePath` existed have
  path-less steps, so inside-an-instance views filter to EMPTY previews.
  Re-running (or re-exporting after a run) refreshes them.

## Caveats

- **Structural nodes.** Group nodes record empty input/output maps; a node in an
  untaken switch branch never runs (its `live`/`atStep` are `null`). Loop and
  switch triplet nodes DO record real values.
- **Completeness is not `visualState`.** A recorded step's value maps hold its
  COMPLETE values, and `visualState` is not a completeness signal: at a
  pause/scrub head the current node reads `running` even though its recorded
  step is already complete, so gating a preview on `visualState !== 'running'`
  would WRONGLY hide valid values. To guard against a genuinely empty snapshot,
  test the record itself (`outputValues.size === 0`), not the overlay state.
- **Handle-name keying / loaded records.** `inputValues`/`outputValues` are
  keyed by handle NAME; after a save/load round-trip, values are the
  `safeSerializeValue`-sanitized (JSON-plain) forms, not the original objects.
- **Visibility is per node** — there is no editor-wide "hide all previews"
  control.

## Relationships with other features

- **Flagship demo.** The Storybook section
  `Advanced Graph Examples → SDF Shape Studio`
  (`src/advancedGraphExamples/SdfShapeStudio.stories.tsx`; definitions in
  `src/advancedGraphExamples/sdfStudioDefinitions.ts`) is the feature's
  showcase: 31 SDF node types (plus the standard structural set) whose previews
  render 2D signed-distance fields (Canvas2D debug view), binary masks, pixel
  measurements, and a palette-filled final render — all reading closure values
  straight off the execution record, strictly at the timeline position
  (`atStep`-only: scrubbed before a node's first run they show "Not reached at
  this step"). The Playground has deliberately NO auto-run; the Showcase runs
  once after its fixture pre-loads.
- **[ConfigurableNode](configurableNodeDoc.md)** — hosts the `NodePreviewPanel`
  on top of the node (outside the status border) and adds the eye header action.
- **[FullGraph](fullGraphDoc.md)** — declares the `nodePreviews` prop and
  provides the registry context + `RunnerContext`.
- **[Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)** and
  **[Execution Recording](../runner/executionRecordingDoc.md)** — the source of
  the `ExecutionRecord` / `ExecutionStepRecord` values previews read.
- **[NodeStatusIndicator](nodeStatusIndicatorDoc.md)** — the sibling that
  consumes the same `RunnerContext` for the per-node `visualState` overlay.

## Design notes (long-term)

These record the intended evolution seams (no code today):

- **Incremental derivation must land as a pair.** Replacing the O(n)-per-render
  `computeNodePreviewValues` with an O(1)/step incremental derivation only helps
  if it ships WITH memoized preview components + identity-preserving entries —
  otherwise the whole node subtree still re-renders and nothing measurably
  improves.
- **A global "hide all previews" toggle** rides a `nodePreviewsVisible?`
  FullGraph prop on the graph context, NOT the registry — the registry context
  value type stays `NodePreviewRegistry | undefined` and is never wrapped.
- **Per-instance overrides** belong in a resolver-valued registry or a
  serializable `data.previewVariant` field — never a React component stored on
  `node.data`.
- **Group-subtree meaning (SHIPPED).** Execution-path / instance tracking
  landed: each step's `instancePath` chain disambiguates instances, and
  `live`/`atStep` for a subtree node mean "of the OPEN instance" when standing
  inside one (see [Group instances](#group-instances-instance-aware-previews)).
- **Context-aware leaves** (the panel reading `RunnerContext` itself, split into
  an outer registry-gate + an inner context subscriber) are the canonical
  plumbing; the endgame is leaf-only subscriptions so registry-less nodes never
  subscribe.
