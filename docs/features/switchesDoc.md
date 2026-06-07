# Switches

## Overview

Switches enable conditional branching within the react-blender-nodes graph
system. They are implemented as a **bound pair** of standard nodes —
`switchStart` and `switchEnd` — that work together to define a true/false branch
structure. The pair is tied together by a single structural `bindSwitchNodes`
connection and carries data through `switchInfer` handles.

At runtime a switch evaluates a boolean `condition` on `switchStart`. The
`switchStart` node copies its incoming data values onto **both** a true-zone and
a false-zone set of output handles. Whichever branch matches the condition (true
or false) executes its body nodes, and `switchEnd` collects the results from the
zone that ran and forwards them downstream.

Unlike loops (which use a three-node triplet and a body region), a switch
defines **two** body regions — a true branch and a false branch — each modeled
as a first-class **zone** (see [Zones](zonesDoc.md)). Only one branch executes
per run, determined by the condition value.

Key facts:

- Switch nodes are **standard nodes** (`switchStart`, `switchEnd`) registered in
  `standardNodeTypes` alongside group and loop nodes
  (`src/utils/nodeStateManagement/standardNodes.ts` › `standardNodeTypes`). They
  are hidden from the "Add Node" context menu
  (`standardHiddenNodeTypesInContextMenu`) and added via the dedicated
  `ADD_SWITCH` action instead.
- The `bindSwitchNodes` edge is **structural only** (`noEquivalent` underlying
  type, `maxConnections: 1`) — it carries no data at runtime.
- `switchInfer` handles use `inferFromConnection` and resolve to the concrete
  type of whatever is connected.
- When an infer handle on either switch node gets connected, **duplicate infer
  handles are added across the pair** so additional data channels can be wired —
  one new input/output on `switchStart` per zone and matching handles on
  `switchEnd`.
- Each data channel exists in **both** a true zone and a false zone. The
  `switchStart` outputs and `switchEnd` inputs are split in half: the first
  `Math.ceil(count / 2)` belong to the true zone, the rest to the false zone.
- Zoned handles are name-prefixed `True: ` / `False: ` so the two zones stay
  visually and structurally distinguishable.
- Switch connection validation enforces branch isolation: nodes in the true
  branch cannot connect to nodes in the false branch, and body nodes must
  interact with the switch only through the correct zone handles.
- Adding a switch creates two **enforced** zones (`True Branch`, `False Branch`)
  via `createSwitchZones`. Zone membership is recomputed on every edge change.
- At execution time, switches are compiled into `SwitchExecutionBlock` objects
  and executed by `executeSwitchBlock`, which runs only the branch selected by
  the condition.

## Entity-Relationship Diagram

```
                      bindSwitchNodes (structural, max 1)
        ┌─────────────┐ ───────────────────────────────> ┌─────────────┐
        │ switchStart │                                   │  switchEnd  │
        └─────────────┘                                   └─────────────┘
          │   ^   │ │                                       ^   ^   │
          │   │   │ └── False-zone outputs ────────┐        │   │   │
          │   │   └──── True-zone outputs ───┐      │        │   │   │
          │   │                              v      v        │   │   │
   infer  │   │ condition            ┌──────────────────┐    │   │   │ infer
   (in)   │   │ (boolean)            │  TRUE BRANCH     │────┘   │   │ (out,
          │   │                      │  (body nodes)    │ true-zone in   downstream)
          v   │                      └──────────────────┘        │   │
        upstream                     ┌──────────────────┐        │   │
                                     │  FALSE BRANCH    │────────┘   │
                                     │  (body nodes)    │ false-zone in
                                     └──────────────────┘
```

## Functional Dependency Diagram

```
isSwitchConnectionValid
├── isSwitchNode
├── getSwitchStructureFromNode
│   └── getHandleFromNodeDataFromIndices (follows the bindSwitchNodes edge)
├── getZoneHandleIds
│   └── getAllHandlesFromNodeData (splits data handles into true/false zones)
├── getNodesInSwitchRegion          (fallback when zones are absent)
│   └── bidirectional BFS seeded from zone-handle edges
├── findZoneByStructure             (preferred: read precomputed zone membership)
└── isNodeReachableToBoundary

addDuplicateHandlesToSwitchNodesAfterInference
├── isSwitchNode
├── addSwitchInferDuplicateToNode
│   ├── constructTypeOfHandleFromIndices
│   └── insertOrDeleteHandleInNodeDataUsingHandleIndices
├── getSwitchStructureFromNode
└── inferTypeAcrossTheNodeForHandleOfDataType (propagates to the sibling)

ADD_SWITCH (applyPlan)
├── generateRandomString (two node ids + bind edge id)
├── constructNodeOfType (switchStart, switchEnd)
├── setCurrentNodesAndEdgesToStateWithMutatingState
├── createSwitchZones
└── setCurrentZonesToState

compileSwitchStructures
├── getSwitchStructureFromNode
├── findZoneByStructure / getNodesInSwitchRegion
├── topologicalSortWithLevels (per branch)
├── compileGroupScopes (for group instances inside a branch)
└── isBindSwitchNodesEdge

executeSwitchBlock
├── flattenInputs / getDataHandleIds / findConditionInputId
├── resolveConditionValue
├── ValueStore (set both zones, read the chosen zone)
├── ExecutionRecorder (beginSwitchStructure / completeSwitchStructure)
├── executeStandardNode (branch step execution)
└── executeOneStep (nested loops/switches/groups in a branch)
```

