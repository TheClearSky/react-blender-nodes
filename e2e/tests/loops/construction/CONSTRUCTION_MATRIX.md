# Construction Matrix — Edge Creation, Allow & Reject

Companion to [DELETION_MATRIX.md](../deletion/DELETION_MATRIX.md). Where that
doc enumerates which **deletes** the system must reject, this doc enumerates
which **edge-creation attempts** must be accepted or rejected, across every
topology shape the suite supports.

The structure mirrors deletion exactly:

- One `describe.serial` per spec, one shared page across tests.
- Every test starts by importing a base topology FIXTURE (built once in
  `beforeAll` via the slow context-menu-and-drag path, then exported via the
  Import/Export menu and imported per test in sub-second time).
- Allow tests re-import the fixture between cases via `runAllowCases` so a
  successful landing in case N doesn't pollute case N+1.
- Tests call **actions** (no raw Playwright selectors).

## Mental model — the rules under test

Sourced from `src/utils/nodeStateManagement/nodes/loops/loopValidation.ts` (line
numbers as of 2026-04-26).

| Rule | Function (line)                                      | What it forbids                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1   | `isLoopConnectionValid` bind branch (517–533)        | Bind edges between loop nodes that aren't `loopStart→loopStop` or `loopStop→loopEnd`. Includes self-bind, reverse, skip-stop, body↔bind.                                                                                                                      |
| V3   | `verifyParentLoopRegionsAreValid` (363–369)          | Connect "outside any loop" ↔ "inside some loop" when the outside is reachable to the loop boundary. **First-contact loophole**: if EITHER side is in an isolated island (no boundary loop nodes reachable), the rule short-circuits to allow (lines 320–328). |
| V4   | same (375–391)                                       | Connect two non-loop nodes whose boundary loop sets differ — fires for body↔postStop in same loop AND for body₁↔body₂ across two disconnected loops (any cross-region boundary mismatch).                                                                    |
| V5   | `isLoopConnectionValid` two-loop branch (640–648)    | Connect two LOOP NODES of two different loops in patterns that aren't valid serial (`loopEnd→loopStart`) or nesting (`childEnd→parentRegion`, `parentRegion→childStart`).                                                                                      |
| V8   | `verifyLoopStructureUniformHandleInference` (30–253) | Drive a triplet's S/T/E with conflicting types — uniform inference must hold across the bind chain.                                                                                                                                                            |
| V9   | `canRemoveLoopNodesAndEdges` nodes branch            | Partial triplet delete (covered in DELETION_MATRIX).                                                                                                                                                                                                           |
| V10  | same, edges branch                                   | Bind-edge delete on bound triplet (covered in DELETION_MATRIX).                                                                                                                                                                                                |
| MC   | `ContextAwareHandle.maxConnections` check            | A single-connection input refuses a second incoming edge before any validator runs. Only `bindLoopNodes` data type sets `maxConnections: 1` in the standard set; bit / condition / loopInfer / groupInfer all default to unlimited.                            |
| QK   | (empirical, see SER.1 / NB.5)                        | Direct cross-loop infer between certain handle pairs is silently rejected even though the validator path appears to allow it. Workaround: route via interstitial Buffer.                                                                                       |

### Triplet handle indices (DOM row order)

```
loopStart                      loopStop                       loopEnd
inputs:  infer (top)           inputs:                        inputs:
                                  bindLoopNodes (top)            bindLoopNodes (top)
                                  Continue If Condition Is True  infer
                                  infer
outputs: bindLoopNodes (top)   outputs:                       outputs:
         infer                    bindLoopNodes (top)            infer
                                  infer
```

### Verification pattern

```ts
// Reject:
const { pairExists, totalEdgesDelta } = await attemptConnection(...);
expect(pairExists).toBe(false);
expect(totalEdgesDelta).toBe(0);

// Allow:
const { pairExists, totalEdgesDelta } = await attemptConnection(...);
expect(pairExists).toBe(true);
expect(totalEdgesDelta).toBeGreaterThanOrEqual(1);
```

For batch reject sweeps: existing `runRejectCases(page, cases, expectedTotal)`.
For batch allow sweeps: NEW `runAllowCases(page, fixture, cases)` — re-imports
`fixture` between cases so a previous landing doesn't bias later attempts.

## Region taxonomy

For a single bound triplet (S, T, E), every node falls into ONE of:

