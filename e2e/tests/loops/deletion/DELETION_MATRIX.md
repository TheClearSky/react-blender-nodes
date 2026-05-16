# Deletion Matrix — Ordered Test Catalogue

Tests in [deletionMatrix.spec.ts](./deletionMatrix.spec.ts), in the order they
execute inside `test.describe.serial`. The whole file uses one shared browser
context + page; every test starts from a clean canvas via `clearAllNodes`.

Legend for action diagrams:

```
  □ = loop node (unselected)          S = loopStart
  ■ = loop node (selected)            T = loopStop
  ○ = non-loop node (unselected)      E = loopEnd
  ● = non-loop node (selected)        ═ = bindLoopNodes edge (bind)
                                       │ = infer/condition edge (data)
  click = plain click                  ctrl = Ctrl/Meta-click (add to selection)
  box   = Shift-drag rubber-band       del   = press Delete key
```

All tests start with `await clearAllNodes(page)` (Ctrl-select everything →
Delete) as a `beforeEach`, so the canvas is always empty at test start.

---

## Group A — Unbound triplet (no bind edges)

A triplet with no `bindLoopNodes` edges is NOT a recognised loop structure, so
V9 doesn't apply. Every partial deletion succeeds.

```
  ┌───┐   ┌───┐   ┌───┐
  │ S │   │ T │   │ E │
  └───┘   └───┘   └───┘
```

### 1. A1 — delete one by one

| step | action                  |
| ---- | ----------------------- |
| 1    | `selectOnly(S)` → `del` |
| 2    | `selectOnly(T)` → `del` |
| 3    | `selectOnly(E)` → `del` |

Expect after each: that node is gone. Final: 0 nodes.

### 2. A2a — box-select all, delete

| step | action                   |
| ---- | ------------------------ |
| 1    | `box` covering all three |
| 2    | `del`                    |

Expect: 0 nodes.

### 3. A2b — ctrl-select all, delete

| step | action                          |
| ---- | ------------------------------- |
| 1    | `click S` → `ctrl T` → `ctrl E` |
| 2    | `del`                           |

Expect: 0 nodes.

---

## Group B — Partially bound triplet

One bind edge present; structure is still incomplete from V9's perspective — no
loop is "locked", so individual deletions succeed.

### 4. B1 — bind start↔stop only, delete one by one

```
  ┌───┐═══┌───┐   ┌───┐
  │ S │═══│ T │   │ E │
  └───┘═══└───┘   └───┘
```

| step | action                  |
| ---- | ----------------------- |
| 1    | `selectOnly(S)` → `del` |
| 2    | `selectOnly(T)` → `del` |
| 3    | `selectOnly(E)` → `del` |

Expect: 0 nodes.

### 5. B2 — bind start↔stop only, box-select all

Same graph as B1. `box` all three → `del`. Expect 0 nodes.

### 6. B3 — bind stop↔end only, delete one by one

```
  ┌───┐   ┌───┐═══┌───┐
  │ S │   │ T │═══│ E │
  └───┘   └───┘═══└───┘
```

Same actions as A1. Expect 0 nodes.

### 7. B4 — bind stop↔end only, ctrl-select all

Same graph as B3. `ctrl` all three → `del`. Expect 0 nodes.

---

## Group C — Illegal bind attempt

### 8. C1 — skip loopStop (V1 rejection)

```
  ┌───┐       ┌───┐
  │ S │═══/═══│ E │     (bind output S → bind input E, direct)
  └───┘       └───┘
```

| step | action                                      |
| ---- | ------------------------------------------- |
| 1    | `attemptConnection(S.bind-out → E.bind-in)` |

Expect: no edge lands between S and E; total edge count unchanged.

---

## Group D — Fully-bound triplet (V9 active)

```
  ┌───┐═══┌───┐═══┌───┐
  │ S │═══│ T │═══│ E │
  └───┘═══└───┘═══└───┘
```

### 9. D reject — single consolidated test, 9 cases in a `for` loop

Built once on the **V-layout** so every box-pair is spatially valid:

