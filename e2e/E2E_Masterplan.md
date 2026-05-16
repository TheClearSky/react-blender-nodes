# E2E Test Masterplan: Loops Coverage

This document is a complete, self-contained reference for writing E2E tests for
the loop feature in `@theclearsky/react-blender-nodes`. Any agent reading this
document should have **everything** needed to implement a test without
consulting other sources.

---

## Part 1 — Project Context (How the System Works)

### 1.1 What the library is

`@theclearsky/react-blender-nodes` (v0.0.11 beta) is a React library that embeds
a Blender-inspired node-based graph editor. Consumers import `<FullGraph>` and
use the graph to build data-flow graphs. Optionally they provide
`functionImplementations` to make the graph executable.

### 1.2 Core subsystems we interact with in E2E

- **FullGraph** — the React component that renders the interactive canvas
  (ReactFlow-based). Right-click opens a context menu. Nodes can be dragged,
  connected via handles, deleted via keyboard.
- **Runner** — compiles the graph into an `ExecutionPlan` and runs it, producing
  an `ExecutionRecord`. Invoked via the UI's Run button.
- **NodeRunnerPanel** — the drawer at the bottom of the canvas with
  RunControls + ExecutionTimeline + ExecutionStepInspector.
- **State management** — reducer with 11 actions now migrated to Plan/Apply
  architecture (Phase 2 complete). Validation is pure; invalid actions are
  silently discarded.

### 1.3 How a graph is constructed by the user

1. **Add node:** right-click canvas → "Add Node" → `<Category>` → `<Node Name>`
   - Available categories: "Standard Nodes", "Logic Gates", "Utility", "I/O"
   - "Standard Nodes" contains: Group Input, Group Output, Loop Start, Loop
     Stop, Loop End
   - Logic Gates contains: AND, OR, NOT, XOR, NAND, NOR, Buffer, Bit Input, Bit
     Output
   - Utility contains: Counter (number math)
2. **Draw edge:** drag from source handle (right side of a node) to target
   handle (left side of a node)
3. **Delete:** select node(s)/edge(s) and press Backspace/Delete/x

### 1.4 How loops work

A **loop** is a triplet of three built-in standard nodes connected by special
`bindLoopNodes` edges:

```
  ┌──────────┐    bindLoopNodes    ┌──────────┐    bindLoopNodes    ┌────────┐
  │loopStart │ ─────────────────▶ │ loopStop │ ─────────────────▶ │loopEnd │
  └────┬─────┘                     └─────┬────┘                     └────┬───┘
       │                                 │                               │
       │ iteration data                  │ feedback to next iter         │ final output
       ▼                                 │                               │
   [body nodes]                          ▼                               ▼
       │                            condition: Continue If True     downstream
       └──────── outputs feed ─────────┘
```

**Concepts:**

- **bindLoopNodes edges** — user must manually drag these from loopStart's first
  output ("Bind Loop Nodes") to loopStop's first input, and from loopStop's
  first output to loopEnd's first input. These have `maxConnections: 1` and type
  `bindLoopNodes`.
- **Loop body** — nodes in the region between loopStart and loopStop. Execute
  once per iteration.
- **Post-stop region** — nodes between loopStop and loopEnd. Execute once, after
  the loop finishes.
- **LoopInfer handles** — starting empty, these get their data type inferred
  when the user connects data into loopStart. When inferred, a matching handle
  is auto-duplicated on loopStop and loopEnd to maintain symmetry.
- **Condition input on loopStop** — "Continue If Condition Is True" accepts a
  boolean. `true` = another iteration. `false` = exit to loopEnd.
- **Max iterations** — user-set limit (default 100) to prevent infinite loops.
  Exceeding throws an error.

### 1.5 How the runner works

1. User clicks **Run** → `useNodeRunner` calls `compile(state)` producing an
   `ExecutionPlan`.
2. `execute(plan)` runs:
   - In **instant mode:** runs all steps, no pauses.
   - In **step-by-step mode:** yields after each step; user advances with the
     Step button.
3. Each node execution produces an `ExecutionStepRecord` (nodeId, inputValues,
   outputValues, status, timing).
4. Loops produce a `LoopRecord` with per-iteration `LoopIterationRecord`s (each
   containing its own body stepRecords + conditionValue).
5. When done, the `ExecutionRecord` is stored and the timeline UI updates.

### 1.6 How to verify execution in the DOM

Key DOM signals for Playwright assertions:

