# Loop E2E Test Matrix

Authoritative list of loop behaviors this suite verifies. Before adding tests
read **Mental Model**; each rule here traces to a function under
`src/utils/nodeStateManagement/nodes/loops/`.

## Other Playwright projects (non-loop)

| Project                 | Tests | Pins                                                                                                                                                                                                                                                                       |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advancedGraphExamples` | 4     | SDF Shape Studio: param-default seeding + `SliderNumberInput` external-sync + no-auto-run (Playground); render-on-Run; strict binary mask + analytic measure-ratio window; Showcase fixture preload through the real import pipeline + one-shot auto-run + Reset→Run cycle |

## Mental Model

### Triplet handle indices (DOM row order)

```
loopStart                         loopStop                          loopEnd
──────────                        ──────────                        ──────────
inputs:                           inputs:                           inputs:
  [0] infer  (upstream/feedback)    [0] bindLoopNodes  (from Start)   [0] bindLoopNodes  (from Stop)
                                    [1] condition  (boolean)          [1] infer  (exit value)
                                    [2] infer  (from body)
outputs:                          outputs:                          outputs:
  [0] bindLoopNodes  (to Stop)      [0] bindLoopNodes  (to End)       [0] infer  (to downstream)
  [1] infer  (to body)              [1] infer  (feedback/exit)
```

### Lifecycle

```
 (1) Triplet added           no rules active beyond maxConnections on bind handles
      │
      │  bind loopStart.out[0] → loopStop.in[0]
      │  bind loopStop.out[0]  → loopEnd.in[0]
      ▼
 (2) Bound triplet           region + uniform-inference rules activate
      │  wire infer handles (upstream → Start, body ↔ Stop, End → downstream)
      │  wire condition  (body node → loopStop.condition, incl. bit↔condition conversion)
      ▼
 (3) Executable loop         runner compiles + executes with per-iteration recording