```
  S ─ ─ ─ ─ ─ ─ ─ ─ E       (y=100)
   ═              ═
    ═            ═
     ═          ═
      ═        ═
       T                    (y=600)
```

Before each case: `deselect` (click canvas at (5,5)).

| #   | name                 | select action                     |
| --- | -------------------- | --------------------------------- |
| 1   | click loopStart only | `click S`                         |
| 2   | click loopStop only  | `click T`                         |
| 3   | click loopEnd only   | `click E`                         |
| 4   | box {start, stop}    | `box` covering S + T              |
| 5   | box {start, end}     | `box` covering S + E (T is below) |
| 6   | box {stop, end}      | `box` covering T + E              |
| 7   | ctrl {start, stop}   | `click S` → `ctrl T`              |
| 8   | ctrl {start, end}    | `click S` → `ctrl E`              |
| 9   | ctrl {stop, end}     | `click T` → `ctrl E`              |

After each `del`: expect 3 nodes still present. Failure message names the
specific sub-case.

### 10. D4 — box-select all 3 → removed

V-layout. `box` covering S + T + E → `del`. Expect: 0 nodes, 0 edges.

### 11. D5 — ctrl-select all 3 → removed

Default layout. `click S` → `ctrl T` → `ctrl E` → `del`. Expect: 0 nodes, 0
edges.

---

## Group E — Bound triplet + extra nodes in regions

Partial-delete on the triplet is STILL rejected even when body / post-stop /
outside chains make the graph non-trivial. Afterwards, ctrl-selecting everything
(`allNodeIds`) deletes cleanly.

### 12. E1 — body connected

```
    ┌─────┐   ┌───┐═══┌───┐═══┌───┐   ┌──────┐
    │ BIn │──▶│ S │═══│ T │═══│ E │──▶│ BOut │
    └─────┘   └─┬─┘   └─▲─┘   └───┘   └──────┘
                │       │ infer + condition
                ▼       │
              ┌──────┐  │
              │ Buf  │──┘
              └──────┘
```

| step | action                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | `deleteIndividuallyExpectAllKept` — click each of S/T/E and `del`, assert still present |
| 2    | `ctrlSelect(allNodeIds)` → `del`                                                        |

Expect after step 2: 0 nodes.

### 13. E2 — post-stop connected

```
  ┌───┐═══┌───┐═══┌───┐
  │ S │═══│ T │═══│ E │
  └───┘   └─┬─┘   └─▲─┘
            │       │ infer
            ▼       │
          ┌──────┐  │
          │ Buf  │──┘
          └──────┘
```

Same actions as E1.

### 14. E3 — body + post-stop + outside all connected

```
    ┌─────┐   ┌───┐═══┌───┐═══┌───┐   ┌──────┐
    │ BIn │──▶│ S │═══│ T │═══│ E │──▶│ BOut │
    └─────┘   └─┬─┘   └─▲─┘   └─▲─┘   └──────┘
                │       │       │
                ▼       │       │
              ┌──────┐  │     ┌──────┐
              │Buf-b │──┘     │Buf-p │
              └──────┘        └──▲───┘
                                 │
                                 │ (from T.infer-out)
```

Same actions as E1. Largest graph; validates the rule still holds with full
wiring.

---

## Group F — Two bound triplets

```
  Loop A:  ┌───┐═══┌───┐═══┌───┐     (y=120)
           │ S │═══│ T │═══│ E │
           └───┘═══└───┘═══└───┘

  Loop B:  ┌───┐═══┌───┐═══┌───┐     (y=520)
           │ S │═══│ T │═══│ E │
           └───┘═══└───┘═══└───┘
```

### 15. F reject — consolidated, 6 cases in a `for` loop

Each structure's triplet has to be deleted together. Every case is rejected.

