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

**Source:** `src/components/atoms/NodeStatusIndicator/NodeStatusIndicator.tsx`

## Props

| Prop          | Type                        | Required | Description                                                                                                              |
| ------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `visualState` | `NodeVisualState`           | Yes      | Current visual state of the node (`'idle'` \| `'running'` \| `'completed'` \| `'errored'` \| `'skipped'` \| `'warning'`) |
| `errors`      | `ReadonlyArray<GraphError>` | No       | Errors associated with this node. Shown in a hover tooltip when `visualState` is `'errored'`.                            |
| `warnings`    | `ReadonlyArray<string>`     | No       | Warning messages. Shown in a hover tooltip when `visualState` is `'warning'`.                                            |
| `children`    | `ReactNode`                 | Yes      | The node content to wrap.                                                                                                |

## Visual States

```
+-------------+-------------------+---------------------+-------------------+-------------------+
| State       | Outline           | Shadow / Glow       | Icon              | Extra             |
+-------------+-------------------+---------------------+-------------------+-------------------+
| idle        | 5px solid         | none                | none              | none              |
|             | transparent       |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| running     | 5px dashed        | animated glow       | none              | @keyframes        |
|             | --primary-blue    | (running-glow, 2s   |                   | breathing anim    |
|             |                   |  ease-in-out inf.)  |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| completed   | 5px solid         | 0 0 12px            | none              | none              |
|             | --status-completed| rgba(76,175,80,0.3) |                   |                   |
|             | (green)           |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| errored     | 5px solid         | 0 0 12px            | AlertCircleIcon   | none              |
|             | --status-errored  | rgba(255,68,68,0.3) | (#FF4444, top-    |                   |
|             | (red)             |                     |  right corner)    |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| skipped     | 5px dashed        | none                | none              | opacity: 50%      |
|             | --secondary-dark- |                     |                   | + black/30 overlay|
|             | gray              |                     |                   |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
| warning     | 5px solid         | 0 0 12px            | AlertTriangleIcon | none              |
|             | --status-warning  | rgba(255,165,0,0.3) | (#FFA500, top-    |                   |
|             | (orange)          |                     |  right corner)    |                   |
+-------------+-------------------+---------------------+-------------------+-------------------+
```

The outline overlay `<div>` is always mounted (even during `idle`) with
`transition-[outline-color,box-shadow,opacity] duration-200`. This ensures
smooth CSS transitions when scrubbing the timeline back to idle, rather than
abruptly mounting/unmounting.

The `skipped` state uniquely applies two layers: a dashed gray outline at 50%
opacity, plus a `bg-black/30` dimming overlay to visually de-emphasize the node
content.

## Context Integration

NodeStatusIndicator does **not** read context directly. It is a pure
presentational component that receives its state via props. The context
integration happens one level up:

```
+-------------------+       +-------------------------------+       +--------------------+
| FullGraphContext  |       | ConfigurableNodeReactFlow-    |       | ConfigurableNode   |
|                   |  read |   Wrapper                     | props |                    |
| nodeRunnerStates  |------>| reads nodeRunnerState for     |------>| runnerVisualState   |
| Map<id, {        |       | its own node ID from context  |       | runnerErrors        |
|   visualState,   |       |                               |       | runnerWarnings      |
|   errors?,       |       | Lines 99, 107-109             |       |                    |
|   warnings?      |       +-------------------------------+       +--------------------+
| }>               |                                                        |
+-------------------+                                                       | wraps children
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

1. `FullGraph` provides a `FullGraphContext` containing an optional
   `nodeRunnerStates` map (`ReadonlyMap<string, NodeRunnerState>`).
2. `ConfigurableNodeReactFlowWrapper` (the ReactFlow node renderer) calls
   `useContext(FullGraphContext)` and looks up `nodeRunnerStates.get(id)` for
   its own node ID.
3. It passes `visualState`, `errors`, and `warnings` to `ConfigurableNode` as
   `runnerVisualState`, `runnerErrors`, and `runnerWarnings` props.
4. `ConfigurableNode` conditionally wraps its content in `<NodeStatusIndicator>`
   only when `runnerVisualState !== undefined`. When the runner is inactive, no
   indicator is rendered.

The `NodeRunnerState` type is defined in `FullGraphState.ts`:

```typescript
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};
```

## Tooltip Display (Errors, Warnings)

Error and warning icons appear as badge icons in the top-right corner of the
node. Hovering over them displays a floating tooltip with details.

### StatusTooltip (Internal Component)

The tooltip uses the `useFloatingTooltip` hook (a shared abstraction over
`@floating-ui/react`) with these settings:

| Setting     | Value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| Placement   | `'top'`                                                               |
| Offset      | `10px`                                                                |
| Hover delay | `{ open: 150ms, close: 0 }`                                           |
| Transition  | `150ms` fade + translateY                                             |
| Arrow       | Yes (`FloatingArrow`, fill `#181818`, stroke `--secondary-dark-gray`) |

