import type { Page } from '@playwright/test';
import { addLoopStart, addLoopStop, addLoopEnd } from './addNode';
import { connectHandles } from '../actions/node/connection.actions';
import { HANDLE_BIND_LOOP_NODES } from '../constants';

type LoopTriplet = {
  loopStartId: string;
  loopStopId: string;
  loopEndId: string;
};

type TripletPositions = {
  start?: { x: number; y: number };
  stop?: { x: number; y: number };
  end?: { x: number; y: number };
};

const DEFAULT_POSITIONS: Required<TripletPositions> = {
  start: { x: 300, y: 300 },
  stop: { x: 600, y: 300 },
  end: { x: 900, y: 300 },
};

/**
 * Add three loop nodes without binding them. Useful for validation tests
 * (Group B) that want to attempt invalid bindings.
 */
async function addLoopTriplet(
  page: Page,
  positions: TripletPositions = {},
): Promise<LoopTriplet> {
  const pos = {
    start: positions.start ?? DEFAULT_POSITIONS.start,
    stop: positions.stop ?? DEFAULT_POSITIONS.stop,
    end: positions.end ?? DEFAULT_POSITIONS.end,
  };
  const loopStartId = await addLoopStart(page, pos.start);
  const loopStopId = await addLoopStop(page, pos.stop);
  const loopEndId = await addLoopEnd(page, pos.end);
  return { loopStartId, loopStopId, loopEndId };
}

/**
 * Bind a loop triplet with the two required `bindLoopNodes` edges
 * (loopStart → loopStop, loopStop → loopEnd).
 */
async function bindLoopTriplet(
  page: Page,
  triplet: LoopTriplet,
): Promise<void> {
  await connectHandles(
    page,
    triplet.loopStartId,
    HANDLE_BIND_LOOP_NODES,
    triplet.loopStopId,
    HANDLE_BIND_LOOP_NODES,
  );
  await connectHandles(
    page,
    triplet.loopStopId,
    HANDLE_BIND_LOOP_NODES,
    triplet.loopEndId,
    HANDLE_BIND_LOOP_NODES,
  );
}

/**
 * Build a minimal valid loop (triplet + 2 bind edges). Returns the node ids.
 */
async function buildMinimalLoop(
  page: Page,
  positions: TripletPositions = {},
): Promise<LoopTriplet> {
  const triplet = await addLoopTriplet(page, positions);
  await bindLoopTriplet(page, triplet);
  return triplet;
}

export { addLoopTriplet, bindLoopTriplet, buildMinimalLoop };
export type { LoopTriplet, TripletPositions };
