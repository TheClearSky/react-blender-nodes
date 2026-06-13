# ConfigurableEdge

## Overview

ConfigurableEdge is the custom ReactFlow edge component that renders
bezier-curve connections between nodes. It has three distinguishing
responsibilities:

1. **Gradient coloring** — the edge color transitions smoothly from the source
   handle's color to the target handle's color via an SVG `<linearGradient>`.
2. **Viewport optimization** — an `IntersectionObserver` dims edges that leave
   the visible canvas (`opacity-25`) rather than fully hiding them.
3. **Runner value inspection** — when a step is selected in the runner timeline,
   each edge that carries a value for that step displays a value "pill" that
   either travels along the path (animated) or sits at the path midpoint
   (static), while the edge itself pulses.

The component lives in
`src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` ›
`ConfigurableEdge` and is registered as the `configurableEdge` edge type in
`src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts` ›
`edgeTypes`.

**Source:** `src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` ›
`ConfigurableEdge`

## Entity-Relationship Diagram

```
+---------------------+         +------------------------+
| ConfigurableEdge    |         | ReactFlow BaseEdge     |
|---------------------|         |------------------------|
| id                  |-------->| id, path               |
| sourceX, sourceY    |         | label, labelStyle      |
| targetX, targetY    |         | markerStart, markerEnd |
| sourcePosition      |         | interactionWidth       |
| targetPosition      |         | className, style       |
| ...props:           |         | focusable              |
|   source (node id)  |--+      +------------------------+
|   target (node id)  |  |
|   sourceHandleId    |  |   +---------------------------+
|   targetHandleId    |  |   | Node Data (useNodesData)  |
+---------------------+  |   |---------------------------|
                          +-->| inputs[]  (with panels)   |
                              | outputs[]                 |
                              | each handle: handleColor, |
                              |   name, id                |
                              +---------------------------+
                                          |
                                          v
                              +---------------------------+
                              | getHandleFromNodeData     |
                              | MatchingHandleId()        |
                              |---------------------------|
                              | Searches inputs/outputs   |
                              | (incl. panel-nested)      |
                              | Returns                   |
                              |   HandleAndRelated-       |
                              |   Information | undefined |
                              +---------------------------+

+---------------------+         +------------------------+
| RunnerContext       |         | ExecutionStepRecord    |
| (optional)          |-------->| (selectedStepRecord)   |
|---------------------|         |------------------------|
| nodeRunnerStates    |         | nodeId                 |
| selectedStepRecord  |         | inputValues            |
| edgeValuesAnimated  |         |   (handleName ->       |
+---------------------+         |    RecordedInputHandle |
                                |    Value.connections[])|
                                | outputValues           |
                                |   (handleName ->       |
                                |    RecordedOutput-     |
                                |    HandleValue.value)  |
                                +------------------------+
```

## Data Flow Diagram

```
  ReactFlow renders edge (type === 'configurableEdge')
           |
           v
  +-------------------+
  | ConfigurableEdge  |
  | receives EdgeProps|
  +-------------------+
           |
     +-----+-----------+------------------+
     |                 |                  |
     v                 v                  v
 getBezierPath   useNodesData(source)  useContext(RunnerContext)
 -> [edgePath,   useNodesData(target)        |
     labelX,           |                     v
     labelY]     +-----+-----+         selectedStepRecord
     |           |           |         edgeValuesAnimated
     |           v           v               |
     |  getHandleFromNode  getHandle...   +---+--------------------+
     |  ...MatchingHandle  (target)       | inputMatch (useMemo)   |
     |  Id (source)            |          |  edge.target === step  |
     |     |                   |          |  .nodeId? scan         |
     |     v                   v          |  inputValues[].        |
     |  ?.value.handleColor    same       |  connections for src   |
     |  ?? '#A1A1A1'                       +-----------+------------+
     |     |                   |                       |
     |     |                   |          +------------+------------+
     |     |                   |          | outputMatch (useMemo)  |
     |     |                   |          |  edge.source === step  |
     |     |                   |          |  .nodeId? resolve      |
     |     |                   |          |  handle name, read     |
     |     |                   |          |  outputValues.get(name)|
     |     |                   |          +-----------+------------+
     |     |                   |                      |
     |     |                   |          match = inputMatch.found
     |     |                   |               ? inputMatch : outputMatch
     |     |                   |                      |
     |     |                   |          formattedValue =
     |     |                   |            match.found
     |     |                   |              ? formatEdgeValue(value)
     |     |                   |              : null
     +-----+----+----+---------+----------------------+
                |    |                                |
                v    v                                v
       +------------------------+         +------------------------+
       | <defs><linearGradient> |         | value pill (when       |
       | x1/y1 = source, x2/y2  |         | formattedValue != null)|
       | = target, two <stop>s  |         | animated: <animate-    |
       +-----------+------------+         | Motion path=edgePath/> |
                   |                      | static: translate(     |
                   v                      |   labelX, labelY)      |
       +------------------------+         +------------------------+
       | <BaseEdge>             |
       | stroke: url(#gradient) |
       | + opacity-25 if off-   |
       |   screen + pulse if    |
       |   value shown          |
       +------------------------+
```