### Error Tooltip Content

When `visualState === 'errored'` and `errors` is non-empty, each `GraphError` is
formatted via `formatGraphError()` into a multi-line string:

```
Error in "AND Gate" (node-123)
Message: Cannot read property "value" of undefined
Path: Boolean Constant -> AND Gate
Duration: 0.30ms
```

Multiple errors are joined with double newlines (`\n\n`).

`formatGraphError` also includes loop context (`Loop: iteration X of Y`) and
group context (`Group: typeId (depth N)`) when applicable.

### Warning Tooltip Content

When `visualState === 'warning'` and `warnings` is non-empty, warning strings
are joined with single newlines (`\n`).

## Limitations and Deprecated Patterns

- **No direct context reading:** The component relies entirely on props. If used
  outside the `ConfigurableNode` -> `ConfigurableNodeReactFlowWrapper`
  hierarchy, the consumer must supply the correct `visualState`, `errors`, and
  `warnings` manually.
- **Single-state only:** The component shows one visual state at a time. A node
  cannot simultaneously show `running` and `warning` — the runner must choose
  the most relevant state.
- **Tooltip z-index:** The floating tooltip uses `zIndex: 50`. In deeply nested
  or overlapping node layouts, tooltips may render behind other elements.
- **Animation dependency:** The `running` state relies on a `running-glow`
  keyframe animation defined in global CSS (`src/index.css`). If this keyframe
  is missing, the running state will show a static dashed blue outline without
  the breathing glow effect.

## Relationships with Other Features

### -> [Runner Hook (nodeVisualStates)](../runner/runnerHookDoc.md)

The `useNodeRunner` hook manages execution and produces a `RunSession`
containing:

- `nodeVisualStates: ReadonlyMap<string, NodeVisualState>` — per-node visual
  state at the current scrubber position
- `nodeErrors: ReadonlyMap<string, ReadonlyArray<GraphError>>` — aggregated
  per-node errors
- `nodeWarnings: ReadonlyMap<string, ReadonlyArray<string>>` — per-node
  compile-time warnings

These maps are combined into the `nodeRunnerStates` map that flows through
`FullGraphContext`. During live execution, visual states update as steps
complete. During timeline replay, visual states are reconstructed up to the
current scrubber position via `replayTo()`.

### -> [ConfigurableNode](configurableNodeDoc.md)

`ConfigurableNode` accepts three runner-related props:

- `runnerVisualState?: NodeVisualState`
- `runnerErrors?: ReadonlyArray<GraphError>`
- `runnerWarnings?: ReadonlyArray<string>`

When `runnerVisualState` is `undefined` (runner inactive), the node renders
without any status indicator. When defined, the node content is wrapped in
`<NodeStatusIndicator>`. This conditional wrapping ensures zero overhead when
the runner feature is not in use.

### -> [FullGraph (Context Provider)](fullGraphDoc.md)

`FullGraph` is the top-level organism that provides `FullGraphContext`. The
context's `nodeRunnerStates` field is optional — it is only populated when the
`NodeRunnerPanel` is active and a run session exists. The `createContextValue()`
helper in `FullGraphState.ts` accepts the optional `nodeRunnerStates` map and
bundles it into the context value.

```
+---------------------------+
| FullGraph                 |
|                           |
|  FullGraphContext.Provider|
|    value = {              |
|      allProps,            |
|      nodeRunnerStates?    |<--- from useNodeRunner / NodeRunnerPanel
|    }                      |
|                           |
|  +---------------------+ |
|  | ReactFlow           | |
|  |  nodeTypes = {       | |
|  |   configurableNode: | |
|  |    Wrapper          | |
|  |  }                  | |
|  +---------------------+ |
+---------------------------+
```