| #   | name                       | select action                                      |
| --- | -------------------------- | -------------------------------------------------- |
| 1   | A partial: ctrl {A.S, A.T} | `click A.S` → `ctrl A.T`                           |
| 2   | B partial: ctrl {B.S, B.E} | `click B.S` → `ctrl B.E`                           |
| 3   | cross: ctrl {A.S, B.S}     | `click A.S` → `ctrl B.S`                           |
| 4   | cross: ctrl {A.S, B.T}     | `click A.S` → `ctrl B.T`                           |
| 5   | cross: ctrl {A.E, B.S}     | `click A.E` → `ctrl B.S`                           |
| 6   | cross: ctrl {full A + B.S} | `click A.S` → `ctrl A.T` → `ctrl A.E` → `ctrl B.S` |

After each `del`: expect 6 nodes still present.

### 16. F2 — delete only loop A, leave B intact

| step | action                         |
| ---- | ------------------------------ |
| 1    | `box` covering A.S + A.T + A.E |
| 2    | `del`                          |

Expect: 3 nodes remain (all of loop B).

### 17. F4 — delete all 6 at once

| step | action                                            |
| ---- | ------------------------------------------------- |
| 1    | `ctrl`-click each of A.S, A.T, A.E, B.S, B.T, B.E |
| 2    | `del`                                             |

Expect: 0 nodes.

---

## Group G — Bind-edge V10 rule

### 18. G1 — clicking a bind edge + Delete is silently rejected

```
  ┌───┐═══×══┌───┐═══┌───┐     (× = click here, then `del`)
  │ S │═══╳══│ T │═══│ E │
  └───┘═══╳══└───┘═══└───┘
```

| step | action                                       |
| ---- | -------------------------------------------- |
| 1    | click bind edge 0 (force, invisible hit-box) |
| 2    | `del`                                        |

Expect: 2 edges still present. All 3 nodes present.

---

## Group H — Helper sanity

### 19. H1 — createLoopStructure boolean flags wire the expected edges

Builds `{ bindStartStop: true, bindStopEnd: false }`:

```
  ┌───┐═══┌───┐   ┌───┐
  │ S │═══│ T │   │ E │
  └───┘═══└───┘   └───┘
```

| step | action                                                        |
| ---- | ------------------------------------------------------------- |
| 1    | assert exactly 1 edge on canvas                               |
| 2    | `connectHandles(T.bind-out → E.bind-in)` (the "missing" bind) |
| 3    | assert exactly 2 edges                                        |

---

## Summary — actions in use

| action                               | file                           | purpose                                                          |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| `clearAllNodes`                      | selection.actions.ts           | beforeEach reset                                                 |
| `selectOnly`                         | selection.actions.ts           | click a node, exclusive selection                                |
| `ctrlSelectNodes`                    | selection.actions.ts           | first click + ctrl-click rest                                    |
| `boxSelectNodes`                     | selection.actions.ts           | Shift-drag rubber-band around given ids                          |
| `deselect`                           | local helper                   | click canvas at (5,5)                                            |
| `pressDelete`                        | selection.actions.ts           | press Delete, wait reducer tick                                  |
| `createLoopStructure`                | helpers/createLoopStructure.ts | build triplet + optional extras                                  |
| `attemptConnection`                  | connection.actions.ts          | drag between two handles, report `{pairExists, totalEdgesDelta}` |
| `connectHandles`                     | connection.actions.ts          | same drag, no reporting                                          |
| `deleteIndividuallyExpectAllKept`    | this file                      | loop over triplet: click+del, assert still there                 |
| `deleteIndividuallyExpectAllRemoved` | this file                      | loop over triplet: click+del, assert gone                        |

## Order at a glance

```
A1 A2a A2b       B1 B2 B3 B4       C1       D-reject D4 D5       E1 E2 E3       F-reject F2 F4       G1       H1
│                │                 │        │                    │              │                    │        │
unbound          partial bound     illegal  fully bound (V9)     + extras       two triplets         V10      sanity
 all delete       all delete       bind     reject+delete                       reject+delete        bind-edge
                                                                                                     rejected
```

19 tests total. Reject-heavy groups (D, F) each share ONE structure across their
sub-cases for speed.

---

# Proposed tests — complex topologies

Everything below is a paranoid enumeration of things the deletion rules SHOULD
handle but aren't currently covered. For each topology:

- a graph diagram,
- an analysis of where the system could misbehave,
- a case table with actions and expected outcome.