```
                        ┌───────────── BODY ────────────┐    ┌───── POST-STOP ─────┐
   ┌── OUTSIDE-IN ──┐   │  (region-StartToStop:         │    │  (region-StopToEnd:  │
   │                │   │   reachable from S.infer-out  │    │   reachable from     │
   │  upstream of   │═══├─▶ AND reaches T.infer-in)    ╠════│   T.infer-out AND    │═══┌── OUTSIDE-OUT ──┐
   │  S.infer-in    │   │                               │    │   reaches E.infer-in)│   │ downstream of   │
   │                │   │                               │    │                      │   │ E.infer-out     │
   └────────────────┘   └───────────────────────────────┘    └──────────────────────┘   └─────────────────┘
                S═══════════════════════T═════════════════════════════════════════════E
```

Two flavours of OUTSIDE matter:

- **OUTSIDE-REACHABLE** — the outside node has at least one boundary loop node
  in its reachability (e.g. `BitInput → S.infer-in` makes BitInput reachable to
  loopStart; or `E.infer-out → BitOutput` makes BitOutput reachable from
  loopEnd). V3 fires for connections crossing the loop boundary.
- **OUTSIDE-ISOLATED** — the outside node has zero boundary loop nodes
  reachable. V3 short-circuits to allow on first contact.

For TWO loops on one canvas, every non-loop node falls into one of:
`body₁ / postStop₁ / outside₁ / body₂ / postStop₂ / outside₂ / outside-shared / outside-isolated`.

## Fixtures used (built once in beforeAll, imported per test)

| Fixture                   | Builder                       | Node count | Purpose                                     |
| ------------------------- | ----------------------------- | :--------: | ------------------------------------------- |
| `bareTripletFixture`      | `addLoopTriplet`              |     3      | V1 bind sweeps                              |
| `boundTripletFixture`     | `buildMinimalLoop` (S═T═E)    |     3      | V8 + first-binding tests, no IO             |
| `runnableBitLoopFixture`  | `buildRunnableBitLoop`        |     6      | V3 + V4, BitIn/BitOut + body Buf            |
| `disconnectedPairFixture` | `buildDisconnectedPair` (NEW) |     6      | V3/V4/V5 across two isolated bound triplets |
| `serialFixture`           | `buildSerialLoops`            |     11     | V5 cross-loop, QK direct cross-loop infer   |
| `parallelFixture`         | `buildParallelLoops`          |     10     | V5 cross-loop, shared source/sink           |
| `nestedFixture`           | `buildNestedLoops`            |     11     | V4/V5 in nested-body context                |
| `postStopFixture`         | `buildPostStopNestedLoops`    |     11     | V4/V5 in nested-postStop context            |

**Total beforeAll cost**: ~7 builds at ~10 s each ≈ 70–90 s. Then every test
imports in sub-second.

---

# Group BARE — bare triplet (no binds)

Fixture: `bareTripletFixture` (3 nodes, 0 edges). V9/V10 don't apply. V1 still
applies to bind attempts.

### Allow

| #       | name                       | drag                                                    | expected                        |
| ------- | -------------------------- | ------------------------------------------------------- | ------------------------------- |
| BARE.A1 | bind S→T                   | `S.bind-out → T.bind-in`                                | landed                          |
| BARE.A2 | bind T→E                   | `T.bind-out → E.bind-in`                                | landed                          |
| BARE.A3 | full sequence S→T then T→E | `S.bind-out → T.bind-in`, then `T.bind-out → E.bind-in` | both land (one test, two drags) |

### Reject (V1)

