import { expect, type Page } from '@playwright/test';
import {
  type Fixture,
  loadFixture,
} from '../importExport/importExport.actions';
import { attemptConnectionByHandles } from '../node/connection.actions';
import { dismissAllToasts } from '../toast/toast.actions';
import {
  getHandleByName,
  getInferInput,
  getInferOutput,
} from '../../locators/node/node.locators';

type LoopKind = 'loopStart' | 'loopStop' | 'loopEnd';

/**
 * Attempt a connection between two loop infer handles (both empty-label).
 * Returns the same `{pairExists, totalEdgesDelta}` shape as
 * `attemptConnection`. Used heavily in cross-loop and cross-region tests.
 */
async function attemptInferToInfer(
  page: Page,
  sourceNodeId: string,
  sourceKind: LoopKind,
  targetNodeId: string,
  targetKind: LoopKind,
): Promise<{ pairExists: boolean; totalEdgesDelta: number }> {
  return attemptConnectionByHandles(
    page,
    getInferOutput(page, sourceNodeId, sourceKind),
    sourceNodeId,
    getInferInput(page, targetNodeId, targetKind),
    targetNodeId,
  );
}

/**
 * Attempt a connection from a loop infer-out into a regular named target
 * handle (e.g. Buffer's "In").
 */
async function attemptInferToNamed(
  page: Page,
  sourceNodeId: string,
  sourceKind: LoopKind,
  targetNodeId: string,
  targetHandleName: string,
): Promise<{ pairExists: boolean; totalEdgesDelta: number }> {
  return attemptConnectionByHandles(
    page,
    getInferOutput(page, sourceNodeId, sourceKind),
    sourceNodeId,
    getHandleByName(page, targetNodeId, targetHandleName, 'target'),
    targetNodeId,
  );
}

/**
 * Attempt a connection from a regular named source handle into a loop's
 * infer-in (e.g. Buffer's "Out" → loopStop infer-in).
 */
async function attemptNamedToInfer(
  page: Page,
  sourceNodeId: string,
  sourceHandleName: string,
  targetNodeId: string,
  targetKind: LoopKind,
): Promise<{ pairExists: boolean; totalEdgesDelta: number }> {
  return attemptConnectionByHandles(
    page,
    getHandleByName(page, sourceNodeId, sourceHandleName, 'source'),
    sourceNodeId,
    getInferInput(page, targetNodeId, targetKind),
    targetNodeId,
  );
}

/**
 * One row in an edge-creation ALLOW sweep.
 *
 *   - `name` identifies the case in failure messages.
 *   - `run`  performs whatever steps the case attempts (add nodes,
 *            drag connections, etc.) and asserts internally. Each
 *            `attemptConnection` inside should land; multi-step cases
 *            assert each intermediate result.
 *
 * The `run` function receives the freshly-imported topology record so
 * cases can refer to `topology.a.loopStartId` etc. without recomputing.
 */
type AllowCase<T> = {
  name: string;
  run: (page: Page, topology: T) => Promise<void>;
};

/**
 * Run a sequence of "should-allow" edge-creation cases against a
 * fixture. Re-imports the fixture before EACH case so a previous
 * case's successful landing doesn't bias the next attempt.
 *
 * Use this when:
 *   - All cases share the same base topology.
 *   - Cases are short (1–3 drags) and assert internally.
 *
 * For complex multi-step allow scenarios, prefer a standalone test
 * that imports the fixture once.
 */
async function runAllowCases<T>(
  page: Page,
  fixture: Fixture<T>,
  cases: AllowCase<T>[],
): Promise<void> {
  for (const c of cases) {
    const topology = await loadFixture(page, fixture);
    // Clear any reject toasts left from prior cases; otherwise the next
    // attempt's `attemptConnection` toast diff sees stale entries.
    await dismissAllToasts(page).catch(() => undefined);
    try {
      await c.run(page, topology);
    } catch (e) {
      throw new Error(
        `Allow case "${c.name}" failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

/**
 * Convenience asserter for a single attempted connection result.
 * Pairs with `attemptConnection` from `node/connection.actions.ts`:
 *
 *   const result = await attemptConnection(...);
 *   expectConnectionLanded(result, 'BARE.A1');
 */
function expectConnectionLanded(
  result: { pairExists: boolean; totalEdgesDelta: number },
  caseName?: string,
): void {
  expect(result.pairExists, caseName).toBe(true);
  expect(result.totalEdgesDelta, caseName).toBeGreaterThanOrEqual(1);
}

/**
 * Asserter for a rejected connection. Verifies the edge did NOT land AND
 * the total edge count is unchanged. When `options.rejectKind` is given,
 * also asserts on the precise rejection path (`'reducer'|'handle-target'|
 * 'handle-source'`). When `options.code` is given, asserts on the
 * validator code surfaced in the toast (e.g. `'LOOP_PATH_INVALID'`).
 *
 * Rich-result fields are optional for compat with old tests still passing
 * `{pairExists, totalEdgesDelta}`-shaped results without the toast metadata.
 */
function expectConnectionRejected(
  result: {
    pairExists: boolean;
    totalEdgesDelta: number;
    rejectKind?: 'none' | 'reducer' | 'handle-target' | 'handle-source';
    rejectCode?: string;
  },
  caseName?: string,
  options: {
    rejectKind?: 'reducer' | 'handle-target' | 'handle-source';
    code?: string;
  } = {},
): void {
  expect(result.pairExists, caseName).toBe(false);
  expect(result.totalEdgesDelta, caseName).toBe(0);
  if (options.rejectKind) {
    expect(
      result.rejectKind,
      caseName ? `${caseName}: rejectKind` : 'rejectKind',
    ).toBe(options.rejectKind);
  }
  if (options.code) {
    expect(
      result.rejectCode,
      caseName ? `${caseName}: rejectCode` : 'rejectCode',
    ).toBe(options.code);
  }
}

export {
  runAllowCases,
  expectConnectionLanded,
  expectConnectionRejected,
  attemptInferToInfer,
  attemptInferToNamed,
  attemptNamedToInfer,
};
export type { AllowCase, LoopKind };