The underlying rules haven't changed — V9 (whole triplet or none) and V10 (can't
disconnect a bound triplet's bind edge) — but the _interactions_ between
multiple loops, shared data nodes, and intermediate chains create many
opportunities for the implementation to get region classification, triplet
discovery, or deletion-set membership wrong.

## Attack surface (where this can break)

1. **`getLoopStructureFromNode`** walks `bindLoopNodes` edges starting from any
   loop node. If two triplets' bind edges ever touch the same node (impossible
   via UI, but a state-import bug could synthesise it), the walker could return
   a Frankenstein triplet.
2. **`canRemoveLoopNodesAndEdges`** marks each visited triplet member
   `alreadyChecked` so it's processed once. With nested loops, outer deletion
   may walk into the inner triplet's members and misclassify them.
3. **Region BFS (`getNodesInLoopRegion`)** classifies body nodes via
   bidirectional BFS. When a node has paths to two different loops' start and
   stop, membership overlaps. Deletion currently doesn't consult region data,
   but any future rule that does would be sensitive to this.
4. **Orphan edges after deletion** — when a loop is removed, its outgoing infer
   edge to a downstream loop becomes orphaned. ReactFlow auto-prunes; any custom
   pre-delete hook must not choke on edges whose source/target is being removed
   in the same operation.
5. **Deletion set ordering** — `canRemoveLoopNodesAndEdges` iterates
   `nodesToRemove` once per node. A triplet whose members are adjacent in the
   set vs scattered with non-loop nodes between them must produce the same
   verdict.
6. **Ctrl/Box selection coverage** — box selection includes nodes by
   bounding-box intersection; a triplet laid out so a selection rect
   accidentally covers nodes from a _different_ triplet changes the rule verdict
   silently. Tests need layouts that keep triplets spatially isolated.

---

## Topology S — Two loops in series, with interstitial nodes

```
                         interstitial chain
                         (non-loop nodes)
  ┌────────┐   ┌───┐═══┌───┐═══┌───┐        ┌──────┐        ┌───┐═══┌───┐═══┌───┐   ┌──────┐
  │ BitIn  │──▶│A.S│═══│A.T│═══│A.E│───────▶│ Buf1 │───────▶│B.S│═══│B.T│═══│B.E│──▶│BitOut│
  └────────┘   └─┬─┘   └─▲─┘   └───┘        └──────┘        └─┬─┘   └─▲─┘   └───┘   └──────┘
                 │       │ (A body)                            │       │ (B body)
                 ▼       │                                     ▼       │
               ┌──────┐  │                                   ┌──────┐  │
               │Buf-A │──┘                                   │Buf-B │──┘
               └──────┘                                      └──────┘
```

Two bound triplets A and B, connected in series via `Buf1` between
`A.End.infer-out` and `B.Start.infer-in`. Each loop has its own body node.

### Where this can break

- Deletion of loop A could incorrectly pull Buf1 along or reject because the
  delete set "looks like" it spans two triplets.
- `getLoopStructureFromNode(Buf1)` should return `undefined` (Buf1 is not a loop
  node). If it returns something, V9 would fire wrongly.
- Deleting A + Buf1 is legitimate (full triplet + orphan non-loop). If the
  orphan-edge cleanup is ordered before V9 verification, the bind check for A
  should still succeed.
- Bind-edge delete (V10) on A's bind edges must not be fooled by B's existence.

### Case table