| #       | name                                   | drag                                                         | expected |
| ------- | -------------------------------------- | ------------------------------------------------------------ | -------- |
| BARE.R1 | skip stop: S → E direct                | `S.bind-out → E.bind-in`                                     | rejected |
| BARE.R2 | reverse: T.bind-out → S has no bind-in | (target handle doesn't exist; structural reject)             | rejected |
| BARE.R3 | self-bind                              | `T.bind-out → T.bind-in`                                     | rejected |
| BARE.R4 | E.bind-in target via reversed source   | `E.bind-out has no row` (loopEnd has no bind output) → no-op | rejected |

### Reject (MC) — needs adding extra triplet members

These cases temporarily add a second loopStart or loopStop to the canvas before
probing. After the test runs, the fixture import in the NEXT test reverts to the
bare 3-node state, so the temporary nodes don't leak.

| #       | name                          | setup + drag                                                | expected                                    |
| ------- | ----------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| BARE.R5 | two starts → one stop         | bind S→T first; add S₂; then drag `S₂.bind-out → T.bind-in` | rejected (T.bind-in is `maxConnections:1`)  |
| BARE.R6 | two stops bound to same start | bind S→T first; add T₂; then drag `S.bind-out → T₂.bind-in` | rejected (S.bind-out is `maxConnections:1`) |

### Reject (V1) — non-loop → bind

| #       | name                          | setup + drag                           | expected                          |
| ------- | ----------------------------- | -------------------------------------- | --------------------------------- |
| BARE.R7 | non-loop output to bind input | add Buffer; drag `Buf.Out → T.bind-in` | rejected (datatype mismatch / V1) |

---

# Group BOUND — bound triplet, no IO

Fixture: `boundTripletFixture` (S═T═E bound, no body or IO).

### Allow — extending the bound triplet

| #        | name                        | drag(s)                                                 | expected                                        |
| -------- | --------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| BOUND.A1 | first body buffer           | add Buf; `S.infer-out → Buf.In`; `Buf.Out → T.infer-in` | both land                                       |
| BOUND.A2 | body buffer condition wire  | continuation: `Buf.Out → T.condition`                   | landed (bit→condition conversion)               |
| BOUND.A3 | first postStop buffer       | add Buf; `T.infer-out → Buf.In`; `Buf.Out → E.infer-in` | both land                                       |
| BOUND.A4 | first outside-in source     | add BitInput; `BitIn.Out → S.infer-in`                  | landed                                          |
| BOUND.A5 | first outside-out sink      | add BitOutput; `E.infer-out → BitOut.In`                | landed                                          |
| BOUND.A6 | isolated buffer (no wiring) | add Buf                                                 | landed (just a node-add, doesn't probe an edge) |

### Reject (V1)

| #        | name                            | drag                     | expected                                                                        |
| -------- | ------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| BOUND.R1 | skip-stop bind on bound triplet | `S.bind-out → E.bind-in` | rejected (and existing S→T edge already saturates S.bind-out, so MC also fires) |

### Reject (V8) — type mismatch (uses Counter for number source)

| #        | name                           | drag(s)                                                                                  | expected                                                                                |
| -------- | ------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| BOUND.R2 | conflicting types via S then T | add BitIn; `BitIn.Out → S.infer-in`; add Counter; `Counter.Count+1 → T.infer-in`         | second drag rejected (loopStop infer must agree with loopStart's bit; number conflicts) |
| BOUND.R3 | conflicting types via S then E | mirror: add BitIn; `BitIn.Out → S.infer-in`; add Counter; `Counter.Count+1 → E.infer-in` | second drag rejected                                                                    |

### Reject (MC) — bind handles already saturated

| #        | name                                | setup + drag                           | expected                              |
| -------- | ----------------------------------- | -------------------------------------- | ------------------------------------- |
| BOUND.R4 | second bind from S                  | add S₂; drag `S₂.bind-out → T.bind-in` | rejected (T.bind-in saturated by S→T) |
| BOUND.R5 | second bind to T from another start | add S₂; drag `S₂.bind-out → T.bind-in` | rejected (same as above; explicit)    |

---

# Group RUN — runnable bit loop (single loop, full IO + body)

Fixture: `runnableBitLoopFixture` — `BitIn → S → Buf → T═E → BitOut`. Body
Buffer is in BODY region; BitIn is OUTSIDE-REACHABLE (boundary {loopStart});
BitOut is OUTSIDE-REACHABLE (boundary {loopEnd}).

### Allow

| #      | name                                          | drag                                                                                                                                                              | expected                                                           |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| RUN.A1 | second outside-in fanout to a NEW outside Buf | add Buf-x; `BitIn.Out → Buf-x.In`                                                                                                                                 | landed (Buf-x is isolated, first-contact loophole)                 |
| RUN.A2 | second consumer downstream                    | add Buf-y; `BitOut` is sink; instead `E.infer-out → Buf-y.In` (Buf-y newly added, isolated)                                                                       | landed                                                             |
| RUN.A3 | add a second body buffer in series            | add Buf-b2; `bodyBuf.Out → Buf-b2.In`; `Buf-b2.Out → T.infer-in` (need to drop existing `bodyBuf.Out → T.infer-in` first OR check fanout — see verification step) | depends on whether `T.infer-in` accepts a 2nd source. Probe-style. |

### Reject (V3: body ↔ outside)

| #      | name                                                                          | drag                                                                       | expected                  |
| ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| RUN.R1 | bodyBuf → BitOut (outside-reachable)                                          | `bodyBuf.Out → BitOut.In`                                                  | rejected (V3)             |
| RUN.R2 | BitOut as target — chain via external buffer                                  | add extBuf; `BitIn.Out → extBuf.In`; `extBuf.Out → bodyBuf.In`             | second drag rejected (V3) |
| RUN.R3 | bodyBuf → BitIn (reverse)                                                     | `bodyBuf.Out → BitIn` — BitIn has no incoming handle, so structural reject |
| RUN.R4 | E (loopEnd) into body via direct hand-mod — covered by V5 in cross-loop tests |

### Reject (V4: cross-region same loop)

| #      | name                             | setup + drag                                                                                                                                           | expected                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| RUN.R5 | body → postStop direct           | add postBuf; wire postBuf into postStop region first (`T.infer-out → postBuf.In`, `postBuf.Out → E.infer-in`); then attempt `bodyBuf.Out → postBuf.In` | rejected (V4 — boundary sets differ) |
| RUN.R6 | postStop → body direct (reverse) | mirror: `postBuf.Out → bodyBuf.In`                                                                                                                     | rejected (V4)                        |

### Reject (V8)

| #      | name                                        | drag                                        | expected                          |
| ------ | ------------------------------------------- | ------------------------------------------- | --------------------------------- |
| RUN.R7 | drive S a second time with conflicting type | add Counter; `Counter.Count+1 → S.infer-in` | rejected (S already inferred bit) |

### Reject (MC) — single-connection infer slots

In this build all infer/condition handles default to unlimited maxConnections,
so no MC reject is expected at this layer for the bit loop. Documented for
negative confirmation.

---

# Group DISC — two DISCONNECTED bound triplets

Fixture: `disconnectedPairFixture` — TWO bound triplets `(S₁═T₁═E₁)` and
`(S₂═T₂═E₂)`, no shared nodes, no edges between them, no body or IO. 6 nodes, 4
edges total.

This group is the canonical **"is the validator scoped to a single loop or to
the graph"** stress test.

### Allow — outside ↔ outside (outermost level)

| #       | name                                                       | drag(s)                                                          | expected                                                |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| DISC.A1 | two isolated buffers connect                               | add bufA + bufB; `bufA.Out → bufB.In`                            | landed (both sides isolated from any loop boundary)     |
| DISC.A2 | feed loop₁ from outside, then connect outside₂ to outside₃ | `BitIn → S₁.infer-in`; add bufX, bufY; `bufX.Out → bufY.In`      | landed (bufX/bufY are still isolated from any boundary) |
| DISC.A3 | fan-out from one outside to two destinations               | add bufA, bufB, bufC; `bufA.Out → bufB.In`; `bufA.Out → bufC.In` | both land                                               |

### Reject — body ↔ body across loops

| #       | name                                       | setup + drag                                                                                                                                                  | expected                                                              |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| DISC.R1 | wire body₁, wire body₂, then body₁ → body₂ | add bufB1; `S₁.infer-out → bufB1.In`; `bufB1.Out → T₁.infer-in`; add bufB2; `S₂.infer-out → bufB2.In`; `bufB2.Out → T₂.infer-in`; THEN `bufB1.Out → bufB2.In` | last drag rejected (V3/V4: boundary sets differ — {S₁,T₁} vs {S₂,T₂}) |
| DISC.R2 | reverse direction                          | `bufB2.Out → bufB1.In` after same setup as R1                                                                                                                 | rejected (boundary mismatch is direction-agnostic)                    |

### Reject — body ↔ postStop across loops

| #       | name              | setup + drag                                            | expected                        |
| ------- | ----------------- | ------------------------------------------------------- | ------------------------------- |
| DISC.R3 | body₁ → postStop₂ | wire body₁, wire postStop₂; then `bufB1.Out → bufP2.In` | rejected (boundary sets differ) |
| DISC.R4 | postStop₁ → body₂ | mirror                                                  | rejected                        |

### Reject — postStop ↔ postStop across loops

| #       | name                  | drag                                   | expected                        |
| ------- | --------------------- | -------------------------------------- | ------------------------------- |
| DISC.R5 | postStop₁ → postStop₂ | wire both, then `bufP1.Out → bufP2.In` | rejected (boundary sets differ) |

### Reject — body ↔ outside-reachable across loops

| #       | name                                                                   | setup + drag                                                                                                                     | expected                         |
| ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| DISC.R6 | body₁ → outside-of-loop₂ (where outside is reachable via BitOut₂ ← E₂) | wire body₁, attach BitOut₂ to E₂.infer-out; add bufA fed from BitOut₂'s upstream side (or attach directly); attempt body₁ → bufA | rejected (V3: outside vs inside) |

### Reject — body ↔ outside-isolated (the loophole)

| #                       | name                                                 | setup + drag                                                                               | expected |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| DISC.R7 / **edge case** | wire body₁; add isolated bufZ; `bufB1.Out → bufZ.In` | **expected ALLOW** — bufZ is in isolated island, V3 short-circuits. Document the loophole. |

---

# Group SER — Serial loops

Fixture: `serialFixture` (existing). 11 nodes, 14 edges.

### Allow

| #      | name                          | drag(s)                                                                                                | expected                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| SER.A1 | append a third loop in series | add C-S, C-T, C-E; bind C; add interstitial Buf2; `B.E.infer-out → Buf2.In`; `Buf2.Out → C-S.infer-in` | bind edges land; data edges land via interstitial |
| SER.A2 | extend BitOut chain           | add Buf-z; `BitOut` is a sink. Instead probe: `B.E.infer-out → Buf-z.In` (Buf-z newly added, isolated) | landed                                            |

### Reject — V5 / QK direct cross-loop infer

| #           | name                                  | drag                           | expected                                                                        |
| ----------- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| SER.R1 (QK) | direct A.E → B.S without interstitial | `A.E.infer-out → B.S.infer-in` | rejected (QK / V5 — already covered indirectly by builder needing interstitial) |
| SER.R2      | direct A.E → B.T                      | `A.E.infer-out → B.T.infer-in` | rejected                                                                        |
| SER.R3      | direct A.T → B.S                      | `A.T.infer-out → B.S.infer-in` | rejected                                                                        |

### Reject — V3/V4 cross-loop body interactions

| #      | name                       | drag                    | expected                                                                 |
| ------ | -------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| SER.R4 | A body → B body            | `bodyA.Out → bodyB.In`  | rejected                                                                 |
| SER.R5 | A body → interstitial Buf1 | `bodyA.Out → Buf1.In`   | rejected (Buf1 is outside-reachable — already a target of A.E.infer-out) |
| SER.R6 | A body → BitOut            | `bodyA.Out → BitOut.In` | rejected (V3)                                                            |

### Reject — MC

| #      | name                       | drag                             | expected                                                                                                  |
| ------ | -------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SER.R7 | second source into Buf1.In | add Buf-z; `Buf-z.Out → Buf1.In` | depends on Buffer.In maxConnections (assumed unlimited); if landed, this is an ALLOW case — flip to allow |

---

# Group PAR — Parallel loops

Fixture: `parallelFixture` (existing). 10 nodes, 13–14 edges.

### Allow

| #      | name                                       | drag(s)                                                                                                    | expected                                                  |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| PAR.A1 | add a third loop C in parallel             | add C-S/T/E + bind; `BitIn.Out → C-S.infer-in`; `C-E.infer-out → BitOut.In` (depends on bOutputConnected). | partial expected — at minimum bind + BitIn fanout lands   |
| PAR.A2 | A.S.infer-out fans out to TWO body Buffers | add Buf-b2; `A.S.infer-out → Buf-b2.In`                                                                    | landed (S.infer-out unlimited; Buf-b2 enters body region) |

### Reject

| #              | name                                 | drag                    | expected                                              |
| -------------- | ------------------------------------ | ----------------------- | ----------------------------------------------------- |
| PAR.R1 (V3/V4) | bodyA → bodyB                        | `bodyA.Out → bodyB.In`  | rejected (boundary sets differ across parallel loops) |
| PAR.R2 (V3)    | bodyA → BitOut                       | `bodyA.Out → BitOut.In` | rejected                                              |
| PAR.R3 (V3)    | bodyA → BitIn (reverse — structural) | rejected                |
| PAR.R4 (QK)    | A.E.infer-out → B.S.infer-in         | rejected                |

---

# Group NB — Nested body

Fixture: `nestedFixture` (existing). 11 nodes, 11–14 edges.

### Allow

| #     | name                                              | drag(s)                                                | expected                                         |
| ----- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| NB.A1 | add sibling inner triplet inside outer.body       | add Y-S/T/E + bind; `outerEntryBuf.Out → Y-S.infer-in` | landed                                           |
| NB.A2 | add condition driver to outer.T from a NEW source | add BitIn₂; `BitIn₂.Out → outer.T.condition`           | landed if condition handle accepts second source |

### Reject

| #             | name                                                                                                      | drag     | expected |
| ------------- | --------------------------------------------------------------------------------------------------------- | -------- | -------- |
| NB.R1 (V3/V4) | outerEntryBuf → innerBuf (cross-loop body)                                                                | rejected |
| NB.R2 (V3)    | innerBuf → BitOut                                                                                         | rejected |
| NB.R3 (V4)    | innerBuf → outerReturnBuf (cross-region: inner-body → outer's-postStop-equivalent area)                   | rejected |
| NB.R4 (QK)    | outer.E.infer-out → inner.S.infer-in DIRECT                                                               | rejected |
| NB.R5 (V5)    | outer.E.infer-out → inner.E.infer-in DIRECT (loop-node↔loop-node, neither is the allowed serial pattern) | rejected |

---

# Group NPS — Nested postStop

Fixture: `postStopFixture` (existing). 11 nodes, 11–14 edges.

Mirror of NB but inner is in outer's postStop region.

### Allow

| #      | name                                            | drag(s)                                                   | expected |
| ------ | ----------------------------------------------- | --------------------------------------------------------- | -------- |
| NPS.A1 | add sibling inner triplet inside outer.postStop | add Y-S/T/E + bind; `postStopEntryBuf.Out → Y-S.infer-in` | landed   |

### Reject

| #              | name                                                                                                                                    | drag          | expected |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- |
| NPS.R1 (V3/V4) | postStopEntryBuf → innerBuf (already exists in fixture; pick a new attempt that doesn't duplicate) — try `postStopReturnBuf → innerBuf` | rejected      |
| NPS.R2 (V3)    | innerBuf → BitIn                                                                                                                        | rejected      |
| NPS.R3 (V4)    | innerBuf → outer.body equivalent — tricky in postStop fixture (no outer body). Use `innerBuf → BitIn` (V3 reject) instead.              | covered by R2 |
| NPS.R4 (QK)    | outer.T.infer-out → inner.E.infer-in DIRECT                                                                                             | rejected      |

---

# Estimated test count

| Group     | Allow | Reject | Total  |
| --------- | :---: | :----: | :----: |
| BARE      |   3   |   7    |   10   |
| BOUND     |   6   |   5    |   11   |
| RUN       |   3   |   7    |   10   |
| DISC      |   3   |   7    |   10   |
| SER       |   2   |   7    |   9    |
| PAR       |   2   |   4    |   6    |
| NB        |   2   |   5    |   7    |
| NPS       |   1   |   4    |   5    |
| **total** |  22   |   46   | **68** |

Plus 1 retained smoke (`minimalLoop.spec.ts` A1).

# File layout

```
e2e/tests/loops/construction/
├── CONSTRUCTION_MATRIX.md         ← this file
├── minimalLoop.spec.ts            ← retained smoke
└── constructionMatrix.spec.ts     (NEW) — one big describe.serial
```

# Helpers added in this round

- `buildDisconnectedPair(page)` in `e2e/helpers/buildMultiLoop.ts` — two
  isolated bound triplets, returns `{a, b, allNodeIds}`.
- `runAllowCases(page, fixture, cases)` in
  `e2e/actions/connection/connection.actions.ts` (NEW folder) — each case is
  `{ name, attempt: () => Promise<{landed: boolean}> }`. The runner re-imports
  `fixture` between cases so a previous landing doesn't bias later attempts.

# Migration of existing tests

All five `validation/*.spec.ts` files become redundant once the matrix covers
them:

- `skippedBinding.spec.ts` → BARE.R1
- `reversedBind.spec.ts` → BARE.R2
- `bodyToBind.spec.ts` → BARE.R7
- `bodyToOutside.spec.ts` → RUN.R1 / RUN.R2
- `extraBindEdge.spec.ts` → BARE.R5

Delete after the matrix lands and the suite passes green.

# Iteration plan for ambiguities

The cases marked "depends on …" or "if landed, flip to allow" are behaviors that
the source code makes clear in MOST cases but where I want the actual test
result to confirm. Strategy: write the test with the expected verdict; if it
fails, the diff tells me the actual behaviour and I update the matrix + test in
lockstep.

Specifically watching:

- RUN.A3 — does T.infer-in accept a second source after one is bound?
- SER.R7 — Buffer.In second-source behaviour.
- NB.A2 — condition handle second-source.
- DISC.R6 — V3 vs V4 message text and direction sensitivity.
- The QK quirk's exact source (uniform-inference vs region check).