## Data Flow Diagram

```
                       ┌──────────────────────────────────────────────┐
                       │               SWITCH STRUCTURE               │
                       │                                              │
  upstream ─> [infer]─>│  switchStart ── condition (bool) ── ?        │
                       │      │                                       │
                       │      ├── True-zone outputs ─> [TRUE branch]──┼─> switchEnd ─> [infer out] ─> downstream
                       │      │                          true-zone in │
                       │      └── False-zone outputs ─> [FALSE branch]┼─> switchEnd (false-zone in)
                       │                                              │
                       └──────────────────────────────────────────────┘

  Data:   switchStart copies each input value to BOTH zones' outputs.
          Only the branch matching `condition` actually executes.
          switchEnd reads the executed zone's inputs into its outputs:
            condition = true  -> read true-zone inputs
            condition = false -> read false-zone inputs
```

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          STATE MANAGEMENT                               │
│                                                                         │
│  standardNodes.ts          nodes/switches/        planApply/             │
│  ┌──────────────┐    ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ switchStart  │    │ isSwitchNode()        │  │ validators.ts:       │ │
│  │ switchEnd    │    │ getSwitchStructure    │  │   ADD_SWITCH         │ │
│  │ handle index │    │   FromNode()          │  │   UPDATE_SWITCH      │ │
│  │ constants    │    │ getNodesInSwitch      │  │ validateAddEdge.ts:  │ │
│  │ data types:  │    │   Region()            │  │   isSwitchConnection │ │
│  │  switchInfer │    │ getZoneHandleIds()    │  │     Valid() (step 7b)│ │
│  │  condition   │    │ isSwitchConnection    │  │ applyPlan.ts:        │ │
│  │  bindSwitch  │    │   Valid()             │  │   ADD_SWITCH         │ │
│  │  Nodes       │    │ addDuplicateHandles   │  │   UPDATE_SWITCH      │ │
│  └──────────────┘    │   ToSwitchNodesAfter  │  │   applySwitchZone    │ │
│                      │   Inference()         │  │     PrefixesOnDraft  │ │
│                      └──────────────────────┘  └──────────────────────┘ │
│                                                                         │
│  zones/zoneLifecycle.ts                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ createSwitchZones() — two enforced zones (True/False Branch)       │ │
│  │ recomputeAllZoneMemberships() / rehydrateAllZones()                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                            RUNNER                                       │
│                                                                         │
│  switchCompiler.ts            executor/                 types.ts         │
│  ┌──────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │ compileSwitch-   │    │ executeSwitchBlock()│    │ SwitchExecution-│ │
│  │   Structures()   │───>│   condition resolve │    │   Block         │ │
│  │ isBindSwitch     │    │   run one branch    │    │ SwitchPhase     │ │
│  │   NodesEdge()    │    │   collect outputs   │    │ SwitchRecord    │ │
│  └──────────────────┘    └─────────────────────┘    └─────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                          UI / GRAPH                                      │
│                                                                         │
│  FullGraph.tsx                          molecules/                      │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐   │
│  │ createSwitchMenuItem ->      │   │ SwitchEditDrawer             │   │
│  │   ADD_SWITCH                 │   │   (editSwitch drawer)        │   │
│  │ editSwitch drawer ->         │   │ switchLevelConversion.ts     │   │
│  │   UPDATE_SWITCH              │   │   SwitchHandleLevel          │   │
│  └──────────────────────────────┘   └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Switch Pair

### switchStart

The entry point of the switch. Receives the data values to be routed on its
infer input(s) and a boolean `condition`. It copies each input value to **both**
its true-zone and false-zone output handles, so whichever branch runs has the
value available.

