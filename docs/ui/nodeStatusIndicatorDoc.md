# NodeStatusIndicator

## Overview

`NodeStatusIndicator` is an atom component that renders a visual overlay on top
of a node to indicate its execution state during a runner session. It wraps the
node's content and applies a combination of CSS `outline`, `box-shadow`, icon
badges, and opacity layers to communicate one of six visual states without
affecting the node's layout or size.

The component is intentionally layout-neutral: it uses CSS `outline` (not
`border`) so the indicator never shifts the node's dimensions, and overlay
layers use `pointer-events-none` so they don't interfere with node interactions.

Key capabilities:

- Six visual states (`idle`, `running`, `completed`, `errored`, `skipped`,
  `warning`) driven by a single `visualState` prop
- Layout-neutral `outline`-based borders and `box-shadow` glows
- Always-mounted outline overlay so transitions stay smooth when scrubbing back
  to `idle`
- Top-right error/warning badge icons with hover tooltips
- A dimming layer for the `skipped` state

**Source:** `src/components/atoms/NodeStatusIndicator/NodeStatusIndicator.tsx` ›
`NodeStatusIndicator`

## Props

| Prop          | Type                        | Required | Description                                                                                                              |
| ------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `visualState` | `NodeVisualState`           | Yes      | Current visual state of the node (`'idle'` \| `'running'` \| `'completed'` \| `'errored'` \| `'skipped'` \| `'warning'`) |
| `errors`      | `ReadonlyArray<GraphError>` | No       | Errors associated with this node. Shown in a hover tooltip when `visualState` is `'errored'`.                            |
| `warnings`    | `ReadonlyArray<string>`     | No       | Warning messages. Shown in a hover tooltip when `visualState` is `'warning'`.                                            |
| `children`    | `ReactNode`                 | Yes      | The node content to wrap.                                                                                                |

The props type is exported as `NodeStatusIndicatorProps`. `NodeVisualState` and
`GraphError` are imported from `@/utils/nodeRunner/types`. The `NodeVisualState`
union is backed by the exported `nodeVisualStates` tuple in that same file
(`['idle', 'running', 'completed', 'errored', 'skipped', 'warning']`).

## Visual States

Each state maps to a single set of Tailwind arbitrary classes on the always-
mounted outline overlay `<div>`. Colors reference CSS variables defined in
`src/index.css` (`--color-status-completed: #4caf50`,
`--color-status-errored: #ff4444`, `--color-status-warning: #ffa500`,
`--color-primary-blue: #4772b3`, `--color-secondary-dark-gray: #444444`).

```
+-------------+-------------------+---------------------+-------------------+-------------------+
| State       | Outline           | Shadow / Glow       | Icon              | Extra             |
+-------------+-------------------+---------------------+-------------------+-------------------+
| idle        | 5px solid         | shadow-none         | none              | none              |
|             | transparent       |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| running     | 5px dashed        | animated glow       | none              | @keyframes        |
|             | --color-primary-  | (running-glow, 2s   |                   | running-glow      |
|             | blue              |  ease-in-out inf.)  |                   | (defined in       |
|             |                   |                     |                   | index.css)        |
+-------------+-------------------+---------------------+-------------------+-------------------+
| completed   | 5px solid         | 0 0 12px            | none              | none              |
|             | --color-status-   | rgba(76,175,80,0.3) |                   |                   |
|             | completed (green) |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| errored     | 5px solid         | 0 0 12px            | AlertCircleIcon   | none              |
|             | --color-status-   | rgba(255,68,68,0.3) | (#FF4444, top-    |                   |
|             | errored (red)     |                     |  right corner)    |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| skipped     | 5px dashed        | none (opacity-50)   | none              | bg-black/30       |
|             | --color-secondary-|                     |                   | dimming layer     |
|             | dark-gray         |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| warning     | 5px solid         | 0 0 12px            | AlertTriangleIcon | none              |
|             | --color-status-   | rgba(255,165,0,0.3) | (#FFA500, top-    |                   |
|             | warning (orange)  |                     |  right corner)    |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
```