| #                      | name                        | select                           | expected                                             |
| ---------------------- | --------------------------- | -------------------------------- | ---------------------------------------------------- |
| S.1                    | full A alone                | `ctrl {A.S, A.T, A.E}`           | A gone (3 triplet + 1 body), B intact                |
| S.2                    | full B alone                | `ctrl {B.S, B.T, B.E}`           | B gone (3 triplet + 1 body), A intact                |
| S.3                    | interstitial alone          | `click Buf1`                     | Buf1 gone, infer edges to/from it auto-removed       |
| S.4                    | full A + interstitial       | `ctrl {A.S, A.T, A.E, Buf1}`     | 4 nodes gone                                         |
| S.5 partial A + full B | `ctrl {A.S, B.S, B.T, B.E}` | REJECTED — A partial             |
| S.6 cross-partial      | `ctrl {A.S, B.E}`           | REJECTED — both partial          |
| S.7 everything         | `ctrl` all 10 nodes         | all gone                         |
| S.8                    | A.bind edge alone           | click A's S↔T bind edge → `del` | REJECTED (V10)                                       |
| S.9                    | B.bind edge alone           | click B's T↔E bind edge → `del` | REJECTED (V10)                                       |
| S.10                   | interstitial + partial A    | `ctrl {Buf1, A.T}`               | REJECTED — Buf1 can go but A partial blocks whole op |

**Key paranoia case:** S.10 tests whether `canRemoveLoopNodesAndEdges` applies
the rule to the whole set atomically (ReactFlow's `onBeforeDelete` is
all-or-nothing) rather than per-node. If any member fails the rule, the ENTIRE
delete operation must be rejected — even the innocent Buf1.

---

## Topology P — Two loops in parallel, sharing source + sink

```
                 ┌───┐═══┌───┐═══┌───┐
                 │A.S│═══│A.T│═══│A.E│
             ┌──▶└─┬─┘   └─▲─┘   └───┘──┐
             │     │       │            │
             │     ▼       │            │
             │   ┌──────┐  │            │
             │   │Buf-A │──┘            │
             │   └──────┘               │
  ┌────────┐ │                          │ ┌──────┐
  │ BitIn  │─┤                          ├▶│BitOut│
  └────────┘ │                          │ └──────┘
             │   ┌───┐═══┌───┐═══┌───┐  │
             │   │B.S│═══│B.T│═══│B.E│  │
             └──▶└─┬─┘   └─▲─┘   └───┘──┘
                   │       │
                   ▼       │
                 ┌──────┐  │
                 │Buf-B │──┘
                 └──────┘
```

Two bound triplets A and B run in parallel. Both take data from the same `BitIn`
and write to the same `BitOut`. Each has its own body node.

### Where this can break

- `BitIn.Out` → `A.Start.infer-in` AND `BitIn.Out` → `B.Start.infer-in`: one
  source handle with `maxConnections: unlimited` drives two targets. Deleting
  `BitIn` must prune two edges atomically.
- Deleting A alone while B also depends on `BitIn` must not accidentally delete
  `BitIn`.
- `BitOut.In` with two incoming edges (from `A.End.infer-out` and
  `B.End.infer-out`) — the `maxConnections` on that input needs to permit it. If
  not, the story won't build this topology at all; that's itself a useful test.
- V8 uniform inference across the triplet: A and B independently infer to the
  same `bit` type from `BitIn`. Deleting A must not trigger a reval on B that
  rejects based on some stale state.

### Case table

| #                         | name                                                   | select                         | expected                                                                                                                    |
| ------------------------- | ------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| P.1                       | full A alone                                           | `ctrl` A triplet + Buf-A       | A gone, B + shared nodes intact                                                                                             |
| P.2                       | full B alone                                           | `ctrl` B triplet + Buf-B       | B gone, A intact                                                                                                            |
| P.3                       | BitIn alone                                            | `click BitIn`                  | BitIn gone; A.Start.infer-in and B.Start.infer-in both lose their upstream edge                                             |
| P.4                       | BitOut alone                                           | `click BitOut`                 | BitOut gone; A.End and B.End outputs dangle                                                                                 |
| P.5                       | full A + BitIn + BitOut                                | 5-node ctrl                    | A + both islands gone; B remains but with dangling I/O                                                                      |
| P.6 partial A + partial B | `ctrl {A.S, B.S}`                                      | REJECTED — both partial        |
| P.7 full A + partial B    | `ctrl {A.S, A.T, A.E, Buf-A, B.S}`                     | REJECTED — B partial blocks op |
| P.8                       | all nodes                                              | ctrl everything                | all gone                                                                                                                    |
| P.9                       | A's bind edge alone                                    | click → `del`                  | REJECTED (V10) — A is bound                                                                                                 |
| P.10                      | **construction probe**: attempt BitIn → both infer-ins | build graph                    | BOTH edges land (BitIn.Out `maxConnections=∞`). If either is rejected, the topology itself is untestable — diagnostic test. |