```

### Key rules (with source citations)

| Rule                              | Function                                  | Rejection text                                                                             |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| V1 bind order                     | `isLoopConnectionValid` bind branch       | silent — ReactFlow's `maxConnections:1` fires before the validator                         |
| V3 region isolation body↔outside | `verifyParentLoopRegionsAreValid`         | "Can't connect a node from inside the loop to a node from outside the loop"                |
| V4 cross-region same loop         | same                                      | "Can't connect 2 nodes of different regions of loop nodes"                                 |
| V5 cross-loop body→body           | isLoopConnectionValid two-loop branch     | "Can't connect one loop structure's inner region to another loop structure's inner region" |
| V9 partial delete                 | `canRemoveLoopNodesAndEdges` nodes branch | "Loop nodes all need to be removed together, can't partially remove them"                  |
| V10 bind edge delete              | same                                      | "Cannot disconnect loop nodes bind edges once fully connected…"                            |

### First-contact loophole (V3)

`verifyParentLoopRegionsAreValid` returns valid if EITHER node is in an isolated
island (no boundary loop nodes reachable). An external node that has zero prior
connections therefore _can_ land its first edge with a body node — the rule
kicks in from the next edge onwards. Region-isolation rejection tests must use
an external node that already has a loop boundary in its reachability (e.g.
BitOutput already fed by loopEnd).

## Implemented tests (17 passing)

### Construction — runnable

| #   | Test                                                                                                                                  | File                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A1  | Minimal loop (3 nodes + 2 bind edges)                                                                                                 | `construction/minimalLoop.spec.ts` |
| EX1 | Full runnable graph: BitInput → Loop(Buffer) → BitOutput, runs to Completed, 6 timeline blocks, inspector shows "Bit Input" on step 0 | `runnable/simpleBitLoop.spec.ts`   |

### Construction — incomplete

| #   | Test                                                                                                        | File                              |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| IC1 | Unbound triplet + a parallel non-loop chain: runner reaches a terminal state (Completed or Error), not hung | `runnable/incompleteLoop.spec.ts` |

### Rejection

| #   | Test                                                    | Rule             | File                                |
| --- | ------------------------------------------------------- | ---------------- | ----------------------------------- |
| B1  | loopStart.bind-out → loopEnd.bind-in (skip Stop)        | V1               | `validation/skippedBinding.spec.ts` |
| B2  | loopStop.bind-out → loopStop.bind-in (self-bind)        | V1 / maxConn     | `validation/reversedBind.spec.ts`   |
| B4  | Second bind from `loopStart.bind-out` to a new loopStop | maxConnections:1 | `validation/extraBindEdge.spec.ts`  |
| B5  | Counter.out → loopStop.bind-in (non-loop → bind)        | V1               | `validation/bodyToBind.spec.ts`     |
| B6  | Two loopStarts → same loopStop (fan-in)                 | maxConnections:1 | `validation/reversedBind.spec.ts`   |
| V3a | body Buffer → BitOutput (known-outside sink) rejected   | V3               | `validation/bodyToOutside.spec.ts`  |
| V3b | BitInput→externalBuffer→body Buffer forbidden           | V3               | `validation/bodyToOutside.spec.ts`  |

### Deletion

| #   | Test                                             | Rule | File                                      |
| --- | ------------------------------------------------ | ---- | ----------------------------------------- |
| F1  | Partial triplet delete (loopStart only) rejected | V9   | `deletion/partialDeleteRejected.spec.ts`  |
| F2  | Full triplet delete succeeds                     | —    | `deletion/fullTripletDelete.spec.ts`      |
| F3  | Single bind edge delete rejected                 | V10  | `deletion/bindEdgeDeleteRejected.spec.ts` |
| F4  | Body node alone delete succeeds                  | —    | `deletion/bodyNodeDelete.spec.ts`         |

### Runner UI

| #   | Test                                                          | File                                 |
| --- | ------------------------------------------------------------- | ------------------------------------ |
| G1  | Empty graph → Idle, Pause/Stop/Reset disabled                 | `runnerUI/idleState.spec.ts`         |
| G3  | Empty graph Run → Completed, Reset enabled                    | `runnerUI/completedState.spec.ts`    |
| G5  | Step-by-Step mode (WithRunner + Reset) pauses after each step | `runnerUI/stepByStepMode.spec.ts`    |
| G6  | Stop from Paused reaches terminal state                       | `runnerUI/stopMidRun.spec.ts`        |
| G7  | Reset clears timeline + returns to Idle                       | `runnerUI/resetClearsStates.spec.ts` |
| G8  | Panel reflows with no horizontal overflow 375→1200px          | `runnerUI/responsive.spec.ts`        |
| G9  | Inspector: side column when wide, slide-over overlay narrow   | `runnerUI/responsive.spec.ts`        |

## Parked (need more investigation)

| Test                               | Blocker                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nested runnable loops              | `innerEnd.infer-out → outerStop.infer-in` drag silently rejected; root cause is in the two-loop infer branch of `isLoopConnectionValid` — needs deep trace to isolate which check fires |
| Serial runnable loops              | `loopA.End.infer-out → loopB.Start.infer-in` silently rejected with same symptom                                                                                                        |
| V4 cross-region same loop          | Requires a body node reachable from loopStop AND a post-stop node — need an infer-wiring helper that disambiguates inferred vs fresh handles across the triplet                         |
| V5 cross-loop body→body            | Same infer-wiring dependency                                                                                                                                                            |
| V8 uniform inference type mismatch | Requires driving loopStart.infer with one type and loopStop.infer with a different type; depends on the same infer-handle addressing work                                               |

## Verification pattern for rejection tests

`attemptConnection` returns `{ pairExists, totalEdgesDelta }`:

- **pairExists** — did any edge land between these two NODES? Precise when the
  pair has at most one valid handle pair (true for `bindLoopNodes` and for cases
  where only one handle per side can match by type).
- **totalEdgesDelta** — did the total edge count change? Rules out side-effect
  edges on other handles.

```typescript
const { pairExists, totalEdgesDelta } = await attemptConnection(...);
expect(pairExists).toBe(false);
expect(totalEdgesDelta).toBe(0);
```