## Type Definitions

### ConfigurableEdgeState

```typescript
type ConfigurableEdgeState = Edge<Record<string, unknown>, 'configurableEdge'>;
```

A ReactFlow `Edge` type whose `data` is typed `Record<string, unknown>` and the
type literal `'configurableEdge'`. This is the state shape stored in the
ReactFlow edge store. The library reads no edge `data` of its own: all rendering
information (colors, path, value pills) is derived at render time from node
data, positional props, and the runner context — none of it is persisted on the
edge itself (consumers may attach their own `data`, which the library ignores).

### ConfigurableEdgeProps

```typescript
type ConfigurableEdgeProps = EdgeProps<ConfigurableEdgeState>;
```

The full props received by the component, derived from ReactFlow's `EdgeProps`
generic. The component destructures `id`, `sourceX`, `sourceY`, `targetX`,
`targetY`, `sourcePosition`, `targetPosition` directly and gathers the remaining
fields under `...props` (notably `source`, `target`, `sourceHandleId`,
`targetHandleId`, `label`, `labelStyle`, `markerStart`, `markerEnd`,
`interactionWidth`).

| Prop               | Type             | Description                                                         |
| ------------------ | ---------------- | ------------------------------------------------------------------- |
| `id`               | `string`         | Unique edge identifier (used as the SVG element id and gradient id) |
| `sourceX`          | `number`         | X coordinate of source endpoint                                     |
| `sourceY`          | `number`         | Y coordinate of source endpoint                                     |
| `targetX`          | `number`         | X coordinate of target endpoint                                     |
| `targetY`          | `number`         | Y coordinate of target endpoint                                     |
| `sourcePosition`   | `Position`       | Cardinal direction of source handle                                 |
| `targetPosition`   | `Position`       | Cardinal direction of target handle                                 |
| `source`           | `string`         | ID of the source node (in `...props`)                               |
| `target`           | `string`         | ID of the target node (in `...props`)                               |
| `sourceHandleId`   | `string \| null` | ID of the specific source handle                                    |
| `targetHandleId`   | `string \| null` | ID of the specific target handle                                    |
| `label`            | `ReactNode`      | Optional edge label (forwarded to `BaseEdge`)                       |
| `labelStyle`       | `CSSProperties`  | Optional label style (forwarded)                                    |
| `markerStart`      | `string`         | Optional start marker (forwarded)                                   |
| `markerEnd`        | `string`         | Optional end marker (forwarded)                                     |
| `interactionWidth` | `number`         | Optional invisible click target width (forwarded)                   |

Both `ConfigurableEdgeProps` and `ConfigurableEdgeState` are exported as types
from the module.

## Rendering

### Gradient Colors (source/target handle colors)

Each edge displays a linear gradient that transitions from the source handle's
color to the target handle's color:

1. **Color lookup** — `useNodesData(props.source)` and
   `useNodesData(props.target)` fetch the current data for the source and target
   nodes. The `getHandleFromNodeDataMatchingHandleId(handleId, nodeData)`
   utility searches the node's `inputs[]` and `outputs[]` arrays (including
   handles nested inside collapsible input panels, via the
   `handleIteratorIncludingIndices` generator) to find the matching handle by
   ID. It returns a `HandleAndRelatedInformation` object whose `value` is the
   matched handle; the color is read from `value.handleColor`.

2. **Fallback** — If a handle is found but has no `handleColor`, the default
   `#A1A1A1` (medium gray) is used (`?? '#A1A1A1'`). If `props.source` /
   `props.target` is falsy or the node data has not loaded, the color memo
   returns `undefined` (no `<stop>` color), which the browser renders as black.

