import type { Page } from '@playwright/test';
import { addBitInput, addBitOutput, addNode } from './addNode';
import { addLoopTriplet, bindLoopTriplet } from './buildLoop';
import {
  dragBetweenLocators,
  connectionExistsBetweenNodes,
} from '../actions/node/connection.actions';
import {
  getInferInput,
  getInferOutput,
  getLoopStopCondition,
} from '../locators/node/node.locators';
import { getHandleByName } from '../locators/node/node.locators';
import { MENU_PATH_UTILITY } from '../constants';

type RunnableBitLoop = {
  bitInputId: string;
  loopStartId: string;
  bufferId: string;
  loopStopId: string;
  loopEndId: string;
  bitOutputId: string;
};

/**
 * Build a runnable bit-typed loop:
 *
 *   BitInput ──▶ loopStart ──▶ Buffer ──▶ loopStop ──▶ loopEnd ──▶ BitOutput
 *                                           ▲
 *                                           │ condition
 *                                           Buffer.Out (bit→condition conversion)
 *
 * BitInput default value is `false`, so on iteration 0 the body passes `false`
 * to loopStop, condition evaluates `false`, loop exits. LoopEnd propagates the
 * value to BitOutput. Graph runs to Completed in exactly one iteration.
 */
async function buildRunnableBitLoop(page: Page): Promise<RunnableBitLoop> {
  // Outer island — data source (nodes are ~170px wide + handles protrude;
  // leave at least 250px between neighbours).
  const bitInputId = await addBitInput(page, { x: 60, y: 120 });

  // Loop triplet — spread generously so handle hit-boxes don't overlap with
  // neighbours, especially the runner panel overlay at the bottom.
  const triplet = await addLoopTriplet(page, {
    start: { x: 340, y: 120 },
    stop: { x: 640, y: 120 },
    end: { x: 940, y: 120 },
  });
  await bindLoopTriplet(page, triplet);

  // Body — one Buffer node passes data from loopStart.infer-out to loopStop.
  const bufferId = await addNode(
    page,
    { x: 480, y: 340 },
    MENU_PATH_UTILITY,
    'Buffer',
  );

  // Outer island — data sink
  const bitOutputId = await addBitOutput(page, { x: 1220, y: 120 });

  // Infer wiring — data enters through loopStart, flows through body, exits through loopEnd
  // 1. BitInput.Out → loopStart.infer-in  (drives the infer type = bit)
  await dragBetweenLocators(
    page,
    getHandleByName(page, bitInputId, 'Out', 'source'),
    getInferInput(page, triplet.loopStartId, 'loopStart'),
  );

  // 2. loopStart.infer-out → Buffer.In
  await dragBetweenLocators(
    page,
    getInferOutput(page, triplet.loopStartId, 'loopStart'),
    getHandleByName(page, bufferId, 'In', 'target'),
  );

  // 3. Buffer.Out → loopStop.infer-in  (body output feeds back / exits)
  await dragBetweenLocators(
    page,
    getHandleByName(page, bufferId, 'Out', 'source'),
    getInferInput(page, triplet.loopStopId, 'loopStop'),
  );

  // 4. Buffer.Out → loopStop.condition  (bit → condition conversion)
  await dragBetweenLocators(
    page,
    getHandleByName(page, bufferId, 'Out', 'source'),
    getLoopStopCondition(page, triplet.loopStopId),
  );

  // 5. loopEnd.infer-out → BitOutput.In
  await dragBetweenLocators(
    page,
    getInferOutput(page, triplet.loopEndId, 'loopEnd'),
    getHandleByName(page, bitOutputId, 'In', 'target'),
  );

  return {
    bitInputId,
    loopStartId: triplet.loopStartId,
    bufferId,
    loopStopId: triplet.loopStopId,
    loopEndId: triplet.loopEndId,
    bitOutputId,
  };
}

/**
 * Sanity-check all five infer edges were committed. Useful for failing early
 * in a composite builder instead of during a later `expect()`.
 */
async function assertBitLoopFullyWired(
  page: Page,
  loop: RunnableBitLoop,
): Promise<void> {
  const checks: Array<[string, string, string]> = [
    ['BitInput→loopStart', loop.bitInputId, loop.loopStartId],
    ['loopStart→Buffer', loop.loopStartId, loop.bufferId],
    ['Buffer→loopStop', loop.bufferId, loop.loopStopId],
    ['loopEnd→BitOutput', loop.loopEndId, loop.bitOutputId],
  ];
  for (const [name, s, t] of checks) {
    if (!(await connectionExistsBetweenNodes(page, s, t))) {
      throw new Error(`Expected wiring "${name}" not found`);
    }
  }
}

export { buildRunnableBitLoop, assertBitLoopFullyWired };
export type { RunnableBitLoop };