**Key paranoia case:** P.10 validates the topology is constructible at all. If
the library ever introduces `maxConnections: 1` on BitIn.Out or BitOut.In, the
parallel-shared-IO topology silently becomes unbuildable and every other P case
would report a false pass. Guard with this probe.

---

## Topology N — Nested loops

### N-body: inner triplet inside outer's body region

```
    ┌────────┐   ┌─────┐═════╗                                              ╔═════┌─────┐   ┌──────┐
    │ BitIn  │──▶│O.S  │═════╣                                              ╠═════│O.E  │──▶│BitOut│
    └────────┘   └──┬──┘     ║                                              ║     └─────┘   └──────┘
                    │        ║                                              ║
                    │        ║                                              ║
                    ▼        ║        ┌─────┐═══┌─────┐═══┌─────┐           ║
                  ┌──────┐   ║        │I.S  │═══│I.T  │═══│I.E  │           ║
                  │Buf-o1│──▶║────────│     │   │     │   │     │──────────▶║ ┌─────┐
                  └──────┘   ║        └──┬──┘   └──▲──┘   └─────┘           ║ │O.T  │
                             ║           │         │                        ║ │     │
                             ║           ▼         │                        ║ └──▲──┘
                             ║        ┌──────┐     │                        ║    │
                             ║        │Buf-i │─────┘ (inner body + cond)    ║    │
                             ║        └──────┘                              ║    │
                             ║                                              ║    │ (outer feedback)
                             ║══════════════════════════════════════════════╝    │
                                                                                 │
                              (O.T feeds outer.infer back — omitted for clarity)
```

The inner triplet `{I.S, I.T, I.E}` + `Buf-i` lives entirely inside outer's body
region (reachable from `O.S.infer-out` and reaches `O.T.infer-in`).

### Where this can break

- `getLoopStructureFromNode(O.S)` must ONLY return the outer triplet, not
  accidentally extend into inner's bind edges (they're separate bind-edge chains
  — should be safe, but worth asserting).
- `canRemoveLoopNodesAndEdges` processes the delete set once per node with
  `alreadyChecked` marking. When the set contains inner + outer, the iteration
  order matters: `alreadyChecked` for inner members should not suppress the
  outer's triplet check.
- Deleting outer alone should succeed — inner becomes a free-standing loop (its
  own binds intact). If the library tries to "cascade-delete" inner when outer's
  body becomes orphaned, that's a bug (it shouldn't).
- Deleting inner alone should succeed. Outer's body is now empty of inner but
  outer's own infer wiring (outer.infer-out → Buf-o1 → outer.infer-in) stays
  consistent.
- Region BFS after outer's deletion: Buf-i, Buf-o1, and the inner triplet are
  now all outside-of-any-loop (no outer). Their subsequent inclusion in any
  future loop connection must not be rejected as "already part of a loop
  region."
- Bind-edge V10: inner bind edges are protected from standalone deletion while
  inner is fully bound, regardless of outer's state.

### Case table — N-body