The outline overlay `<div>` is always mounted (even during `idle`) with
`transition-[outline-color,box-shadow,opacity] duration-200`. This ensures
smooth CSS transitions when scrubbing the timeline back to idle, rather than
abruptly mounting/unmounting.

The `running-glow` keyframe in `src/index.css` animates a breathing `box-shadow`
(transparent at 0%/100%, a blue glow `0 0 12px 2px rgba(71, 114, 179, 0.45)`
plus `0 0 4px 0 rgba(71, 114, 179, 0.25)` at 50%) — note the glow color is the
same blue as `--color-primary-blue` expressed as RGBA.

The `skipped` state uniquely applies two layers: the outline overlay gets a
dashed gray outline at `opacity-50`, and a separate `bg-black/30`
`pointer-events-none` overlay `<div>` is rendered to dim the node content.

## Context Integration

`NodeStatusIndicator` does **not** read context directly. It is a pure
presentational component that receives its state via props. The runner state is
plumbed in through two hops: `RunnerContext` →
`ConfigurableNodeReactFlowWrapper` → `ConfigurableNode`.

```
+-----------------------------------+       +-------------------------------+       +--------------------+
| RunnerContext                     |       | ConfigurableNodeReactFlow-    |       | ConfigurableNode   |
| (provided by RunnerOverlay)       |  read |   Wrapper                     | props |                    |
|                                   |------>| useContext(RunnerContext);    |------>| runnerVisualState   |
| nodeRunnerStates                  |       | nodeRunnerStates?.get(id)     |       | runnerErrors        |
|   ReadonlyMap<id, NodeRunnerState>|       |                               |       | runnerWarnings      |
| selectedStepRecord                |       | (Wrapper.tsx lines 100-101    |       |                    |
| edgeValuesAnimated                |       |  and 143-145)                 |       +--------------------+
+-----------------------------------+       +-------------------------------+                 |
                                                                                              | conditional wrap
                                                                                              v
                                                                                 +------------------------+
                                                                                 | NodeStatusIndicator    |
                                                                                 |                        |
                                                                                 | visualState            |
                                                                                 | errors                 |
                                                                                 | warnings               |
                                                                                 | children = nodeContent |
                                                                                 +------------------------+
```

**Step-by-step flow:**

1. `RunnerOverlay` (rendered by `FullGraph` only when `functionImplementations`
   is provided) calls `useNodeRunner`, then builds a combined
   `nodeRunnerStates: Map<string, NodeRunnerState>` and supplies it via
   `RunnerContext.Provider`
   (`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`).
2. `ConfigurableNodeReactFlowWrapper` (the ReactFlow node renderer) calls
   `useContext(RunnerContext)` and looks up `nodeRunnerStates?.get(id)` for its
   own node ID
   (`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
   › `ConfigurableNodeReactFlowWrapper`).
3. It passes `nodeRunnerState?.visualState`, `nodeRunnerState?.errors`, and
   `nodeRunnerState?.warnings` to `ConfigurableNode` as `runnerVisualState`,
   `runnerErrors`, and `runnerWarnings` props
   (`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
   › `ConfigurableNodeReactFlowWrapper`).