| What                  | Where                                         | How                                                           |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Runner state text     | NodeRunnerPanel header                        | Text: "Idle", "Running", "Paused", "Completed", "Error"       |
| Total duration        | NodeRunnerPanel timeline                      | e.g. "2.8ms" text in the timeline toolbar                     |
| Node visual state     | Each `.react-flow__node`                      | Classes and data attributes reflect running/completed/errored |
| Step count            | Timeline track                                | Count of timeline block elements                              |
| Selected step details | ExecutionStepInspector (slides in from right) | Text content: node name, duration, inputs, outputs            |
| Loop iterations       | Timeline loop track                           | Nested groups showing each iteration                          |

### 1.7 Execution data structures (reference)

**ExecutionRecord:**

```typescript
{
  id: string;
  status: 'completed' | 'errored' | 'cancelled';
  steps: ExecutionStepRecord[];       // flat list of all executed steps
  errors: GraphError[];
  loopRecords: Map<loopStructureId, LoopRecord>;
  finalValues: Map<'nodeId:handleId', unknown>;
  totalDuration: number;              // wall-clock ms
}
```

**ExecutionStepRecord:**

```typescript
{
  stepIndex: number;
  nodeId: string;
  nodeTypeId: string;
  status: 'completed' | 'errored' | 'skipped';
  inputValues: Map<handleName, { connections: [{value, sourceNodeId, ...}], isDefault, defaultValue }>;
  outputValues: Map<handleName, { value, dataTypeId }>;
  loopIteration?: number;             // present if step ran inside a loop
  loopStructureId?: string;
  loopPhase?: 'loopStart' | 'preStop' | 'loopStop' | 'postStop' | 'loopEnd';
  error?: GraphError;
}
```

**LoopRecord:**

```typescript
{
  loopStructureId: string;
  loopStartNodeId, loopStopNodeId, loopEndNodeId: string;
  iterations: [{
    iteration: number;
    conditionValue: boolean;          // true = continues, false = exits
    stepRecords: ExecutionStepRecord[];
    nestedLoopRecords: Map<...>;      // for nested loops
  }];
  totalIterations: number;
}
```

### 1.8 Accessing the ExecutionRecord from Playwright

The record is NOT stored in the DOM. Two options:

**Option A (preferred, UI-level):** Verify via visible DOM

- Check runner state text ("Completed"/"Error")
- Check timeline has N steps
- Click steps to open inspector and verify input/output values

**Option B (stronger, state-level):** Inject a React DevTools-style hook

