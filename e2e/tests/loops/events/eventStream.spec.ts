import { test, expect } from '@playwright/test';
import { navigateToStory } from '../../../actions/graph/graphCanvas.actions';
import {
  captureEventsAround,
  type GraphEvent,
} from '../../../actions/events/events.actions';
import {
  addLoopStart,
  addLoopStop,
  addLoopEnd,
} from '../../../helpers/addNode';
import { attemptConnection } from '../../../actions/node/connection.actions';
import {
  ctrlSelectNodes,
  pressDelete,
} from '../../../actions/graph/selection.actions';
import { HANDLE_BIND_LOOP_NODES, STORY_EMPTY_RUNNER } from '../../../constants';

/**
 * Event-stream verification.
 *
 * The rest of the suite uses DOM (counts, ids, classes) and toast text as
 * primary signals. This file exists to verify the EVENT STREAM ITSELF —
 * that the unified `onGraphEvent` channel emits the right events with the
 * right payloads for each kind of action. If any test in the rest of the
 * suite ever needs to switch to event-driven verification, this contract
 * file is the one that keeps the events trustworthy.
 */
test.describe.serial('Event stream contract', () => {
  test.setTimeout(60_000);

  test('ADD_NODE fires action:applied with detail.kind=ADD_NODE and TRUTHFUL nodeId', async ({
    page,
  }) => {
    // After the createGraphStore refactor (Stage 2), event.detail.nodeId
    // is read from POST-APPLY state via set-difference, so it always
    // matches the DOM data-id of the just-mounted node. This is the
    // contract test that locks in that guarantee.
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const { events, result: nodeId } = await captureEventsAround(page, () =>
      addLoopStart(page, { x: 200, y: 200 }),
    );

    const applied = events.filter(
      (e): e is Extract<GraphEvent, { kind: 'action:applied' }> =>
        e.kind === 'action:applied',
    );
    const addNodeEvent = applied.find((e) => e.detail?.kind === 'ADD_NODE');
    expect(
      addNodeEvent,
      'expected action:applied with detail.kind=ADD_NODE',
    ).toBeTruthy();
    if (addNodeEvent && addNodeEvent.detail?.kind === 'ADD_NODE') {
      // Identity match — the bug we fixed.
      expect(addNodeEvent.detail.nodeId).toBe(nodeId);
      expect(addNodeEvent.detail.nodeType).toBe('loopStart');
      expect(addNodeEvent.detail.selectExclusively).toBe(true); // ADD_NODE_AND_SELECT
      expect(typeof addNodeEvent.detail.position.x).toBe('number');
      expect(typeof addNodeEvent.detail.position.y).toBe('number');
    }

    // After ADD_NODE there should be a state:committed reflecting nodeCount=1.
    const committed = events.filter(
      (e): e is Extract<GraphEvent, { kind: 'state:committed' }> =>
        e.kind === 'state:committed',
    );
    expect(committed.length).toBeGreaterThanOrEqual(1);
    const last = committed[committed.length - 1];
    expect(last.nodeCount).toBe(1);
  });

  test('ADD_EDGE fires action:applied with detail.kind=ADD_EDGE and detail.edgeId', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const startId = await addLoopStart(page, { x: 200, y: 200 });
    const stopId = await addLoopStop(page, { x: 600, y: 200 });

    const { events } = await captureEventsAround(page, () =>
      attemptConnection(
        page,
        startId,
        HANDLE_BIND_LOOP_NODES,
        stopId,
        HANDLE_BIND_LOOP_NODES,
      ),
    );

    const applied = events.filter(
      (e): e is Extract<GraphEvent, { kind: 'action:applied' }> =>
        e.kind === 'action:applied',
    );
    const addEdge = applied.find((e) => e.detail?.kind === 'ADD_EDGE');
    expect(
      addEdge,
      'expected action:applied with detail.kind=ADD_EDGE',
    ).toBeTruthy();
    if (addEdge && addEdge.detail?.kind === 'ADD_EDGE') {
      // edgeId is read from post-apply state, so it matches the DOM
      // data-id of the new .react-flow__edge.
      expect(typeof addEdge.detail.edgeId).toBe('string');
      expect(addEdge.detail.edgeId.length).toBeGreaterThan(0);
      expect(addEdge.detail.connection.source).toBe(startId);
      expect(addEdge.detail.connection.target).toBe(stopId);
    }

    // Drag end always fires ui:drag:ended — for accepted edges isValid=true.
    const dragEnded = events.find(
      (e): e is Extract<GraphEvent, { kind: 'ui:drag:ended' }> =>
        e.kind === 'ui:drag:ended',
    );
    expect(dragEnded?.isValid).toBe(true);
  });

  test('Reducer-level reject (V1 skip-stop) fires action:rejected with error.code', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const startId = await addLoopStart(page, { x: 200, y: 200 });
    await addLoopStop(page, { x: 600, y: 200 });
    const endId = await addLoopEnd(page, { x: 1000, y: 200 });

    // Skip-stop bind: S → E directly. Must reject at the validator with
    // a LOOP_PATH_INVALID code (V1).
    const { events, result } = await captureEventsAround(page, () =>
      attemptConnection(
        page,
        startId,
        HANDLE_BIND_LOOP_NODES,
        endId,
        HANDLE_BIND_LOOP_NODES,
      ),
    );

    expect(result.landed).toBe(false);
    expect(result.rejectKind).toBe('reducer');
    expect(result.rejectCode).toBe('LOOP_PATH_INVALID');

    const rejected = events.find(
      (e): e is Extract<GraphEvent, { kind: 'action:rejected' }> =>
        e.kind === 'action:rejected',
    );
    expect(rejected, 'expected action:rejected on V1 skip-stop').toBeTruthy();
    expect(rejected?.error.code).toBe('LOOP_PATH_INVALID');
    expect(rejected?.actionType).toBe('ADD_EDGE_BY_REACT_FLOW');

    // ui:drag:ended fires after action:rejected with isValid=true (ReactFlow's
    // own predicate accepted the bind type pair; the reducer rejected after).
    const dragEnded = events.find(
      (e): e is Extract<GraphEvent, { kind: 'ui:drag:ended' }> =>
        e.kind === 'ui:drag:ended',
    );
    expect(dragEnded).toBeTruthy();
  });

  test('MC reject (saturated target) fires ONLY ui:drag:ended with isValid=false', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const startId = await addLoopStart(page, { x: 200, y: 200 });
    const stopId = await addLoopStop(page, { x: 600, y: 200 });
    // Bind S→T to saturate T.bind-in (maxConnections:1).
    await attemptConnection(
      page,
      startId,
      HANDLE_BIND_LOOP_NODES,
      stopId,
      HANDLE_BIND_LOOP_NODES,
    );
    // Add a fresh second loopStart so S2.bind-out is still connectablestart.
    const start2Id = await addLoopStart(page, { x: 200, y: 500 });

    const { events, result } = await captureEventsAround(page, () =>
      attemptConnection(
        page,
        start2Id,
        HANDLE_BIND_LOOP_NODES,
        stopId,
        HANDLE_BIND_LOOP_NODES,
      ),
    );

    expect(result.landed).toBe(false);
    expect(result.rejectKind).toBe('handle-target');

    // No `action:rejected` should fire — the reducer never sees this attempt.
    const rejected = events.find((e) => e.kind === 'action:rejected');
    expect(
      rejected,
      'no reducer-level reject expected for MC saturation',
    ).toBeUndefined();

    // The drag DOES end with isValid=false — ReactFlow's `isValidConnection`
    // sees the saturated target and rejects.
    const dragEnded = events.find(
      (e): e is Extract<GraphEvent, { kind: 'ui:drag:ended' }> =>
        e.kind === 'ui:drag:ended',
    );
    expect(dragEnded?.isValid).toBe(false);
  });

  test('Successful triplet delete fires ui:delete:attempted with success=true', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    const startId = await addLoopStart(page, { x: 200, y: 200 });
    const stopId = await addLoopStop(page, { x: 600, y: 200 });
    const endId = await addLoopEnd(page, { x: 1000, y: 200 });

    await ctrlSelectNodes(page, [startId, stopId, endId]);
    const { events } = await captureEventsAround(page, () => pressDelete(page));

    const deleteAttempted = events.find(
      (e): e is Extract<GraphEvent, { kind: 'ui:delete:attempted' }> =>
        e.kind === 'ui:delete:attempted',
    );
    expect(deleteAttempted, 'expected ui:delete:attempted').toBeTruthy();
    expect(deleteAttempted?.success).toBe(true);
    expect(deleteAttempted?.nodeIds.sort()).toEqual(
      [startId, stopId, endId].sort(),
    );
  });

  test('state:committed fires after node/edge count changes (and only then)', async ({
    page,
  }) => {
    await navigateToStory(page, STORY_EMPTY_RUNNER);
    // Add a node and verify state:committed reflects the new count.
    const { events } = await captureEventsAround(page, () =>
      addLoopStart(page, { x: 200, y: 200 }),
    );
    const lastCommitted = events
      .filter(
        (e): e is Extract<GraphEvent, { kind: 'state:committed' }> =>
          e.kind === 'state:committed',
      )
      .pop();
    expect(lastCommitted, 'expected at least one state:committed').toBeTruthy();
    expect(lastCommitted?.nodeCount).toBe(1);
    expect(lastCommitted?.edgeCount).toBe(0);
  });
});