**Initial handles** (from `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

- `input[0]` — switchInfer (`inferFromConnection`) — incoming data to route
- `input[1]` — condition (boolean) — "Condition"; selects the branch
- `output[0]` — bindSwitchNodes — structural connection to switchEnd
- `output[1]` — switchInfer — **true-zone** output (data into the true branch)
- `output[2]` — switchInfer — **false-zone** output (data into the false branch)

### switchEnd

The exit point. Collects the results of the branch that ran (true-zone inputs or
false-zone inputs) and forwards them to its outputs for downstream consumption.

**Initial handles** (from `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

- `input[0]` — bindSwitchNodes — structural connection from switchStart
- `input[1]` — switchInfer — **true-zone** input (result from the true branch)
- `input[2]` — switchInfer — **false-zone** input (result from the false branch)
- `output[0]` — switchInfer — routed result to downstream nodes

### Handle Index Mapping Table

This reflects the **initial** single-channel layout. After type inference adds
data channels, the true/false zones grow (see
[Dynamic Handle Addition](#dynamic-handle-addition-for-switches)).

| Node        | Direction | Index | Handle Type     | Data Type       | Purpose                               |
| ----------- | --------- | ----- | --------------- | --------------- | ------------------------------------- |
| switchStart | input     | 0     | switchInfer     | switchInfer     | Incoming data to route                |
| switchStart | input     | 1     | condition       | condition       | Boolean: choose true/false branch     |
| switchStart | output    | 0     | bindSwitchNodes | bindSwitchNodes | Structural link to switchEnd          |
| switchStart | output    | 1     | switchInfer     | switchInfer     | True-zone output (into true branch)   |
| switchStart | output    | 2     | switchInfer     | switchInfer     | False-zone output (into false branch) |
| switchEnd   | input     | 0     | bindSwitchNodes | bindSwitchNodes | Structural link from switchStart      |
| switchEnd   | input     | 1     | switchInfer     | switchInfer     | True-zone input (true result)         |
| switchEnd   | input     | 2     | switchInfer     | switchInfer     | False-zone input (false result)       |
| switchEnd   | output    | 0     | switchInfer     | switchInfer     | Routed result to downstream           |

Handle index constants are exported from
`src/utils/nodeStateManagement/standardNodes.ts` ›
`switchStartInputInferHandleIndex`:

- `switchStartInputInferHandleIndex = 0`
- `switchStartInputConditionHandleIndex = 1`
- `switchStartOutputInferTrueHandleIndex = 1`
- `switchStartOutputInferFalseHandleIndex = 2`
- `switchEndInputInferTrueHandleIndex = 1`
- `switchEndInputInferFalseHandleIndex = 2`
- `switchEndOutputInferHandleIndex = 0`

`getSwitchNodeInferHandleIndex(nodeTypeUniqueId, 'input' | 'output')`
(`src/utils/nodeStateManagement/nodes/switches/switchIdentification.ts` ›
`getSwitchNodeInferHandleIndex`) returns the start-of-zone infer index for a
given switch node: for `switchStart` it returns
`switchStartInputInferHandleIndex` / `switchStartOutputInferTrueHandleIndex`;
for `switchEnd` it returns `switchEndInputInferTrueHandleIndex` /
`switchEndOutputInferHandleIndex`.

### The SwitchStructure type

`getSwitchStructureFromNode`
(`src/utils/nodeStateManagement/nodes/switches/switchStructure.ts` ›
`getSwitchStructureFromNode`) resolves the pair from either node by following
the single `bindSwitchNodes` edge. It returns a `SwitchStructure`
(`src/utils/nodeStateManagement/nodes/switches/types.ts` › `SwitchStructure`):

```ts
type SwitchStructure = {
  switchStart: State['nodes'][number];
  switchEnd: State['nodes'][number];
};
```

**Algorithm:**

- If starting from **switchStart**: read its `output[0]` (bindSwitchNodes)
  handle id, find the edge whose `sourceHandle` matches, and resolve the target
  node; it must be a `switchEnd`.
- If starting from **switchEnd**: read its `input[0]` (bindSwitchNodes) handle
  id, find the edge whose `targetHandle` matches, and resolve the source node;
  it must be a `switchStart`.
- Returns `undefined` if the bind edge or the correctly-typed partner is missing
  (an incomplete structure).

## Standard Data Types for Switches

These are registered in `standardDataTypes`
(`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypes`). Note
that `condition` is **shared** with the loop system (same data type);
`switchInfer` and `bindSwitchNodes` are switch-specific.

### switchInfer (`inferFromConnection`)

- **Name:** "Switch Infer"
- **Underlying type:** `inferFromConnection` — resolves to the concrete type of
  the connected handle
- **Color:** `#333333`
- Used on all data infer handles across the pair. When connected, the type is
  inferred from the other end and propagated to the sibling node.

### condition (`boolean`)

- **Name:** "Condition"
- **Underlying type:** `boolean`
- **Color:** `#cca6d6`
- **allowInput:** `true` — users can type a default value in the UI
- Used on switchStart's `input[1]`. When `true`, the true branch runs; when
  `false`, the false branch runs.

### bindSwitchNodes (`noEquivalent`)

- **Name:** "Bind Switch Nodes"
- **Underlying type:** `noEquivalent` — cannot carry data at runtime
- **Color:** `#8c52d1`
- **maxConnections:** `1` — exactly one switchStart→switchEnd link
- Structural-only connection that ties the pair together. The compiler skips
  these edges (`isBindSwitchNodesEdge`,
  `src/utils/nodeRunner/switchCompilerHelpers.ts` › `isBindSwitchNodesEdge`)
  when building branch adjacency lists.

## Adding a Switch (`ADD_SWITCH`)

`ADD_SWITCH` is dispatched from the canvas context menu via
`createSwitchMenuItem`
(`src/components/molecules/ContextMenu/createSwitchMenuItem.ts` ›
`createSwitchMenuItem`), which renders an "Add Switch" entry (GitBranch icon):

```ts
dispatch({
  type: actionTypesMap.ADD_SWITCH,
  payload: { position: contextMenuPosition },
});
```

### Validation (`src/utils/nodeStateManagement/planApply/validators.ts` › `ADD_SWITCH`)

The validator checks that both `switchStart` and `switchEnd` exist in
`state.typeOfNodes` (they are part of the standard set merged into every graph).
If either is missing it returns
`err({ code: 'NODE_TYPE_NOT_FOUND', nodeType: 'switchStart/switchEnd' })`.
Otherwise it returns the plan:

```ts
type AddSwitchPlan = {
  kind: 'ADD_SWITCH';
  position: XYPosition;
};
```

### Apply (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_SWITCH`)

The `ADD_SWITCH` plan kind:

1. Mints two node ids and constructs `switchStart` and `switchEnd` via
   `constructNodeOfType`. `switchEnd` is placed `spreadX = 600` px to the right
   of `switchStart`.
2. Mints a `bindSwitchNodes` edge connecting `switchStart.output[0]` →
   `switchEnd.input[0]` (`type: 'configurableEdge'`).
3. Writes both nodes and the bind edge to the current scope via
   `setCurrentNodesAndEdgesToStateWithMutatingState`.
4. Creates two enforced zones with
   `createSwitchZones(switchStartId, switchEndId)` and merges them into the
   current scope's zones (the `handleToZone` index is reset to `{}` and rebuilt
   later by zone maintenance).

> At creation time the switch has **no data channels** yet — only the condition
> and the structural bind. Data channels (true/false infer handles) appear once
> a `switchInfer` handle is connected (see below).

## Dynamic Handle Addition for Switches

### addDuplicateHandlesToSwitchNodesAfterInference

Located in `src/utils/nodeStateManagement/nodes/switches/switchHandleSync.ts` ›
`addDuplicateHandlesToSwitchNodesAfterInference`. Called from the `ADD_EDGE`
plan in `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`
(step "4b") when type inference occurs on a switch node's infer handle.

**Mechanism:**

When a `switchInfer` handle is connected (and thus inferred to a concrete type),
`addSwitchInferDuplicateToNode`
(`src/utils/nodeStateManagement/nodes/switches/switchHandleSync.ts` ›
`addSwitchInferDuplicateToNode`) adds new template handles so the next data
channel can be wired:

- **switchStart:** insert **1** new data input (just before the `condition`
  handle) and **2** new outputs — one appended at the end of the true zone and
  one appended at the end of the false zone.
- **switchEnd:** insert **2** new inputs (one at the end of the true zone, one
  at the end of the false zone) and **1** new output (appended).

After processing the directly-connected switch node, the function resolves the
`SwitchStructure` and **propagates the inferred type to the sibling** node via
`inferTypeAcrossTheNodeForHandleOfDataType` (with `overrideDataType` and
`overrideName`), then calls `addSwitchInferDuplicateToNode` on the sibling too.
This keeps the true/false zones symmetric across the pair so every channel has a
matching `switchStart` output and `switchEnd` input.

### Zone prefixing (`applySwitchZonePrefixesOnDraft`)

Located in `src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`applySwitchZonePrefixesOnDraft`, called from the `ADD_EDGE` plan ("4b-post")
after the duplicate handles are added. For each zoned handle (the data handles
between the first and last handle of the relevant side), if the name is
non-empty and not already prefixed, it prepends `True: ` or `False: ` based on
whether the handle's data index falls in the first `Math.ceil(dataCount / 2)`
(true zone) or the remainder (false zone). It applies the same prefixing to the
sibling node.

After prefixing, handle names are de-duplicated with
`ensureAllHandleNamesUnique` ("4b-post2") so that, e.g., two `True: Output`
handles in the same zone get suffixed, while `True: X` and `False: X` remain
distinct.

### Zone split rule

The split between true and false is computed wherever zone membership is needed
(`src/utils/nodeStateManagement/nodes/switches/switchRegion.ts` ›
`splitIntoZones`, `src/utils/nodeRunner/executor/executeSwitchBlock.ts` ›
`executeSwitchBlock`, `src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
`recomputeAllZoneMemberships`): given `count` data handles, the first
`trueCount = Math.ceil(count / 2)` are the true zone and the rest are the false
zone. With one channel: true has 1, false has 1. With three channels: true has
2, false has 1.

## Switch Zones

Adding a switch creates two **enforced** zones via `createSwitchZones`
(`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createSwitchZones`):

| Zone         | Name           | Color     | structureLink.zoneRole | enforced |
| ------------ | -------------- | --------- | ---------------------- | -------- |
| True branch  | "True Branch"  | `#4ade80` | `trueBranch`           | `true`   |
| False branch | "False Branch" | `#f87171` | `falseBranch`          | `true`   |

Both zones carry
`structureLink: { structureType: 'switch', structureId: switchStartId, zoneRole }`
and `boundaryHandles` keyed by the two switch node ids (the `switchStart` zone
outputs and the `switchEnd` zone inputs). Zone `nodeIds` start empty and are
recomputed on every edge change by the zone maintenance helpers. Zones are
looked up by structure via `findZoneByStructure`.

`getZoneHandleIds`
(`src/utils/nodeStateManagement/nodes/switches/switchRegion.ts` ›
`getZoneHandleIds`) returns the four sets of zoned handle ids by reading the
live handles off the nodes and splitting the data handles into zones:

```ts
type ZoneHandleIds = {
  switchStartTrueOutputIds: Set<string>;
  switchStartFalseOutputIds: Set<string>;
  switchEndTrueInputIds: Set<string>;
  switchEndFalseInputIds: Set<string>;
};
```

`getNodesInSwitchRegion`
(`src/utils/nodeStateManagement/nodes/switches/switchRegion.ts` ›
`getNodesInSwitchRegion`) is the BFS fallback used when no precomputed zones
exist. It seeds the true/false sets from the edges connected to the zoned
handles, then expands each set via bidirectional BFS (`getOutgoers` /
`getIncomers`) while treating the two switch nodes as boundaries. It returns
`{ nodesInTrueBranch, nodesInFalseBranch }`.

For the complete zone subsystem (frame rendering, membership maintenance, export
stripping), see [Zones](zonesDoc.md).

## Switch Connection Validation

### isSwitchConnectionValid

Located in `src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
`isSwitchConnectionValid`. Called from the 13-step edge gauntlet as **step 7b**
in `src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
`validateAddEdge`, right after loop validation. A rejection produces
`err({ code: 'SWITCH_PATH_INVALID', reason })`. When zones are present in
`state.zones`, the function reads branch membership from the precomputed zones;
otherwise it falls back to `getNodesInSwitchRegion`.

**Three cases:**

1. **Neither node is a switch node**
   (`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
   `isSwitchConnectionValid`): for every switch in the graph, look up its
   true/false branch membership. Reject if the source is in one branch and the
   target is in the other ("Can't connect nodes across true and false branches
   of the same switch"). If exactly one endpoint is inside a branch and the
   other is outside, the outside node must be **isolated** (not reachable to
   either switch boundary) — otherwise reject ("Can't connect between inside and
   outside a switch branch without going through Switch Start/End").

2. **Both nodes are switch nodes**
   (`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
   `isSwitchConnectionValid`):
   - If either handle is `bindSwitchNodes`, the only valid order is
     `switchStart → switchEnd`.
   - Otherwise both must resolve to complete structures. For a direct
     passthrough **within the same switch** (`switchStart → switchEnd`), the
     zones must match — a true-zone output cannot connect to a false-zone input
     and vice versa ("Can't connect across true and false zones in
     passthrough"). Data may only flow from `switchStart` to `switchEnd` within
     one switch.

3. **One switch node, one regular node**
   (`src/utils/nodeStateManagement/nodes/switches/switchValidation.ts` ›
   `isSwitchConnectionValid`): the switch structure must be complete. Determine
   the switch handle's zone (`true` / `false` / `none`) and the other node's
   branch region:
   - **Zoned switch handle + external node:** the external node must be
     isolated; otherwise reject ("External nodes cannot connect to zone handles.
     Connect to Switch Start inputs or Switch End outputs instead.").
   - **Zoned handle + in-branch node:** the zone must match the node's region
     (true-zone handle ↔ true-region node, false ↔ false).
   - **Non-zoned switch handle (bind / condition / plain data) + in-branch
     node:** a body node cannot receive from a `switchEnd` non-zoned output, and
     cannot send to a `switchStart` non-zoned input — body nodes interact with
     the switch only through zone handles.

### Valid and Invalid Connection Patterns

**Valid:**

- `upstream → switchStart.input[infer]`
- `upstream → switchStart.input[condition]`
- `switchStart.output[True: …] → trueBranchNode`
- `switchStart.output[False: …] → falseBranchNode`
- `trueBranchNode → switchEnd.input[True: …]`
- `falseBranchNode → switchEnd.input[False: …]`
- `switchEnd.output[infer] → downstream`
- `switchStart.output[bindSwitchNodes] → switchEnd.input[bindSwitchNodes]`
- `switchStart.output[True: X] → switchEnd.input[True: Y]` (direct passthrough,
  same zone)
- Two body nodes within the same branch

**Invalid:**

- `trueBranchNode → falseBranchNode` (cross-branch)
- `switchStart.output[True: …] → switchEnd.input[False: …]` (cross-zone
  passthrough)
- `externalNode → switchStart.output[True: …]` (external must use Switch Start
  inputs / Switch End outputs, unless isolated)
- `switchEnd.input[bindSwitchNodes] ← switchStart` in the wrong order
- A body node sending into a `switchStart` non-zoned input or receiving from a
  `switchEnd` non-zoned output

> Switch pairs share the same atomic-deletion guard as loop triplets:
> `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` ›
> `canRemoveStructuredNodesAndEdges` (historically
> `canRemoveLoopNodesAndEdges`), invoked from `FullGraph`'s `onBeforeDelete`.
> Deleting only one of `switchStart` / `switchEnd` is rejected ("Switch nodes
> must be removed together, can't partially remove them"). After a valid
> deletion the removal flows through the normal `UPDATE_NODES_RF` /
> `UPDATE_EDGES_RF` paths and zone membership is recomputed.

## Editing a Switch (`UPDATE_SWITCH`)

Switches are edited through the **Switch Edit Drawer**
(`src/components/molecules/SwitchEditDrawer/SwitchEditDrawer.tsx` ›
`SwitchEditDrawer`), opened via the `editSwitch` drawer
(`activeDrawer: { type: 'editSwitch', nodeId }`). The drawer lets the user
reorder and rename **data channels** — each channel is one row spanning all six
zoned/data handles of the pair.

### The SwitchHandleLevel model

`src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts` ›
`SwitchHandleLevel` defines the per-channel model and extracts it from the live
node handles:

```ts
type SwitchHandleLevel = {
  id: string; // the switchStart input handle id (stable key)
  dataTypeUniqueId: string;
  dataTypeColor: string;
  handles: {
    switchStartIn: { id: string; name: string };
    switchStartTrueOut: { id: string; name: string };
    switchStartFalseOut: { id: string; name: string };
    switchEndTrueIn: { id: string; name: string };
    switchEndFalseIn: { id: string; name: string };
    switchEndOut: { id: string; name: string };
  };
};
```

`extractLevelsFromSwitchNodes`
(`src/components/molecules/SwitchEditDrawer/switchLevelConversion.ts` ›
`extractLevelsFromSwitchNodes`) reconstructs the levels by stripping the
structural `bind` and trailing template handles, then zipping the `switchStart`
inputs, the two `switchStart` output zones, the two `switchEnd` input zones, and
the `switchEnd` outputs by index. `getCommonName` and `stripZonePrefix` help
present a single editable name per channel by removing the `True: ` / `False: `
prefixes.

### Save flow

`src/components/organisms/FullGraph/FullGraph.tsx` › `editSwitchPair` resolves
the editing pair with `getSwitchStructureFromNode` and dispatches on save
(`src/components/organisms/FullGraph/FullGraph.tsx` › `handleSaveSwitch`):

```ts
dispatch({
  type: actionTypesMap.UPDATE_SWITCH,
  payload: {
    switchStartNodeId,
    switchEndNodeId,
    levels: levels.map((l) => ({ handles: l.handles })),
  },
});
// then requestAnimationFrame(() => updateNodeInternals([startId, endId]))
```

### Validation (`src/utils/nodeStateManagement/planApply/validators.ts` › `UPDATE_SWITCH`)

Resolves both switch nodes in the current scope (else `INVALID_NODE_GROUP` "One
or more switch nodes not found"). It then checks the six handle slots —
`switchStartIn`, `switchStartTrueOut`, `switchStartFalseOut`, `switchEndTrueIn`,
`switchEndFalseIn`, `switchEndOut` — for duplicate names within a slot,
rejecting with `INVALID_NODE_GROUP` "Duplicate handle name in {slot}". On
success it returns the `UpdateSwitchPlan`:

```ts
type UpdateSwitchPlan = {
  kind: 'UPDATE_SWITCH';
  switchStartNodeId: string;
  switchEndNodeId: string;
  levels: Array<{
    handles: {
      switchStartIn: { id: string; name: string };
      switchStartTrueOut: { id: string; name: string };
      switchStartFalseOut: { id: string; name: string };
      switchEndTrueIn: { id: string; name: string };
      switchEndFalseIn: { id: string; name: string };
      switchEndOut: { id: string; name: string };
    };
  }>;
};
```

### Apply (`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `UPDATE_SWITCH`)

`UPDATE_SWITCH` uses a local `reorderSwitchHandles` helper to rewrite each side:

- **switchStart inputs** (`[data…, condition, template]`) — **not zoned**;
  reordered by `switchStartIn` updates, leaving the fixed prefix (none) and
  trailing templates in place.
- **switchStart outputs**
  (`[bind, trueData…, trueTemplate, falseData…, falseTemplate]`) — **zoned**;
  `startIndex = 1` (skip bind); true and false data are reordered independently,
  each followed by its half of the templates.
- **switchEnd inputs**
  (`[bind, trueData…, trueTemplate, falseData…, falseTemplate]`) — **zoned**;
  same as switchStart outputs.
- **switchEnd outputs** (`[data…, template]`) — **not zoned**.

Names from the plan are written onto the matched handles by id; handles not in
the update set are treated as templates and kept at the end of their zone.

`UPDATE_SWITCH` (and `ADD_SWITCH`) are **undoable** — they are not in
`NON_UNDOABLE_PLAN_KINDS`, so they participate in the Immer-patch history.

## Switches in the Runner

### Switch Compilation (`compileSwitchStructures`)

Located in `src/utils/nodeRunner/switchCompiler.ts` › `compileSwitchStructures`.
Runs as **Phase 3b** of the compiler (`src/utils/nodeRunner/compiler.ts` ›
`compile`).

**Steps:**

1. Find all `switchStart` nodes.
2. For each, resolve the pair via `getSwitchStructureFromNode`.
3. Determine true/false branch node sets — preferring the precomputed zones
   (`findZoneByStructure(..., 'trueBranch' | 'falseBranch')`), falling back to
   `getNodesInSwitchRegion`.
4. For each branch, build adjacency lists over the branch nodes only (excluding
   `bindSwitchNodes` edges), topologically sort via `topologicalSortWithLevels`,
   compile any group instances as `GroupExecutionScope` steps, and emit
   `standard` steps for the rest.
5. Package both branches into a `SwitchExecutionBlock` and collect all
   switch-related node ids (start, end, both branches) for exclusion from the
   main topological sort.

The main compiler treats each switch as a single node using `switchStartNodeId`
as a **proxy** (`src/utils/nodeRunner/compiler.ts` › `compile`): all switch node
ids map to the proxy so upstream/downstream dependencies of the whole switch are
honored in the top-level sort.

### Switch Execution (`executeSwitchBlock`)

Located in `src/utils/nodeRunner/executor/executeSwitchBlock.ts` ›
`executeSwitchBlock`. Runs exactly **one** branch.

**Steps:**

1. **Record start:**
   `recorder.beginSwitchStructure(switchStructureId, switchStartNodeId, switchEndNodeId)`
   (the structure id is the `switchStartNodeId`).
2. **Resolve handle layout:** flatten inputs, gather data input/output ids on
   both nodes via `getDataHandleIds`, and find the condition input via
   `findConditionInputId`. Validate that `switchStart` data inputs, `switchEnd`
   data outputs, and the data-handle count are consistent and that a condition
   exists — otherwise error the structure.
3. **Resolve condition:** `resolveConditionValue` reads the boolean from the
   condition source edge, or from the inline `allowInput` value if unconnected.
4. **Set switchStart outputs:** copy each resolved input value to **both** the
   corresponding true-zone output and false-zone output
   (`trueOutputCount = Math.ceil(startDataOutputIds.length / 2)`). Record the
   `switchStart` step with `switchPhase: 'switchStart'` and
   `branchTaken: conditionValue`.
5. **Execute the chosen branch:** pick `trueBranchSteps` or `falseBranchSteps`
   based on the condition, group steps by `concurrencyLevel`, skip nodes whose
   inputs come from errored/skipped sources, and execute the rest (sequentially
   when stepping, otherwise via `Promise.allSettled`). Steps run with
   `switchPhase: 'trueBranch'` or `'falseBranch'` and a `switchContext`.
6. **Collect switchEnd outputs:** for each channel, read the **executed zone's**
   input (true-zone inputs when condition is true, false-zone inputs otherwise),
   skipping values from errored sources, and write them to the `switchEnd`
   outputs. Record the `switchEnd` step.
7. **Record completion:**
   `recorder.completeSwitchStructure(switchStructureId, conditionValue)`, mark
   both switch nodes completed.

**Error handling:** `resolveConditionValue` is called **without** the
`erroredSourceNodes` set, so it does not explicitly short-circuit to `false` for
an errored condition source. Instead it reads the condition source from the
`ValueStore` and coerces with `Boolean(...)`; an errored or unwritten source has
no stored value (`undefined`), which coerces to `false` (the false branch runs).
An unconnected condition falls back to the inline `allowInput` value (also
`Boolean`-coerced), defaulting to `false`. Per-branch errored/skipped nodes are
tracked locally; downstream nodes in the branch are skipped accordingly.

### SwitchExecutionBlock Type

```ts
type SwitchExecutionBlock = {
  kind: 'switch';
  switchStartNodeId: string;
  switchEndNodeId: string;
  trueBranchSteps: ReadonlyArray<ExecutionStep>;
  falseBranchSteps: ReadonlyArray<ExecutionStep>;
  concurrencyLevel: number; // assigned by the main compiler
};
```

### SwitchPhase / SwitchRecord Types

```ts
type SwitchPhase = 'switchStart' | 'trueBranch' | 'falseBranch' | 'switchEnd';

type SwitchRecord = {
  switchStructureId: string; // same as switchStartNodeId
  switchStartNodeId: string;
  switchEndNodeId: string;
  branchTaken: boolean; // which branch ran
  startTime: number;
  endTime: number;
  duration: number;
  stepRecords: ReadonlyArray<ExecutionStepRecord>;
  nestedLoopRecords: ReadonlyMap<string, LoopRecord>;
  nestedSwitchRecords: ReadonlyMap<string, SwitchRecord>;
};
```

The `ExecutionRecord` stores switch records in
`switchRecords: ReadonlyMap<switchStructureId, SwitchRecord>`
(`src/utils/nodeRunner/executionRecorder.ts` › `ExecutionRecorder`). Each
`ExecutionStepRecord` inside a branch carries `switchPhase`,
`switchStructureId`, and `branchTaken`. The
[Execution Timeline](../ui/executionTimelineDoc.md) renders switches as their
own track using these fields.

## Limitations and Notes

- **One branch per run:** exactly one of the two branches executes, selected by
  the condition. The other branch's nodes are not executed for that run.
- **Both zones receive inputs:** `switchStart` writes its input values to both
  zones' outputs regardless of the condition, but only the selected branch
  consumes them.
- **Condition default on error:** the condition is read via
  `resolveConditionValue` and coerced with `Boolean(...)`. An errored condition
  source leaves no value in the `ValueStore`, so the condition resolves to
  `false` (the false branch runs). Note this is incidental coercion of the
  missing value — the switch does not pass an `erroredSourceNodes` set to
  `resolveConditionValue`, so there is no explicit errored-source short-circuit
  (unlike the loop-stop condition path).
- **Symmetric channels:** every data channel has a matching true output, false
  output, true input, and false input. Channels are added in symmetric pairs by
  the inference-duplication mechanism; the editor reorders/renames them as whole
  channels.
- **No standalone switch nodes:** `switchStart` / `switchEnd` are hidden from
  the "Add Node" menu and are only meaningful as a bound pair created by
  `ADD_SWITCH`.

## Examples

### Basic conditional route

```
                    ┌── True: ──> [DoubleIt] ──> True: ──┐
[Value] ─> switchStart                                   switchEnd ─> [Display]
   [cond] ─^        └── False: ─> [NegateIt] ─> False: ──┘
```

- `condition = true` → `DoubleIt` runs; `Display` receives `2 * Value`.
- `condition = false` → `NegateIt` runs; `Display` receives `-Value`.

### Direct passthrough (no body)

```
switchStart.output[True: X]  ──> switchEnd.input[True: X]
switchStart.output[False: X] ──> switchEnd.input[False: X]
```

The value passes straight through the selected zone with no body nodes. Crossing
zones (`True: X → False: X`) is rejected.

### Nested constructs

A branch body can contain node groups, loops, or other switches. The compiler
recurses into them (`compileGroupScopes`, `executeOneStep`), so a switch branch
may itself host a loop or an inner switch that runs only when that branch is
selected.

## Relationships with Other Features

### -> [Data Types (`switchInfer`, `condition`, `bindSwitchNodes`)](../core/dataTypesDoc.md)

Switch-specific data types are registered in `standardDataTypes` in
`src/utils/nodeStateManagement/standardNodes.ts` › `standardDataTypes`. They use
the existing data type system's support for `inferFromConnection`, `boolean`,
and `noEquivalent` underlying types. `condition` is shared with the loop system.

### -> [Handles (dynamic handle addition)](../core/handlesDoc.md)

When infer handles are connected,
`addDuplicateHandlesToSwitchNodesAfterInference` uses the handle insertion
system (`insertOrDeleteHandleInNodeDataUsingHandleIndices`) to add symmetric
true/false channels, then zone-prefixes the names.

### -> [Type Inference (triggers inference on switch nodes)](../core/typeInferenceDoc.md)

`switchInfer` handles infer their type on connection. The switch system
propagates the inferred type to the sibling node so both halves of the pair stay
type-consistent.

### -> [Zones (true/false branch regions)](zonesDoc.md)

`createSwitchZones` produces two enforced zones (`True Branch`, `False Branch`)
keyed to the pair via `structureLink`. Zone membership is recomputed on edge
changes and drives both connection validation and branch compilation.

### -> [Nodes (standard node types)](../core/nodesDoc.md)

Switch nodes are standard node types (`switchStart`, `switchEnd`) registered
alongside group and loop nodes. They are hidden from the "Add Node" context
menu.

### -> [Edges (switch connection validation)](../core/edgesDoc.md)

`isSwitchConnectionValid` runs as step 7b of `validateAddEdge`. It enforces
branch isolation, zone matching, bind order, and structural completeness.

### -> [State Management (ADD_SWITCH / UPDATE_SWITCH)](../core/stateManagementDoc.md)

`ADD_SWITCH` and `UPDATE_SWITCH` are validated in
`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction` and
applied in `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `applyPlan`
(both undoable). The `Plan` union includes `AddSwitchPlan` and
`UpdateSwitchPlan`; the `ValidationError` taxonomy includes
`SWITCH_PATH_INVALID`.

### -> [Runner (switch compilation and execution)](../runner/runnerHookDoc.md)

The compiler (`compileSwitchStructures`) transforms each switch into a
`SwitchExecutionBlock`. The executor (`executeSwitchBlock`) resolves the
condition, runs one branch, and records a `SwitchRecord`.

### -> [Connection Validation (special switch validation)](connectionValidationDoc.md)

Beyond standard type compatibility, switch connections undergo branch-region
validation, zone matching, bind-order validation, and isolation checks.

### -> [Editor Drawers (the switch editor)](../ui/editorsDoc.md)

The `SwitchEditDrawer` (opened via the `editSwitch` drawer) edits data channels
as `SwitchHandleLevel` rows and dispatches `UPDATE_SWITCH` on save.

### -> [Loops (the sibling structure)](loopsDoc.md)

Loops are the iterative counterpart to switches: a three-node triplet with a
single body region, versus the switch's two-node pair with true/false branch
zones. Both share the `condition` data type and the zone subsystem.
