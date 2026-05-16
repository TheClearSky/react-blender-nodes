import type { Page } from '@playwright/test';
import {
  addBitInput,
  addBitOutput,
  addLoopEnd,
  addLoopStart,
  addLoopStop,
  addNode,
} from './addNode';
import {
  connectHandles,
  dragBetweenLocators,
} from '../actions/node/connection.actions';
import {
  getHandleByName,
  getInferInput,
  getInferOutput,
  getLoopStopCondition,
} from '../locators/node/node.locators';
import { HANDLE_BIND_LOOP_NODES, MENU_PATH_UTILITY } from '../constants';

type Position = { x: number; y: number };

/** What to do with an auxiliary region (body / postStop / outside). */
type ChainMode = 'none' | 'disconnected' | 'connected';

type LoopStructureOptions = {
  /** Top-left anchor for the triplet (default {x: 80, y: 120}). */
  origin?: Position;
  /** Column spacing between the triplet nodes (default 260). */
  columnSpacing?: number;
  /**
   * Explicit positions for each triplet node. Overrides origin/columnSpacing
   * when provided. Useful for box-selection tests that need the loopStop to
   * sit OUTSIDE the rectangle spanning loopStart and loopEnd.
   */
  positions?: {
    start?: Position;
    stop?: Position;
    end?: Position;
  };
  /** Bind loopStart.bind-out → loopStop.bind-in. Default true. */
  bindStartStop?: boolean;
  /** Bind loopStop.bind-out → loopEnd.bind-in. Default true. */
  bindStopEnd?: boolean;
  /**
   * Body-region nodes (between loopStart and loopStop):
   *   'none'         — no body nodes
   *   'disconnected' — add a Buffer but DON'T wire it into the loop
   *   'connected'    — add a Buffer, wire loopStart.out→Buf.in and
   *                    Buf.out→loopStop.condition + loopStop.infer-in
   * Requires `bindStartStop: true` (ignored otherwise).
   */
  body?: ChainMode;
  /**
   * Post-stop region nodes (between loopStop and loopEnd):
   *   'disconnected' — add a Buffer without wiring
   *   'connected'    — wire loopStop.infer-out → Buf.in → loopEnd.infer-in
   * Requires `bindStopEnd: true` (ignored otherwise).
   */
  postStop?: ChainMode;
  /**
   * Outside source + sink nodes:
   *   'disconnected' — add BitInput + BitOutput without wiring
   *   'connected'    — wire BitInput.Out → loopStart.infer-in and
   *                    loopEnd.infer-out → BitOutput.In (requires full bind).
   */
  outside?: ChainMode;
};

type LoopStructure = {
  loopStartId: string;
  loopStopId: string;
  loopEndId: string;
  bodyNodes: string[];
  postStopNodes: string[];
  outsideInputId?: string;
  outsideOutputId?: string;
  /** All node ids created by this factory call, in creation order. */
  allNodeIds: string[];
};

// Leaves enough room on the left for an outside BitInput column before
// loopStart (and on the right for BitOutput after loopEnd).
const DEFAULT_ORIGIN: Position = { x: 320, y: 120 };
const DEFAULT_SPACING = 260;

/**
 * Create a (possibly partial) loop triplet with configurable binds and
 * optional body / post-stop / outside chains.
 *
 * The goal is single-call expressiveness for tests: pass what you want,
 * receive every node id needed to manipulate the resulting graph.
 */