| #                              | name                                                                      | select                                                                 | expected                                                   |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| N.1                            | inner alone                                                               | `ctrl {I.S, I.T, I.E}` + optionally Buf-i                              | inner gone, outer intact, outer's body loses inner's edges |
| N.2                            | outer alone                                                               | `ctrl {O.S, O.T, O.E}` + Buf-o1                                        | outer gone, inner remains as a free-standing loop          |
| N.3                            | both full                                                                 | ctrl all 6 loop nodes + bodies                                         | all gone                                                   |
| N.4 partial inner              | `click I.S`                                                               | REJECTED (V9 inner)                                                    |
| N.5 partial outer              | `click O.T`                                                               | REJECTED (V9 outer)                                                    |
| N.6 full outer + partial inner | `ctrl {O.S, O.T, O.E, I.S}`                                               | REJECTED — inner partial                                               |
| N.7 partial both               | `ctrl {O.S, I.S}`                                                         | REJECTED                                                               |
| N.8 full inner + outer.T only  | `ctrl {I.S, I.T, I.E, O.T}`                                               | REJECTED — outer partial                                               |
| N.9                            | outer bind edge alone                                                     | click O's S↔T bind → `del`                                            | REJECTED (V10 outer)                                       |
| N.10                           | inner bind edge alone                                                     | click I's S↔T bind → `del`                                            | REJECTED (V10 inner)                                       |
| N.11                           | inner triplet + outer bind edge                                           | `ctrl {I.S, I.T, I.E}` + click outer bind (combined select?)           | REJECTED — outer bind requires full outer triplet in set   |
| N.12                           | DEEP: remove inner, then try to bind a NEW partial loop inside outer.body | after N.1: add {X.S, X.T, X.E}, bind X.S↔X.T only, try partial delete | X is partial → individual deletes should succeed           |

### N-postStop: inner triplet inside outer's post-stop region

```
    ┌────────┐   ┌─────┐═══┌─────┐═══                                              ═══┌─────┐   ┌──────┐
    │ BitIn  │──▶│O.S  │═══│O.T  │═══╗                                             ╔══│O.E  │──▶│BitOut│
    └────────┘   └──┬──┘   └──▲──┘   ║                                             ║  └─────┘   └──────┘
                    │         │      ║                                             ║
                    ▼         │      ║   ┌─────┐═══┌─────┐═══┌─────┐                ║
                  ┌──────┐    │      ║   │I.S  │═══│I.T  │═══│I.E  │                ║
                  │Buf-ob│────┘      ║──▶│     │   │     │   │     │───────────────▶║
                  └──────┘           ║   └──┬──┘   └──▲──┘   └─────┘                ║
                                     ║      │         │                             ║
                                     ║      ▼         │                             ║
                                     ║   ┌──────┐     │                             ║
                                     ║   │Buf-ip│─────┘                             ║
                                     ║   └──────┘                                   ║
```

Inner triplet is between `O.T.infer-out` and `O.E.infer-in` (outer's post-stop
region), NOT in outer's body.

### Where this is different from N-body

- Inner is in `stopToEnd` region of outer, which per the docs has different
  allowed-connection rules. Deletion rules (V9/V10) don't care about regions,
  but a bug in region classification after partial deletion could surface here.
- Deleting outer's loopStop (partial) while inner is fully intact: the
  deletion-set walker visits O.T, goes `getLoopStructureFromNode(O.T)` → outer
  triplet. Checks {O.S, O.E} in set → both missing → REJECT. Clean.
- But what if the walker also touches inner nodes because they're reachable via
  outer.postStop? It shouldn't — region traversal is only for connection
  validation, not for deletion.

### Case table — N-postStop

Mirrors N-body cases N.1–N.10; only the inner triplet's position differs.

---

## Topology T — Three-level nesting (paranoia)

```
  O.S═══╗                                                          ╔═══O.E
        ║      M.S═══╗                              ╔═══M.E        ║
        ║            ║   I.S═══I.T═══I.E            ║              ║
        ║            ║                              ║              ║
```

Three triplets: Outer contains Middle; Middle contains Inner; Inner has its own
body. Nine loop nodes total.

### Where this can break

- `alreadyChecked` book-keeping in `canRemoveLoopNodesAndEdges` is unit- tested
  only up to one triplet. Three triplets means nine loop nodes walking back to
  three different structures — an off-by-one in the "triplet fully in set?"
  check surfaces here.
- Region BFS now has nested "body of body of body." If any classification treats
  regions as flat, outer's body check might wrongly include inner's nodes.

### Case table — T