3. **Reactivity** — The colors are computed in `useMemo` blocks keyed on
   `[props.source, sourceNodeData]` and `[props.target, targetNodeData]`.
   Because `useNodesData` reactively subscribes to node-data changes, editing a
   handle's color updates the connected edges automatically.

4. **SVG gradient** — An SVG `<linearGradient>` element is emitted in `<defs>`
   with:
   - `gradientUnits="userSpaceOnUse"` so coordinates map to the SVG viewport
   - `x1/y1` set to `sourceX/sourceY`, `x2/y2` set to `targetX/targetY`
   - Two `<stop>` elements at offsets `0` (source) and `1` (target)
   - `id={`linear-gradient-edge-${id}`}`

5. **Application** — The gradient is applied via
   `style={{ stroke: `url(#linear-gradient-edge-${id})` }}` on the `BaseEdge`.

```
 Source Handle            Target Handle
 color: #FF6B6B           color: #4ECDC4
      |                        |
      v                        v
  [stop offset=0]         [stop offset=1]
      |                        |
      +--- linearGradient -----+
                  |
                  v
         BaseEdge stroke
    #FF6B6B ============> #4ECDC4
```

### Bezier Curves

The edge path is computed via ReactFlow's `getBezierPath` utility, which returns
a 3-tuple `[path, labelX, labelY]`:

```typescript
const [edgePath, labelX, labelY] = getBezierPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
});
```

- `edgePath` is a cubic-bezier SVG path string (control points determined by the
  source/target cardinal positions). It is passed to `BaseEdge` as `path` and
  reused as the motion path for the animated value pill (see below).
- `labelX` / `labelY` are the midpoint coordinates of the curve, used to
  position the static value pill.

### Viewport Optimization

The component uses the browser's `IntersectionObserver` API to detect when an
edge leaves the visible viewport:

1. **Observer setup** (in `useEffect`):
   - Root element: ReactFlow's DOM container (`store.getState().domNode`); the
     effect bails out early if it is falsy.
   - Target element: the edge's SVG element, found via
     `document.getElementById(id)` (the `BaseEdge` is rendered with `id={id}`);
     the effect bails out early if it is not found.
   - Threshold: `1` (triggers when the element is 100% intersecting)
   - Root margin: `20px` (provides a small buffer zone)
   - The observer callback finds the entry whose `target.id === id` and calls
     `setIsInViewport(entry.isIntersecting)`.

2. **State tracking** — `isInViewport` boolean state (initialized to `true`).
   The active observer is also stored in a `useRef` (`domIntersectionObserver`).

3. **Visual effect** — When `isInViewport` is `false`, the edge receives
   `opacity-25` via Tailwind, making off-screen edges semi-transparent rather
   than fully hidden — a graceful visual degradation.

4. **Cleanup** — The effect's cleanup function disconnects the observer and
   resets the ref to `null` on unmount (and before re-running).

```
+------ Viewport (ReactFlow container) ------+
|                                             |
|  Node A =====[gradient edge]=====> Node B   |  <-- isInViewport: true
|                                             |      opacity: 1
+---------------------------------------------+
                                        |
                        edge extends beyond viewport
                                        |
                                        v
                              opacity drops to 0.25
```

### Runner Value Inspection (edge value pills)

When the runner timeline has a selected step, ConfigurableEdge can display the
value that flowed across the edge during that step. This is opt-in: it only
activates when a `RunnerContext` value is present and a step is selected.

1. **Context read** — `const runnerCtx = useContext(RunnerContext)` reads the
   `RunnerContextValue` (provided by `RunnerOverlay`):
   `{ nodeRunnerStates, selectedStepRecord, edgeValuesAnimated }`. Outside a
   runner overlay, `runnerCtx` is `undefined` and no pill is rendered.

2. **Input match** (`inputMatch`, `useMemo`) — When `props.target` equals
   `selectedStepRecord.nodeId`, the component scans the step's `inputValues` (a
   `ReadonlyMap<handleName, RecordedInputHandleValue>`). For every connection in
   every input handle, it matches `conn.sourceNodeId === props.source` and
   `conn.sourceHandleId === (props.sourceHandleId ?? '')`. On a hit it returns
   `{ found: true, value: conn.value }`.