- Add a `data-test-record` attribute to a test-only div that stringifies the
  record. (We don't want this in prod — gate via env or Storybook-only.)

For this masterplan we use **Option A** (DOM-based) for most tests, with Option
B planned as a future enhancement if needed for deep verification.

### 1.9 Loop connection validation rules (what MUST be rejected)

Ten categories of invalid connections. Each is enforced by
`isLoopConnectionValid` in
`src/utils/nodeStateManagement/nodes/loops/loopValidation.ts`.

| #   | Rule                                                     | Example                                |
| --- | -------------------------------------------------------- | -------------------------------------- |
| V1  | Binding order: `loopStart ↔ loopStop ↔ loopEnd` only   | loopStart→loopEnd rejected             |
| V2  | Cannot connect to incomplete loop structure              | body→loopStart when loopStop not bound |
| V3  | Inside loop body ↔ outside: forbidden                   | Body node → external sink              |
| V4  | Cross-region same loop: forbidden                        | preStop node → postStop node           |
| V5  | Different loops' inner regions: forbidden                | Loop A body → Loop B body              |
| V6  | GroupInput → only loopStart                              | Not into body                          |
| V7  | GroupOutput → only loopEnd                               | Not from body                          |
| V8  | LoopInfer handle type mismatch across triplet            | loopStart:number + loopStop:string     |
| V9  | Partial loop triplet deletion: rejected                  | Delete loopStart alone                 |
| V10 | Disconnect bindLoopNodes edge once fully bound: rejected | Must delete all three nodes together   |

### 1.10 What data types / node types are available in `WithRunner` and `EmptyRunnerPlayground` stories

Data types:

- `bit` (boolean) — blue rectangle handle
- `number` (number) — red circle handle
- Standard: `condition` (boolean), `bindLoopNodes`, `loopInfer`, `groupInfer`

Node types (searchable in "Add Node" context menu):

- Logic Gates: AND Gate, OR Gate, NOT Gate, XOR Gate, NAND Gate, NOR Gate,
  Buffer
- I/O: Bit Input, Bit Output
- Utility: Counter (inputs: Count, Max; outputs: Count + 1, Reached Max)
- Standard Nodes: Group Input, Group Output, Loop Start, Loop Stop, Loop End

### 1.11 Conversions allowed

`WithRunner` / `EmptyRunnerPlayground` configure:

- `bit ↔ condition` allowed (so a Counter's "Reached Max" bit can drive the
  loopStop "Continue If Condition Is True" boolean input)
- `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true`

---

## Part 2 — Exhaustive Test Matrix

Tests are grouped by concern. Each test runs the E2E suite end-to-end: construct
graph → run → verify outcome.

### Group A — Loop construction (happy paths)

| #   | Test                                                      | Purpose                                    |
| --- | --------------------------------------------------------- | ------------------------------------------ |
| A1  | Build minimal valid loop (triplet + 2 bind edges)         | Smoke test that triplet binds              |
| A2  | Build single-iteration loop (condition false from start)  | Loop runs exactly 1 iteration, exits       |
| A3  | Build 5-iteration counter loop                            | Verify iteration count matches expectation |
| A4  | Build loop with multiple body nodes                       | Exercise multi-step body                   |
| A5  | Build loop with two parallel body branches                | Verify concurrency within a body           |
| A6  | Build loop with post-stop nodes (loopStop→loopEnd region) | Verify post-stop runs once after exit      |
| A7  | Build loop hitting max iterations (default 100)           | Loop errors out with max-iteration error   |
| A8  | Build loop with custom max iterations (set via slider)    | User-adjusted limit is respected           |

### Group B — Invalid connections (must be rejected silently)

Rejection is silent in current reducer (returns without applying). Verify no
edge appears after attempted invalid drag.

| #   | Test                                                              | Purpose                     |
| --- | ----------------------------------------------------------------- | --------------------------- |
| B1  | Reject loopStart → loopEnd via bindLoopNodes (skipping loopStop)  | Rule V1                     |
| B2  | Reject body node → external sink when loop is fully bound         | Rule V3                     |
| B3  | Reject external source → body node (must enter through loopStart) | Rule V3                     |
| B4  | Reject preStop body node → postStop body node in same loop        | Rule V4                     |
| B5  | Reject loop A body → loop B body (two separate loops)             | Rule V5                     |
| B6  | Reject extra bindLoopNodes edge from loopStart→another loopStop   | Rule V1 + maxConnections: 1 |
| B7  | Reject connecting body node to loopStart's bind output            | Rule V1                     |

### Group C — Type validation within loops

| #   | Test                                                                                   | Purpose                   |
| --- | -------------------------------------------------------------------------------------- | ------------------------- |
| C1  | Connect `number` to loopStart infer → verify handles duplicate on loopStop and loopEnd | Happy path inference      |
| C2  | Connect `number` to loopStart, then `bit` to loopStop infer (same row) — rejected      | Rule V8                   |
| C3  | Complex type schema mismatch rejection (if complex types configured)                   | Rule V8                   |
| C4  | Conversion rule: `bit ↔ condition` accepted for condition input                       | Conversion rules honored  |
| C5  | Non-allowed conversion (e.g. number to bit when not allowed) — rejected                | Conversion rules enforced |

### Group D — Loop execution semantics

All run via Run button in **instant** mode unless specified. Verify via DOM:
runner state = "Completed", timeline step count matches expected, final values
correct.

| #   | Test                                                                                          | Purpose                   |
| --- | --------------------------------------------------------------------------------------------- | ------------------------- |
| D1  | Empty body loop (loopStart + loopStop + loopEnd only) exits after 1 iteration                 | Trivial case              |
| D2  | Counter loop iterates exactly N times                                                         | Iteration semantics       |
| D3  | Loop with feedback: Count+1 piped from loopStop output back into loopStart infer on next iter | Feedback loop works       |
| D4  | Condition derived from Counter's Reached Max drives exit                                      | Condition input semantics |
| D5  | Loop that never iterates (condition false at iter 0) — body runs once, loopStop checks, exits | Boundary case             |
| D6  | Loop exceeding max iterations errors with clear error message                                 | Error path                |
| D7  | Loop in step-by-step mode: pauses after each step, user can inspect intermediate state        | Debug mode                |

### Group E — Nested loops

| #   | Test                                                                  | Purpose               |
| --- | --------------------------------------------------------------------- | --------------------- |
| E1  | Nested loop: outer 3 iter × inner 2 iter = 6 inner iterations total   | Nested semantics      |
| E2  | Nested loop with inner feedback depending on outer iteration count    | Cross-scope data flow |
| E3  | Reject connecting outer loop body directly to inner loop body         | Rule V5               |
| E4  | Reject connecting inner loop's body nodes to nodes outside inner loop | Rule V3 nested        |
| E5  | Inner loop error propagates: inner errors → outer errors              | Error propagation     |

### Group F — Deletion and modification

| #   | Test                                                                                              | Purpose         |
| --- | ------------------------------------------------------------------------------------------------- | --------------- |
| F1  | Cannot partially delete loop triplet (select only loopStart → delete ignored)                     | Rule V9         |
| F2  | Can delete entire loop triplet when all three selected                                            | Valid deletion  |
| F3  | Cannot delete only one bindLoopNodes edge once fully bound                                        | Rule V10        |
| F4  | Deleting a body node updates validation: outside-loop connections from its siblings still blocked | Consistency     |
| F5  | Removing an edge triggers type inference reset on affected handles                                | Inference reset |

### Group G — Runner UI state machine

| #   | Test                                                                  | Purpose         |
| --- | --------------------------------------------------------------------- | --------------- |
| G1  | Initial state: "Idle", Run enabled, Pause/Stop disabled               | Idle state      |
| G2  | During run: "Running" badge with pulse, Pause enabled, Run disabled   | Running state   |
| G3  | After completion: "Completed" badge, Run disabled, Reset enabled      | Completed state |
| G4  | After error: "Error" badge, Reset enabled                             | Error state     |
| G5  | Pause in step-by-step: "Paused", Step enabled                         | Paused state    |
| G6  | Stop mid-run: "Idle" or "Error" per implementation, execution aborted | Abort handling  |
| G7  | Reset clears nodeRunnerStates from canvas                             | Reset clears UI |

### Group H — Recording verification

These tests verify the recording is correct by inspecting the timeline + step
inspector in the DOM.

| #   | Test                                                                                  | Purpose               |
| --- | ------------------------------------------------------------------------------------- | --------------------- |
| H1  | Run counter loop 5 iter → timeline shows 5 iteration groups                           | Loop record structure |
| H2  | Click iteration 2 in timeline → inspector shows conditionValue: true                  | Per-iteration data    |
| H3  | Click last iteration → conditionValue: false (the exit decision)                      | Exit condition        |
| H4  | Click a body step → inspector shows inputValues with correct upstream value           | Input tracking        |
| H5  | Click a body step → inspector shows outputValues                                      | Output tracking       |
| H6  | Errored loop: inspector on failed step shows GraphError with message                  | Error display         |
| H7  | Recording persists: scrub timeline → nodeVisualStates update to show historical state | Replay semantics      |

### Group I — Edge cases (regression)

| #   | Test                                                                             | Purpose                   |
| --- | -------------------------------------------------------------------------------- | ------------------------- |
| I1  | Loop where condition input is unconnected → treated as `true`, hits max iter     | Default condition         |
| I2  | Loop with bit→condition conversion ("Reached Max" bit → boolean condition)       | Conversion flow           |
| I3  | Running graph with no loops still works                                          | Regression: non-loop path |
| I4  | Switching mode (instant↔stepByStep) while running is disabled                   | UI guards                 |
| I5  | Adding node to graph during running is... (verify behavior: allowed or blocked?) | UI behavior               |

---

## Part 3 — Test Groups → Folder Structure

```
e2e/tests/
└── loops/
    ├── construction/          # Group A
    │   ├── minimalLoop.spec.ts
    │   ├── singleIteration.spec.ts
    │   ├── counterLoop.spec.ts
    │   ├── multiBodyNodes.spec.ts
    │   ├── parallelBranches.spec.ts
    │   ├── postStopNodes.spec.ts
    │   ├── maxIterationsDefault.spec.ts
    │   └── maxIterationsCustom.spec.ts
    │
    ├── validation/            # Group B
    │   ├── skippedBinding.spec.ts
    │   ├── insideToOutside.spec.ts
    │   ├── outsideToInside.spec.ts
    │   ├── crossRegion.spec.ts
    │   ├── crossLoops.spec.ts
    │   ├── extraBindEdge.spec.ts
    │   └── bodyToBind.spec.ts
    │
    ├── typeValidation/        # Group C
    │   ├── inferHandleDuplication.spec.ts
    │   ├── typeMismatchRejection.spec.ts
    │   ├── complexTypeMismatch.spec.ts
    │   ├── bitConditionConversion.spec.ts
    │   └── forbiddenConversion.spec.ts
    │
    ├── execution/             # Group D
    │   ├── emptyBodyExit.spec.ts
    │   ├── iterationCount.spec.ts
    │   ├── feedbackLoop.spec.ts
    │   ├── conditionFromCounter.spec.ts
    │   ├── zeroIterations.spec.ts
    │   ├── maxIterationsError.spec.ts
    │   └── stepByStepMode.spec.ts
    │
    ├── nested/                # Group E
    │   ├── simpleNested.spec.ts
    │   ├── feedbackAcrossLoops.spec.ts
    │   ├── crossNestedForbidden.spec.ts
    │   ├── innerToOutsideForbidden.spec.ts
    │   └── errorPropagation.spec.ts
    │
    ├── deletion/              # Group F
    │   ├── partialDeleteRejected.spec.ts
    │   ├── fullTripletDelete.spec.ts
    │   ├── singleBindEdgeRejected.spec.ts
    │   ├── bodyNodeDelete.spec.ts
    │   └── inferenceReset.spec.ts
    │
    ├── runnerUI/              # Group G
    │   ├── idleState.spec.ts
    │   ├── runningState.spec.ts
    │   ├── completedState.spec.ts
    │   ├── erroredState.spec.ts
    │   ├── pausedState.spec.ts
    │   ├── stopMidRun.spec.ts
    │   └── resetClearsStates.spec.ts
    │
    ├── recording/             # Group H
    │   ├── iterationGroups.spec.ts
    │   ├── perIterationCondition.spec.ts
    │   ├── exitCondition.spec.ts
    │   ├── inputValues.spec.ts
    │   ├── outputValues.spec.ts
    │   ├── errorDisplay.spec.ts
    │   └── scrubReplay.spec.ts
    │
    └── edgeCases/             # Group I
        ├── unconnectedCondition.spec.ts
        ├── bitConditionFlow.spec.ts
        ├── nonLoopRegression.spec.ts
        ├── modeSwitchLocked.spec.ts
        └── addDuringRun.spec.ts
```

Total: **49 test specs** covering every loop scenario.

---

## Part 4 — Test Steps (Detailed)

Each test follows the pattern: **navigate → construct → run → verify**.

Below are the steps for a representative subset. The remaining tests follow
similar patterns and should be implemented using the same action/locator
primitives defined in Part 5.

### A1. Minimal valid loop

1. `navigateToStory(page, 'organisms-fullgraph--empty-runner-playground')`
2. `rightClickCanvas(page, {x: 200, y: 300})`
3. `addNodeViaContextMenu(page, ['Add Node', 'Standard Nodes'], 'Loop Start')`
4. `rightClickCanvas(page, {x: 500, y: 300})`
5. `addNodeViaContextMenu(page, ['Add Node', 'Standard Nodes'], 'Loop Stop')`
6. `rightClickCanvas(page, {x: 800, y: 300})`
7. `addNodeViaContextMenu(page, ['Add Node', 'Standard Nodes'], 'Loop End')`
8. `connectHandles(page, loopStartId, 'Bind Loop Nodes', loopStopId, 'Bind Loop Nodes')`
9. `connectHandles(page, loopStopId, 'Bind Loop Nodes', loopEndId, 'Bind Loop Nodes')`
10. Expect: `getAllEdges(page)` count == 2
11. Expect: no validation error (no toast)

### D2. Counter loop iterates N times

1. Navigate to empty runner playground
2. Add: LoopStart, Counter (in body), LoopStop, LoopEnd
3. Add: BitConstant (for initial Count=0), BitConstant (for Max=5)
4. Wire:
   - BitConstant(0) → LoopStart infer
   - LoopStart infer out → Counter.Count
   - Number constant 5 → Counter.Max
   - Counter.Count+1 → LoopStop infer (feedback to next iter)
   - Counter.Reached Max → LoopStop.Continue If Condition Is True
5. Wire bindLoopNodes triplet
6. `setMode(page, 'instant')`
7. `clickRun(page)`
8. `waitForRunnerState(page, 'Completed', 30000)`
9. `expect(timelineIterationCount(page)).toBe(5)`
10. Click last iteration in timeline
11. `expect(inspectorText(page)).toContain('Condition: false')` (the exit)

### B1. Reject loopStart → loopEnd skip

1. Navigate, add 3 loop nodes (no binding)
2. Attempt to connect loopStart's "Bind Loop Nodes" output → loopEnd's "Bind
   Loop Nodes" input via `connectHandles`
3. Wait briefly for the reducer to process
4. Expect: `getAllEdges(page)` count == 0 (edge was silently rejected)

### F1. Partial delete rejected

1. Build a minimal valid loop (A1)
2. Click loopStart to select it (only it)
3. `pressKey(page, 'Delete')`
4. Expect: loopStart still exists on canvas
5. Expect: `getAllNodes(page)` count unchanged

### H2. Per-iteration condition in inspector

1. Run a 3-iteration counter loop (via D2 pattern but Max=3)
2. After completion, find iteration 2 block in the timeline
3. Click it
4. Inspector slides in
5. `expect(inspectorText(page)).toContain('Condition: true')` (continues)
6. Click iteration 3 (last)
7. `expect(inspectorText(page)).toContain('Condition: false')` (exits)

### E1. Simple nested loop

1. Navigate, construct an outer loop (loopStart-A, loopStop-A, loopEnd-A,
   counter-outer, max=3 condition)
2. Inside outer loop body, construct an inner loop (loopStart-B, loopStop-B,
   loopEnd-B, counter-inner, max=2 condition)
3. Wire inner loop triplet
4. Wire data flow: outer counter output → inner counter input (or similar)
5. Run
6. Expect: Completed
7. Expect: timeline shows 3 outer iterations
8. Expand outer iteration 1 → shows 2 inner iterations
9. Total inner iterations = 3 × 2 = 6

### D6. Max iterations error

1. Construct a loop where condition is always true (e.g., loopStop condition
   input unconnected — defaults to true)
2. Set max iterations to 10 via the slider
3. Click Run
4. Wait for state "Error"
5. Click the errored step in timeline
6. Inspector shows GraphError with message mentioning "max iterations"

---

## Part 5 — Required Selectors and Actions

Organized by UI concern. Files live under `e2e/locators/<concern>/` and
`e2e/actions/<concern>/`.

### 5.1 Existing primitives (already built in Phase 1)

**`e2e/locators/graph/graphCanvas.locators.ts`:**

- `getCanvas(page): Locator` — `.react-flow__pane`
- `getAllNodes(page): Locator` — `.react-flow__node`
- `getNodeById(page, id): Locator` — by `data-id`
- `getAllEdges(page): Locator` — `.react-flow__edge`

**`e2e/locators/contextMenu/contextMenu.locators.ts`:**

- `getMenuItemByLabel(page, label): Locator` — `li` with `span:text-is(...)`
- `getAnyMenu(page): Locator`

**`e2e/locators/node/node.locators.ts`:**

- `getNodeByName(page, name): Locator`
- `getNodeHandle(page, nodeId, type): Locator` — source=right, target=left

**`e2e/actions/graph/graphCanvas.actions.ts`:**

- `navigateToStory(page, storyId)`
- `rightClickCanvas(page, {x, y})`

**`e2e/actions/contextMenu/contextMenu.actions.ts`:**

- `clickMenuItem(page, label)`
- `hoverMenuItem(page, label)`
- `addNodeViaContextMenu(page, folderPath, nodeName)`

**`e2e/actions/node/node.actions.ts`:**

- `waitForNodeVisible(page, name, timeout?)`

### 5.2 Selectors to add

**`e2e/locators/node/node.locators.ts` additions:**

```typescript
// Get a node by its unique ID (preferred — name can be non-unique)
function getNodeById(page, nodeId): Locator;

// Get a handle on a specific node by handle name (looks up the handle whose
// label text equals the given name)
function getHandleByName(
  page,
  nodeId: string,
  handleName: string,
  type: 'source' | 'target',
): Locator;

// Get all handles on a node by type
function getAllHandles(
  page,
  nodeId: string,
  type: 'source' | 'target',
): Locator;

// Node's visual state classes (running/completed/errored) — check via
// data attribute or class substring
function getNodeVisualState(page, nodeId: string): Promise<string | null>;
```

**`e2e/locators/runnerPanel/runnerPanel.locators.ts` (new):**

```typescript
function getRunControlsPanel(page): Locator;
function getRunButton(page): Locator; // title="Run"
function getPauseButton(page): Locator; // title="Pause"
function getStepButton(page): Locator; // title="Step"
function getStopButton(page): Locator; // title="Stop"
function getResetButton(page): Locator; // title="Reset"

function getModeToggleInstant(page): Locator; // text "Instant"
function getModeToggleStepByStep(page): Locator; // text "Step-by-Step"

function getMaxIterationsInput(page): Locator;
function getMaxIterationsIncrementButton(page): Locator;
function getMaxIterationsDecrementButton(page): Locator;

function getRunnerStateLabel(page): Locator;
// The text "Idle"/"Running"/"Paused"/"Completed"/"Error" in the panel header
```

**`e2e/locators/timeline/timeline.locators.ts` (new):**

```typescript
function getTimeline(page): Locator;
function getAllTimelineBlocks(page): Locator;
function getTimelineBlock(page, stepIndex: number): Locator;
function getLoopTrack(page, loopStructureId?: string): Locator;
function getLoopIterationBlock(page, iterationIndex: number): Locator;

function getTotalDurationText(page): Locator; // "2.8ms" etc
```

**`e2e/locators/inspector/inspector.locators.ts` (new):**

```typescript
function getInspector(page): Locator;
function getInspectorHeader(page): Locator;
function getInspectorStatusBadge(page): Locator; // Completed/Errored/Skipped
function getInspectorDurationText(page): Locator;
function getInspectorInputsSection(page): Locator;
function getInspectorOutputsSection(page): Locator;
function getInspectorErrorSection(page): Locator;
function getInspectorLoopContext(page): Locator; // "Iteration X of Y" + condition
function getInspectorCloseButton(page): Locator;
```

### 5.3 Actions to add

**`e2e/actions/node/node.actions.ts` additions:**

```typescript
// Click a node to select it
async function selectNode(page, nodeId: string);

// Multi-select using Shift
async function selectMultipleNodes(page, nodeIds: string[]);

// Drag a node to a new position
async function dragNode(
  page,
  nodeId: string,
  delta: { dx: number; dy: number },
);

// Get the current node ID of the most recently added node
async function getLastAddedNodeId(page): Promise<string>;

// Assert node visual state
async function expectNodeVisualState(
  page,
  nodeId: string,
  state: 'idle' | 'running' | 'completed' | 'errored' | 'skipped',
);
```

**`e2e/actions/node/connection.actions.ts` (new):**

```typescript
// Drag from source handle to target handle
async function connectHandles(
  page,
  sourceNodeId: string,
  sourceHandleName: string,
  targetNodeId: string,
  targetHandleName: string,
);

// Same but using handle IDs directly (more reliable)
async function connectHandlesById(
  page,
  sourceNodeId: string,
  sourceHandleId: string,
  targetNodeId: string,
  targetHandleId: string,
);

// Attempt a connection that should be rejected; verify no edge was created
async function attemptInvalidConnection(
  page,
  ...args
): Promise<{ edgeCreated: boolean }>;
```

**`e2e/actions/runnerPanel/runnerPanel.actions.ts` (new):**

```typescript
async function clickRun(page);
async function clickPause(page);
async function clickStep(page);
async function clickStop(page);
async function clickReset(page);

async function setMode(page, mode: 'instant' | 'stepByStep');
async function setMaxIterations(page, max: number);

// Wait until runner state label matches
async function waitForRunnerState(
  page,
  expected: 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Error',
  timeout?: number,
);

// Read the current runner state
async function getRunnerState(page): Promise<string>;
```

**`e2e/actions/timeline/timeline.actions.ts` (new):**

```typescript
async function clickTimelineStep(page, stepIndex: number);
async function clickLoopIteration(page, iterationIndex: number);
async function expandLoopIterationInTimeline(page, iterationIndex: number);

async function getTimelineStepCount(page): Promise<number>;
async function getLoopIterationCount(
  page,
  loopStructureId?: string,
): Promise<number>;
```

**`e2e/actions/inspector/inspector.actions.ts` (new):**

```typescript
async function waitForInspector(page);
async function closeInspector(page);

async function getInspectorText(page): Promise<string>;
async function getInputValue(page, handleName: string): Promise<string>;
async function getOutputValue(page, handleName: string): Promise<string>;
async function getErrorMessage(page): Promise<string | null>;
async function getLoopIterationInfo(
  page,
): Promise<{ iteration: number; conditionValue: boolean } | null>;
```

**`e2e/actions/graph/keyboard.actions.ts` (new):**

```typescript
async function pressKey(page, key: string); // 'Delete', 'Backspace', 'x'
async function deleteSelected(page);
```

### 5.4 Composite helpers (reusable graph construction)

**`e2e/helpers/buildLoop.ts` (new):**

```typescript
/**
 * Build a minimal valid loop with the triplet and bind edges.
 * Returns the node IDs.
 */
async function buildMinimalLoop(page, positions?: {start, stop, end}): Promise<{
  loopStartId: string;
  loopStopId: string;
  loopEndId: string;
}>;

/**
 * Build a counter-driven loop with a configurable max.
 * Creates: BitConstant(count=0), Counter, (plus infer wiring) and loop
 * triplet. Returns all IDs needed for further wiring.
 */
async function buildCounterLoop(page, maxIter: number): Promise<{...}>;

/**
 * Build a nested loop structure (outer containing inner).
 */
async function buildNestedLoops(page): Promise<{outer: {...}, inner: {...}}>;
```

### 5.5 Handle discovery helper

The trickiest action is `connectHandles` — ReactFlow handle elements are
positioned by React Flow's internal layout. We need to identify handles
reliably.

```typescript
// Each handle rendered by ConfigurableNode has:
//   data-nodeid=<nodeId>
//   data-handleid=<handleId>
//   data-handlepos=<left|right|top|bottom>
//   class contains "react-flow__handle"
//
// To find a handle by name (label), use the adjacent text:
//   <div><span>HandleName</span><handle .../></div>
//
// Approach: use page.evaluate to find the handle DOM element, then drag
// via Playwright's mouse.down/move/up using the element's bounding rect.

async function getHandleCoordinates(
  page,
  nodeId: string,
  handleName: string,
  type: 'source' | 'target',
): Promise<{ x: number; y: number }>;

async function dragFromTo(
  page,
  from: { x: number; y: number },
  to: { x: number; y: number },
);
```

---

## Part 6 — Implementation Priorities

Tier 1 (implement first — unblocks most other tests):

1. Handle discovery helpers (`getHandleCoordinates`, `dragFromTo`)
2. `connectHandles` action
3. RunnerPanel locators and actions
4. `waitForRunnerState`
5. `buildMinimalLoop` composite helper

Tier 2 (implement after Tier 1): 6. Timeline locators and actions 7. Inspector
locators and actions 8. `buildCounterLoop` composite helper

Tier 3 (implement for specific test groups): 9. `buildNestedLoops` for Group
E 10. `getNodeVisualState` for Group G

Tests to write first (highest value, broadest coverage):

1. **A1** (minimal loop) — smoke test; validates most primitives
2. **D2** (counter loop iterates N times) — validates run + timeline
3. **B1** (reject skipped binding) — validates rejection path
4. **H2** (per-iteration condition in inspector) — validates recording
5. **F1** (partial delete rejected) — validates deletion guards
6. **E1** (nested loops) — validates nesting

After those 6 pass, mass-produce the remaining 43 by template.

---

## Part 7 — Key Constants for Tests

```typescript
// Context menu paths
const PATH_ADD_LOOP_START = ['Add Node', 'Standard Nodes'];
const PATH_ADD_LOOP_STOP = ['Add Node', 'Standard Nodes'];
const PATH_ADD_LOOP_END = ['Add Node', 'Standard Nodes'];
const PATH_ADD_COUNTER = ['Add Node', 'Utility'];
const PATH_ADD_BIT_INPUT = ['Add Node', 'I/O'];
const PATH_ADD_BIT_OUTPUT = ['Add Node', 'I/O'];
const PATH_ADD_AND_GATE = ['Add Node', 'Logic Gates'];

// Node names (exact menu labels)
const NODE_LOOP_START = 'Loop Start';
const NODE_LOOP_STOP = 'Loop Stop';
const NODE_LOOP_END = 'Loop End';
const NODE_COUNTER = 'Counter';
const NODE_BIT_INPUT = 'Bit Input';
const NODE_BIT_OUTPUT = 'Bit Output';
const NODE_AND = 'AND Gate';

// Handle names
const HANDLE_BIND_LOOP_NODES = 'Bind Loop Nodes';
const HANDLE_LOOP_CONDITION = 'Continue If Condition Is True';
const HANDLE_COUNTER_COUNT = 'Count';
const HANDLE_COUNTER_MAX = 'Max';
const HANDLE_COUNTER_COUNT_PLUS_ONE = 'Count + 1';
const HANDLE_COUNTER_REACHED_MAX = 'Reached Max';

// Runner state labels (exact text in DOM)
const STATE_IDLE = 'Idle';
const STATE_RUNNING = 'Running';
const STATE_PAUSED = 'Paused';
const STATE_COMPLETED = 'Completed';
const STATE_ERROR = 'Error';

// Story IDs
const STORY_EMPTY_RUNNER = 'organisms-fullgraph--empty-runner-playground';
const STORY_WITH_RUNNER = 'organisms-fullgraph--with-runner';

// Default timeouts
const TIMEOUT_RUNNER_COMPLETION = 30000;
const TIMEOUT_NODE_VISIBLE = 5000;
const TIMEOUT_SUBMENU_OPEN = 300;
```

---

## Part 8 — Checklist for Each New Test File

For every test spec file:

- [ ] Imports from appropriate locators/actions
- [ ] Uses `STORY_EMPTY_RUNNER` for fresh state tests; `STORY_WITH_RUNNER` if
      preloaded recording is needed
- [ ] `test.describe` with group name matching folder (e.g. "Loop construction")
- [ ] `test.beforeEach` if multiple tests share setup
- [ ] Each test ends with explicit assertion on runner state or edge/node count
- [ ] Timeouts set to realistic values (loops can take seconds)
- [ ] Cleanup not needed — each test gets a fresh browser context

---

## Part 9 — How to Add Option B (record injection) for deeper verification

If DOM-only verification isn't sufficient (e.g., for H4/H5 input/output values),
we can expose the `ExecutionRecord` for testing:

1. In `FullGraph.stories.tsx` within `EmptyRunnerPlayground`, add:
   ```typescript
   onExecutionRecordChange={(record) => {
     (window as any).__testRecord = record;
   }}
   ```
2. In Playwright: `await page.evaluate(() => (window as any).__testRecord)` to
   get the full record for assertions.

This is scoped to the story (not production code) and can be behind an env flag
if it leaks too broadly. Implement only when DOM verification hits a limit.

---

## Part 10 — Keep This Document In Sync

When the test primitives (locators/actions) change, update Part 5. When new
tests are added, update Part 2 and Part 3. When the runner UI changes, update
Parts 1.6 and 7.