| #                                            | name                   | select                         | expected                                                                          |
| -------------------------------------------- | ---------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| T.1                                          | inner full only        | 3 I nodes                      | inner gone, M and O intact                                                        |
| T.2                                          | middle full only       | 3 M nodes                      | middle gone, inner becomes a free-standing loop inside outer's body; outer intact |
| T.3                                          | outer full only        | 3 O nodes                      | outer gone, middle + inner remain as nested pair                                  |
| T.4                                          | inner + middle full    | 6 nodes                        | both gone, outer intact                                                           |
| T.5                                          | outer + middle full    | 6 nodes                        | both gone, inner free-standing                                                    |
| T.6                                          | all 9                  | ctrl-select all                | all gone                                                                          |
| T.7 partial any-level                        | any 1 loop node        | REJECTED                       |
| T.8 full outer + partial middle              | 3 O + 1 M              | REJECTED                       |
| T.9 full outer + full middle + partial inner | 6 + 1 I                | REJECTED                       |
| T.10                                         | middle bind edge alone | click middle S↔T bind → `del` | REJECTED (V10)                                                                    |

---

## Topology X — Mixed: serial outer loops, nested inner in one of them

Paranoia combo:

```
  Loop A (outer) ── Buf1 ── Loop B (outer, containing inner Loop C in body) ── BitOut
```

### Cases worth probing

| #   | name                            | select          | expected                                           |
| --- | ------------------------------- | --------------- | -------------------------------------------------- |
| X.1 | delete inner C only             | 3 C nodes       | C gone, A and B intact                             |
| X.2 | delete outer B only (A, C left) | 3 B nodes       | B gone, A intact, C stranded as free-standing loop |
| X.3 | delete A only                   | 3 A nodes       | A gone, B+C intact (C still inside B's body)       |
| X.4 | partial inner C + full outer B  | 1 C + 3 B       | REJECTED — C partial                               |
| X.5 | partial A + full B + full C     | 1 A + 3 B + 3 C | REJECTED — A partial                               |
| X.6 | all 9 + Buf1                    | ctrl all        | all gone                                           |

---

## Topology B — Shared body node between two loops

**Is this even constructible?** Let the test find out.

```
              ╔════════════════════════════════════╗
              ║                                    ║
  A.S═══A.T═══╝     [Shared Buffer]                ╚═══B.T═══B.E
    │     ▲             │   ▲                              │
    │     │             │   │                              │
    └─────┴─────────────┘   └──────────────────────────────┘
```

A loop's body feeds `Shared Buffer` which feeds another loop's body. Per region
rules this is likely rejected at connection time (cross-loop body→body, V5). If
constructible, deleting Shared Buffer alone while both loops are bound is an
interesting pressure test.

### Case table — B (probe)

| #   | name                                      | action                                 | expected                                                                                                            |
| --- | ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B.1 | construction probe                        | attempt to build the shared-body graph | EXPECTED REJECTED at connection time (V5). If accepted, we have a library bug that deletion must handle gracefully. |
| B.2 | delete shared buf (if constructible)      | `click Shared` → `del`                 | succeed — it's not a loop node; V9 doesn't apply                                                                    |
| B.3 | delete A's triplet only (if B.1 accepted) | 3 A nodes                              | succeed — A gone; Shared becomes orphan edge source for B                                                           |

**This topology is primarily a diagnostic** — it should fail at construction. If
it doesn't, the deletion behaviour is undefined.

---

## Priority for implementation

1. **High value, straightforward**: S, P, N-body case tables.
2. **Medium value, needs infer-handle wiring that currently has flakes**:
   N-postStop, T (triple nesting).
3. **Diagnostic only**: P.10 (parallel shared-IO probe), B.1 (shared-body
   probe). Run first to validate assumptions.

## Shared assertion pattern

Every proposed test follows the same verify-and-deselect loop the D/F reject
tests use:

```typescript
for (const c of cases) {
  await deselect(page);
  await c.select();
  await pressDelete(page);
  expect(await getAllNodes(page).count(), c.name).toBe(c.expectedCount);
  // Rebuild state only for cases that left the graph in a terminal state
  // (full delete). Reject cases leave the graph unchanged → reuse.
}
```

Each topology gets ONE builder helper (`buildSerialLoops`, `buildParallelLoops`,
`buildNestedLoops`, `buildTripleNestedLoops`) that returns the full map of node
ids. Reject cases share the built structure. Full-delete cases rebuild after.