3. **Output match** (`outputMatch`, `useMemo`) — When `props.source` equals
   `selectedStepRecord.nodeId`, the component resolves the source handle by ID
   using
   `getHandleFromNodeDataMatchingHandleId(sourceHandleId, sourceNodeData.data, false)`.
   The third argument (`runForInputs = false`) makes the getter skip inputs and
   search **outputs only**. It then reads
   `step.outputValues.get(handle.value.name)` (keyed by handle **name**) and, if
   present, returns `{ found: true, value: outputVal.value }`.

4. **Resolution** — `const match = inputMatch.found ? inputMatch : outputMatch`.
   `formattedValue = match.found ? formatEdgeValue(match.value) : null`.

5. **Pill geometry** — Pill width is estimated from the text length:
   `Math.max(40, formattedValue.length * 7.5 + 20)`; height is fixed at `22`.
   The rounded rect uses `fill='#282828'`, `stroke='#444444'`, `rx={6}`; the
   text uses `fill='#e6e6e6'`, `fontSize={11}`, `fontFamily='var(--font-main)'`,
   centered via `textAnchor='middle'` + `dominantBaseline='central'`.

6. **Animated vs. static** —
   `const animated = runnerCtx?.edgeValuesAnimated ?? true`:
   - **Animated** — the pill `<g>` contains an
     `<animateMotion dur='2.5s' repeatCount='indefinite' path={edgePath} />`, so
     the pill travels along the same bezier path as the edge.
   - **Static** — the pill `<g>` is positioned at the curve midpoint with
     `transform={`translate(${labelX}, ${labelY})`}`.
   - In both cases the `<g>` is `pointerEvents='none'` so it never intercepts
     clicks.

7. **Edge pulse** — Whenever `formattedValue !== null`, the `BaseEdge` also gets
   the class `animate-[edge-brightness-pulse_1.5s_ease-in-out_infinite]`. The
   `edge-brightness-pulse` keyframe (defined in `src/index.css`) oscillates
   `opacity` between `1` (0%/100%) and `0.35` (50%), drawing attention to edges
   that carry the inspected step's data.

```
 selectedStepRecord.nodeId === edge.target   -> inputMatch  (value from connections[])
 selectedStepRecord.nodeId === edge.source   -> outputMatch (value from outputValues)
                          |
                          v
                  formattedValue
                          |
            +-------------+--------------+
            | animated?                  |
            v                            v
   <animateMotion path=edgePath>   translate(labelX, labelY)
   pill rides the curve            pill pinned at midpoint
            \____________ + edge pulses ____________/
```

### `formatEdgeValue` (value formatting)

A module-level helper that turns an arbitrary `unknown` value into a short
display string for the pill:

| Input                 | Output                                     |
| --------------------- | ------------------------------------------ |
| `undefined`           | `undefined`                                |
| `null`                | `null`                                     |
| `boolean`             | `true` / `false`                           |
| `number`              | `String(value)`                            |
| `string` (short)      | `"value"` (wrapped in quotes)              |
| `string` (> 12 chars) | `"first 11 chars…"` (truncated + ellipsis) |
| `Map`                 | `Map(<size>)`                              |
| `Array`               | `[<length>]`                               |
| other `object`        | `{<key count>}`                            |
| anything else         | `String(value)`                            |

The truncation limit is the module constant `MAX_EDGE_VALUE_LENGTH = 12`.

### CSS classes on `BaseEdge`

The `className` is composed via `cn(...)` (from `@/utils`):

- `stroke-7!` — forces a stroke width of 7 (Tailwind arbitrary value with
  `!important`).
- `in-[g.selected]:brightness-150` — increases brightness when the edge is
  selected (i.e., rendered inside a ReactFlow `<g class="selected">`).
- `opacity-25` — applied only when `!isInViewport` (off-screen dimming).
- `animate-[edge-brightness-pulse_1.5s_ease-in-out_infinite]` — applied only
  when `formattedValue !== null` (runner value pulse).

`BaseEdge` is also rendered with `focusable={true}`.

## Limitations and Notes

- **Threshold of 1**: The `IntersectionObserver` threshold is set to `1`, so the
  callback fires on the transition to/from fully intersecting. Combined with the
  `20px` root margin this gives a buffer, but edges that are only partially
  visible may toggle abruptly during fast panning.
- **`store.getState().domNode` in the dependency array**: The viewport
  `useEffect` lists `store.getState().domNode` as its dependency. Since
  `getState()` returns a snapshot value (not a reactive subscription), the
  effect re-runs only when that value changes between renders; in practice the
  ReactFlow DOM node is stable for the component's lifetime.