4. `ConfigurableNode` conditionally wraps its content in `<NodeStatusIndicator>`
   only when `runnerVisualState !== undefined`
   (`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
   `ConfigurableNode`). When the runner is inactive (no `RunnerContext`, so
   `nodeRunnerState` is `undefined`), no indicator is rendered.

> Note: `RunnerContext` is distinct from `FullGraphContext`. `FullGraphContext`
> carries only `{ allProps }` and is used elsewhere by `ConfigurableNode` (e.g.
> to read `enableDebugMode` and `typeOfNodes`). Runner visual state travels
> exclusively through `RunnerContext`.

The `NodeRunnerState` type is defined and exported from `FullGraphState.ts`
(`src/components/organisms/FullGraph/FullGraphState.ts` › `NodeRunnerState`):

```typescript
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

`RunnerContext` itself is also defined in `FullGraphState.ts` and its value type
carries three fields:

```typescript
type RunnerContextValue = {
  nodeRunnerStates: ReadonlyMap<string, NodeRunnerState>;
  selectedStepRecord: ExecutionStepRecord | null;
  edgeValuesAnimated: boolean;
};
```

### How `nodeRunnerStates` is assembled

`RunnerOverlay` merges three maps returned by `useNodeRunner` into the single
`nodeRunnerStates` map inside a `useMemo`
(`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay`). The
merge order and fallback `visualState` matter:

1. Seed entries from `runner.nodeVisualStates` (`{ visualState }`).
2. Merge `runner.nodeWarnings`. If the node already has an entry, spread
   `warnings` onto it; otherwise create one with `visualState: 'warning'`.
3. Merge `runner.nodeErrors`. If the node already has an entry, spread `errors`
   onto it; otherwise create one with `visualState: 'errored'`.

This is why a node can carry warnings/errors even before it appears in the
visual-state map, and why the indicator's `errors`/`warnings` props line up with
the `errored`/`warning` states it renders tooltips for.

## Tooltip Display (Errors, Warnings)

Error and warning icons appear as badge icons positioned
`absolute top-1 right-1` (top-right corner) of the node. Hovering over them
displays a floating tooltip with details.

### StatusTooltip (Internal Component)

`StatusTooltip` is a private component inside `NodeStatusIndicator.tsx`. It uses
the shared `useFloatingTooltip` hook (`src/hooks/useFloatingTooltip.ts` ›
`useFloatingTooltip`, an abstraction over `@floating-ui/react`) with these
settings:

| Setting     | Value                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Placement   | `'top'`                                                                                            |
| Offset      | `10px`                                                                                             |
| Hover delay | `{ open: 150, close: 0 }` (ms)                                                                     |
| Transition  | `150ms` (default fade + `translateY(4px)` from the hook)                                           |
| Arrow       | `FloatingArrow`, width `10`, height `5`, fill `#181818`, stroke `var(--color-secondary-dark-gray)` |

The tooltip body is styled `bg-[#181818]`, `border-secondary-dark-gray`,
`text-primary-white`, `whitespace-pre-wrap`, and `max-w-xs`. The floating layer
sets `zIndex: 50`; the reference icon container sets `z-10` and
`pointer-events-auto`.

### Error Tooltip Content

When `visualState === 'errored'` and `errors` is non-empty, each `GraphError` is
formatted via `formatGraphError()` (`src/utils/nodeRunner/errors.ts` ›
`formatGraphError`) into a multi-line string:

```
Error in "AND Gate" (node-123)
Message: Cannot read property "value" of undefined
Path: Boolean Constant → AND Gate
Duration: 0.30ms
```

Notes on the format produced by `formatGraphError`:

- The errored-node line and each `Path:` entry render `Custom : Type` when the
  node has a user `customName` (else just the type name); the `Path:` line joins
  the entries with `→` (a Unicode right arrow) and is omitted when `path` is
  empty.
- `Loop:` (`iteration X of Y`) is added only when `error.loopContext` is
  present.
- `Group:` (`<groupNodeTypeId> (depth N)`) is added only when
  `error.groupContext` is present.
- `Duration:` uses `error.duration.toFixed(2)` and is always present.

Multiple errors are joined with double newlines (`\n\n`).

### Warning Tooltip Content

When `visualState === 'warning'` and `warnings` is non-empty, the warning
strings are joined with single newlines (`\n`) and shown verbatim (no formatting
helper).

Both tooltips only render their icon/tooltip when the corresponding content is
non-empty: the error badge requires `errors.length > 0`, the warning badge
requires `warnings.length > 0`.

## Limitations and Notes

- **No direct context reading:** The component relies entirely on props. If used
  outside the `RunnerOverlay` → `ConfigurableNodeReactFlowWrapper` →
  `ConfigurableNode` hierarchy, the consumer must supply the correct
  `visualState`, `errors`, and `warnings` manually (see the Storybook stories in
  `src/components/atoms/NodeStatusIndicator/NodeStatusIndicator.stories.tsx` ›
  `meta`).
- **Single-state only:** The component shows one visual state at a time. A node
  cannot simultaneously show `running` and `warning` — a single `visualState`
  drives the display. In the `RunnerOverlay` merge (warnings then errors), the
  `visualState` is only _inferred_ (`'warning'` / `'errored'`) when creating a
  brand-new entry; if an entry already exists, the merge spreads `warnings` /
  `errors` onto it **without changing** `visualState`. So a node that already
  had a `'warning'` entry (created by the warnings pass) keeps
  `visualState: 'warning'` even after errors are merged in — the errors are
  attached to its `errors` field, but the displayed state is not promoted to
  `'errored'`. The authoritative per-node `visualState` comes from
  `runner.nodeVisualStates`, which seeds entries first.
- **Tooltip z-index:** The floating tooltip uses `zIndex: 50`. In deeply nested
  or overlapping node layouts, tooltips may render behind other elements.
- **Animation dependency:** The `running` state relies on the `running-glow`
  keyframe defined in global CSS (`src/index.css` › `running-glow`). If this
  keyframe is missing, the running state will show a static dashed blue outline
  without the breathing glow effect.

## Relationships with Other Features

### -> [Runner Hook (useNodeRunner)](../runner/runnerHookDoc.md)

The `useNodeRunner` hook (`src/utils/nodeRunner/useNodeRunner.ts` ›
`useNodeRunner`) manages execution and exposes (among other fields):

- `nodeVisualStates: ReadonlyMap<string, NodeVisualState>` — per-node visual
  state at the current scrubber position (`replayTo`/live callbacks update it)
- `nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>` — aggregated
  per-node errors
- `nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>` — per-node
  compile-time warnings (e.g. missing function implementations)

`RunnerOverlay` consumes these three maps and merges them into the
`nodeRunnerStates` map placed on `RunnerContext`. During live execution, visual
states update as steps complete. During timeline replay, visual states are
reconstructed up to the current scrubber position via `replayTo()`, which clamps
the index and calls `computeVisualStatesAtStep()`.

### -> [ConfigurableNode](configurableNodeDoc.md)

`ConfigurableNode` accepts three runner-related props
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeProps`):

- `runnerVisualState?: NodeVisualState`
- `runnerErrors?: ReadonlyArray<GraphError>`
- `runnerWarnings?: ReadonlyArray<string>`

When `runnerVisualState` is `undefined` (runner inactive), the node renders its
`nodeContent` directly without any status indicator. When defined, `nodeContent`
is wrapped in `<NodeStatusIndicator>`. This conditional wrapping ensures zero
overhead when the runner feature is not in use.

### -> [FullGraph (RunnerContext Provider chain)](fullGraphDoc.md)

`FullGraph` is the top-level organism. It renders `RunnerOverlay` **only when a
`functionImplementations` prop is supplied**
(`src/components/organisms/FullGraph/FullGraph.tsx` ›
`FullGraphWithReactFlowProvider`); otherwise the graph content renders without
any runner machinery. `RunnerOverlay` is what provides `RunnerContext` (with
`nodeRunnerStates`, `selectedStepRecord`, `edgeValuesAnimated`) and renders the
`NodeRunnerPanel`.

```
+------------------------------------------+
| FullGraph                                |
|                                          |
|  functionImplementations ? ------------> |
|    <RunnerOverlay>                        |
|       useNodeRunner(...)                  |
|       RunnerContext.Provider              |
|         value = {                         |
|           nodeRunnerStates,   <-- merged from useNodeRunner
|           selectedStepRecord,             |
|           edgeValuesAnimated,             |
|         }                                 |
|                                          |
|       {graphContent}                      |
|         +-----------------------------+   |
|         | ReactFlow                   |   |
|         |  nodeTypes = {               |   |
|         |   configurableNode:         |   |
|         |    ConfigurableNodeReactFlow|   |
|         |    Wrapper                  |   |
|         |  }                          |   |
|         +-----------------------------+   |
|                                          |
|       <NodeRunnerPanel ... />             |
|    </RunnerOverlay>                        |
|  : graphContent                          |
+------------------------------------------+
```

`FullGraphContext` (separate, always provided) carries only `{ allProps }` and
is **not** the channel for runner visual state.
