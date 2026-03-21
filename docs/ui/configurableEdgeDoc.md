# ConfigurableEdge

## Overview

ConfigurableEdge is a custom ReactFlow edge component that renders bezier-curve
connections between nodes. Its primary distinguishing feature is automatic
gradient coloring: the edge color transitions smoothly from the source handle's
color to the target handle's color. It also implements viewport optimization via
the IntersectionObserver API, reducing visual prominence for edges that leave
the visible area.

The component lives in
`src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` and is registered
as the `configurableEdge` edge type in FullGraph.

## Entity-Relationship Diagram

```
+---------------------+         +------------------------+
| ConfigurableEdge    |         | ReactFlow BaseEdge     |
|---------------------|         |------------------------|
| id                  |-------->| path, label, style     |
| sourceX, sourceY    |         | markerStart, markerEnd |
| targetX, targetY    |         | interactionWidth       |
| sourcePosition      |         +------------------------+
| targetPosition      |
| source (node id)    |--+
| target (node id)    |  |
| sourceHandleId      |  |   +---------------------------+
| targetHandleId      |  |   | Node Data                 |
+---------------------+  |   |---------------------------|
                          +-->| inputs[]                  |
                              | outputs[]                 |
                              | (each has handleColor)    |
                              +---------------------------+
                                          |
                                          v
                              +---------------------------+
                              | getHandleFromNodeData     |
                              | MatchingHandleId()        |
                              |---------------------------|
                              | Searches inputs/outputs   |
                              | Returns handle + indices  |
                              +---------------------------+
```

## Data Flow Diagram

```
  ReactFlow renders edge
           |
           v
  +-------------------+
  | ConfigurableEdge  |
  | receives props    |
  +-------------------+
           |
     +-----+-----+
     |           |
     v           v
 getBezierPath  useNodesData(source)
 (path calc)    useNodesData(target)
     |           |
     |     +-----+-----+
     |     |           |
     |     v           v
     |  getHandle   getHandle
     |  (source)    (target)
     |     |           |
     |     v           v
     |  sourceColor  targetColor
     |  (fallback:   (fallback:
     |   #A1A1A1)     #A1A1A1)
     |     |           |
     +-----+-----+-----+
                 |
                 v
     +------------------------+
     | SVG <linearGradient>   |
     | source color -> target |
     +------------------------+
                 |
                 v
     +------------------------+
     | BaseEdge renders with  |
     | stroke: url(#gradient) |
     | + viewport opacity     |
     +------------------------+
```

## Type Definitions

### ConfigurableEdgeState

```typescript
type ConfigurableEdgeState = Edge<{}, 'configurableEdge'>;
```

A ReactFlow `Edge` type with an empty data record and the type literal
`'configurableEdge'`. This is the state shape stored in the ReactFlow edge
store. The empty data record means all rendering information (colors, path) is
derived at render time from node data and positional props rather than stored on
the edge itself.

### ConfigurableEdgeProps

```typescript
type ConfigurableEdgeProps = EdgeProps<ConfigurableEdgeState>;
```

The full props received by the component, derived from ReactFlow's `EdgeProps`
generic. Key fields include:

| Prop             | Type        | Description                         |
| ---------------- | ----------- | ----------------------------------- |
| `id`             | `string`    | Unique edge identifier              |
| `sourceX`        | `number`    | X coordinate of source endpoint     |
| `sourceY`        | `number`    | Y coordinate of source endpoint     |
| `targetX`        | `number`    | X coordinate of target endpoint     |
| `targetY`        | `number`    | Y coordinate of target endpoint     |
| `sourcePosition` | `Position`  | Cardinal direction of source handle |
| `targetPosition` | `Position`  | Cardinal direction of target handle |
| `source`         | `string`    | ID of the source node               |
| `target`         | `string`    | ID of the target node               |
| `sourceHandleId` | `string`    | ID of the specific source handle    |
| `targetHandleId` | `string`    | ID of the specific target handle    |
| `label`          | `ReactNode` | Optional edge label                 |
| `markerStart`    | `string`    | Optional start marker               |
| `markerEnd`      | `string`    | Optional end marker                 |

## Rendering

### Gradient Colors (source/target handle colors)

Each edge displays a linear gradient that transitions from the source handle's
color to the target handle's color:

1. **Color lookup** -- `useNodesData` fetches the current data for the source
   and target nodes. The `getHandleFromNodeDataMatchingHandleId` utility
   searches the node's `inputs[]` and `outputs[]` arrays (including handles
   nested inside collapsible panels) to find the matching handle by ID.

2. **Fallback** -- If a handle is not found or has no `handleColor`, the default
   `#A1A1A1` (medium gray) is used.