- **Output match relies on handle `name`**: `outputMatch` looks up
  `step.outputValues.get(handle.value.name)` — the output record map is keyed by
  handle **name**, not ID. Two output handles sharing a name on the same node
  would collide. Input matching, by contrast, uses handle **IDs** on the
  connection (`sourceHandleId`).
- **Color memo can return `undefined`**: Before node data loads (or when
  source/target is falsy), `sourceHandleColor` / `targetHandleColor` are
  `undefined`, leaving the `<stop>` with no `stopColor` (browser default black)
  until data resolves.
- **Unused `ref` parameter**: The component is wrapped in `forwardRef` but
  discards the ref (the second parameter is `_`); it is not forwarded to any DOM
  element. `displayName` is set to `'ConfigurableEdge'`.

## Relationships with Other Features

### -> [Handles (color & name lookup)](../core/handlesDoc.md)

ConfigurableEdge depends on `getHandleFromNodeDataMatchingHandleId` from
`src/utils/nodeStateManagement/handles/handleGetters.ts` ›
`getHandleFromNodeDataMatchingHandleId` to resolve handle IDs to handle objects.
It uses the result's `value.handleColor` (gradient stops) and `value.name`
(output value lookup). The getter walks both flat input/output arrays and
panel-nested handles via the `handleIteratorIncludingIndices` generator, and its
`runForInputs` / `runForOutputs` flags let ConfigurableEdge restrict the search
to outputs when matching output edges.

### -> [Edges (state type)](../core/edgesDoc.md)

`ConfigurableEdgeState` is `Edge<Record<string, unknown>, 'configurableEdge'>`.
This type is used wherever edges are stored in the ReactFlow state. The library
reads no edge `data`: ConfigurableEdge derives all of its visual properties
(gradient, opacity, value pill) at render time rather than persisting them in
edge state.

### -> [FullGraph (registration)](fullGraphDoc.md)

ConfigurableEdge is registered in
`src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts` ›
`edgeTypes`:

```typescript
const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};
```

This mapping is passed to ReactFlow as `<ReactFlow edgeTypes={edgeTypes} />` in
FullGraph, enabling ReactFlow to render `ConfigurableEdge` for any edge with
`type: 'configurableEdge'`. The same file also exports the `nodeTypes` registry.

### -> [Runner / Execution Recording (value pills)](../runner/executionRecordingDoc.md)

The value-inspection feature consumes runner state via `RunnerContext`
(`src/components/organisms/FullGraph/FullGraphState.ts` › `RunnerContext`),
whose value is supplied by `RunnerOverlay`:

- `selectedStepRecord: ExecutionStepRecord | null` — the currently inspected
  step. Its `inputValues` (`RecordedInputHandleValue.connections`) and
  `outputValues` (`RecordedOutputHandleValue.value`) types are defined in
  `src/utils/nodeRunner/types.ts` › `ExecutionStepRecord`.
- `edgeValuesAnimated: boolean` — toggles animated vs. static pills; it is wired
  from the recording view state (`RecordingViewState.edgeValuesAnimated`).

When no `RunnerContext` provider is present (e.g., a FullGraph without
`functionImplementations`), `useContext` returns `undefined` and the edge
renders gradient + viewport behavior only.

### -> [NodeStatusIndicator (sibling runner UI)](nodeStatusIndicatorDoc.md)

`RunnerContext.nodeRunnerStates` feeds per-node visual overlays through
`NodeStatusIndicator`, while the same context's `selectedStepRecord` /
`edgeValuesAnimated` drive ConfigurableEdge's pills — the two components form
the node-side and edge-side halves of the runner's on-canvas inspection.

### -> [ReactFlow (BaseEdge, getBezierPath, hooks)](../external/reactFlowDoc.md)

ConfigurableEdge is built on `@xyflow/react` primitives:

- **`BaseEdge`** — the underlying SVG edge renderer. ConfigurableEdge passes the
  computed path, gradient stroke style, label/labelStyle, markers, interaction
  width, className, and `focusable`.
- **`getBezierPath`** — computes the SVG path string plus the midpoint
  `[labelX, labelY]` for the static pill.
- **`useNodesData`** — reactively subscribes to source/target node data so
  handle color changes propagate to edges automatically.
- **`useStoreApi`** — accesses the ReactFlow store for `domNode`, used as the
  `IntersectionObserver` root.
- **`EdgeProps` / `Edge`** — generic types backing `ConfigurableEdgeProps` and
  `ConfigurableEdgeState`.