async function createLoopStructure(
  page: Page,
  opts: LoopStructureOptions = {},
): Promise<LoopStructure> {
  const origin = opts.origin ?? DEFAULT_ORIGIN;
  const col = opts.columnSpacing ?? DEFAULT_SPACING;
  const {
    bindStartStop = true,
    bindStopEnd = true,
    body = 'none',
    postStop = 'none',
    outside = 'none',
  } = opts;

  const startPos = opts.positions?.start ?? origin;
  const stopPos = opts.positions?.stop ?? { x: origin.x + col, y: origin.y };
  const endPos = opts.positions?.end ?? { x: origin.x + col * 2, y: origin.y };

  const bitInputId =
    outside !== 'none'
      ? await addBitInput(page, {
          x: startPos.x - col,
          y: startPos.y,
        })
      : undefined;

  const loopStartId = await addLoopStart(page, startPos);
  const loopStopId = await addLoopStop(page, stopPos);
  const loopEndId = await addLoopEnd(page, endPos);

  const bitOutputId =
    outside !== 'none'
      ? await addBitOutput(page, {
          x: endPos.x + col,
          y: endPos.y,
        })
      : undefined;

  // Bind edges — must happen BEFORE body/postStop wiring so region rules
  // apply correctly when we try to wire the body chain.
  if (bindStartStop) {
    await connectHandles(
      page,
      loopStartId,
      HANDLE_BIND_LOOP_NODES,
      loopStopId,
      HANDLE_BIND_LOOP_NODES,
    );
  }
  if (bindStopEnd) {
    await connectHandles(
      page,
      loopStopId,
      HANDLE_BIND_LOOP_NODES,
      loopEndId,
      HANDLE_BIND_LOOP_NODES,
    );
  }

  const bodyNodes: string[] = [];
  const postStopNodes: string[] = [];

  // Body chain — a Buffer between loopStart.infer-out and loopStop.
  if (body !== 'none') {
    const bufferId = await addNode(
      page,
      { x: origin.x + col * 0.6, y: origin.y + 240 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    bodyNodes.push(bufferId);
    if (body === 'connected' && bindStartStop) {
      // Outside → loopStart.infer-in must exist for inference to propagate;
      // if `outside` is none, use loopStart.infer-in directly (infer slot is
      // available).
      if (outside === 'connected' && bitInputId) {
        await dragBetweenLocators(
          page,
          getHandleByName(page, bitInputId, 'Out', 'source'),
          getInferInput(page, loopStartId, 'loopStart'),
        );
      }
      await dragBetweenLocators(
        page,
        getInferOutput(page, loopStartId, 'loopStart'),
        getHandleByName(page, bufferId, 'In', 'target'),
      );
      await dragBetweenLocators(
        page,
        getHandleByName(page, bufferId, 'Out', 'source'),
        getInferInput(page, loopStopId, 'loopStop'),
      );
      await dragBetweenLocators(
        page,
        getHandleByName(page, bufferId, 'Out', 'source'),
        getLoopStopCondition(page, loopStopId),
      );
    }
  }

  // Post-stop chain — a Buffer between loopStop.infer-out and loopEnd.
  if (postStop !== 'none') {
    const bufferId = await addNode(
      page,
      { x: origin.x + col * 1.6, y: origin.y + 240 },
      MENU_PATH_UTILITY,
      'Buffer',
    );
    postStopNodes.push(bufferId);
    if (postStop === 'connected' && bindStopEnd) {
      await dragBetweenLocators(
        page,
        getInferOutput(page, loopStopId, 'loopStop'),
        getHandleByName(page, bufferId, 'In', 'target'),
      );
      await dragBetweenLocators(
        page,
        getHandleByName(page, bufferId, 'Out', 'source'),
        getInferInput(page, loopEndId, 'loopEnd'),
      );
    }
  }

  // Outside chain — wire BitInput → loopStart and loopEnd → BitOutput
  // (only when the relevant binds exist and outside === 'connected').
  if (
    outside === 'connected' &&
    bitInputId &&
    bitOutputId &&
    bindStartStop &&
    bindStopEnd
  ) {
    // BitInput → loopStart.infer-in (only if body didn't already wire it)
    if (body !== 'connected') {
      await dragBetweenLocators(
        page,
        getHandleByName(page, bitInputId, 'Out', 'source'),
        getInferInput(page, loopStartId, 'loopStart'),
      );
    }
    // loopEnd.infer-out → BitOutput.In
    await dragBetweenLocators(
      page,
      getInferOutput(page, loopEndId, 'loopEnd'),
      getHandleByName(page, bitOutputId, 'In', 'target'),
    );
  }

  const allNodeIds: string[] = [
    ...(bitInputId ? [bitInputId] : []),
    loopStartId,
    loopStopId,
    loopEndId,
    ...(bitOutputId ? [bitOutputId] : []),
    ...bodyNodes,
    ...postStopNodes,
  ];

  return {
    loopStartId,
    loopStopId,
    loopEndId,
    bodyNodes,
    postStopNodes,
    outsideInputId: bitInputId,
    outsideOutputId: bitOutputId,
    allNodeIds,
  };
}

export { createLoopStructure };
export type { LoopStructureOptions, LoopStructure, ChainMode };