3. **SVG gradient** -- An SVG `<linearGradient>` element is defined in `<defs>`
   with:
   - `gradientUnits="userSpaceOnUse"` so coordinates map to the SVG viewport
   - `x1/y1` set to `sourceX/sourceY`, `x2/y2` set to `targetX/targetY`
   - Two `<stop>` elements at offsets `0` and `1` for source and target colors

4. **Application** -- The gradient is applied via
   `stroke: url(#linear-gradient-edge-{id})` on the `BaseEdge` style prop.

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

The edge path is computed via ReactFlow's `getBezierPath` utility:

```typescript
const [edgePath] = getBezierPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
});
```

This produces a cubic bezier SVG path string with control points determined by
the source and target positions (cardinal directions). The path is passed
directly to `BaseEdge` as the `path` prop.

### Viewport Optimization

The component uses the browser's `IntersectionObserver` API to detect when an
edge leaves the visible viewport:

1. **Observer setup** (in `useEffect`):
   - Root element: ReactFlow's DOM container (`store.getState().domNode`)
   - Target element: the edge's SVG element, found via
     `document.getElementById(id)`
   - Threshold: `1` (triggers when the element is 100% visible)
   - Root margin: `20px` (provides a small buffer zone)

2. **State tracking**: `isInViewport` boolean state toggles based on observer
   callbacks.

3. **Visual effect**: When `isInViewport` is `false`, the edge receives
   `opacity-25` via Tailwind, making off-screen edges semi-transparent rather
   than fully hidden. This provides a graceful visual degradation.

4. **Cleanup**: The observer disconnects on component unmount via the effect's
   cleanup function.

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

**Additional CSS classes**:

- `stroke-7!` -- Forces a stroke width of 7 (Tailwind arbitrary value with
  `!important`)
- `in-[g.selected]:brightness-150` -- Increases brightness when the edge is
  selected (within a selected `<g>` group)

## Limitations and Deprecated Patterns

- **Threshold of 1**: The `IntersectionObserver` threshold is set to `1`,
  meaning the callback fires only when the element is _fully_ visible or _fully_
  not. Partially visible edges may not trigger the transition, which could cause
  brief visual artifacts during scrolling.
- **`store.getState().domNode` in dependency array**: The `useEffect` uses
  `store.getState().domNode` as a dependency. Since `store.getState()` returns a
  snapshot, this may not trigger re-runs if the DOM node reference changes. In
  practice, the ReactFlow DOM node is stable for the component's lifetime.
- **Unused `ref` parameter**: The component uses `forwardRef` but discards the
  ref (`_`). The ref is not forwarded to any DOM element. This may be a pattern
  left over from an earlier iteration or kept for API compatibility.

## Relationships with Other Features

### -> [Handles (color lookup)](../core/handlesDoc.md)

ConfigurableEdge depends on `getHandleFromNodeDataMatchingHandleId` from
`src/utils/nodeStateManagement/handles/handleGetters.ts` to resolve handle IDs
to handle objects. It reads the `handleColor` property from the resolved
handle's `value`. The getter searches through both flat input/output arrays and
handles nested within collapsible panels via the
`handleIteratorIncludingIndices` generator.

### -> [Edges (state type)](../core/edgesDoc.md)

`ConfigurableEdgeState` is defined as `Edge<{}, 'configurableEdge'>`. This type
is used wherever edges are stored in the ReactFlow state. The empty data generic
means ConfigurableEdge derives all its visual properties at render time rather
than persisting them in edge state.

### -> [FullGraph (registration)](fullGraphDoc.md)

ConfigurableEdge is registered in
`src/components/organisms/FullGraph/FullGraphCustomNodesAndEdges.ts`:

```typescript
const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};
```

This mapping is passed to the ReactFlow `<ReactFlow edgeTypes={edgeTypes} />`
component in FullGraph, enabling ReactFlow to render `ConfigurableEdge` for any
edge with `type: 'configurableEdge'`.

### -> [ReactFlow (BaseEdge, getBezierPath)](../external/reactFlowDoc.md)

ConfigurableEdge is built on top of two ReactFlow primitives:

- **`BaseEdge`** -- The underlying SVG edge renderer. ConfigurableEdge passes
  the computed path, gradient stroke style, labels, markers, and interaction
  width to it.
- **`getBezierPath`** -- Computes the SVG path string for a cubic bezier curve
  between two points with directional control points.
- **`useNodesData`** -- Reactively subscribes to node data changes so that
  handle color changes propagate to edges automatically.
- **`useStoreApi`** -- Accesses the ReactFlow store for the DOM node reference
  used by the IntersectionObserver.
