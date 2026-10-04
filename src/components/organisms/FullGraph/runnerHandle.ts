import type { RunnerState, RunHaltInitiator } from '@/utils/nodeRunner/types';

/**
 * An imperative handle on the graph's runner, handed to a consumer through
 * `FullGraphProps.runnerRef`.
 *
 * The runner lives inside `FullGraph` (`RunnerOverlay` → `useNodeRunner`), so
 * before this existed nothing outside the component could start a run: the
 * Run button was the only entry point, and neither `execute` nor
 * `useNodeRunner` is part of the published surface. An application that wants
 * to run the graph on its own schedule — an auto-run after an idle delay, a
 * keyboard shortcut, a "render" command in its own menu — needs exactly this.
 *
 * Every method is a no-op while the ref is unpopulated (before mount, or when
 * `functionImplementations` is absent so there is no runner at all).
 */
type GraphRunnerHandle = {
  /**
   * Start a run, or RESUME when the runner is paused — the same behaviour as
   * the panel's Run button, so the two cannot disagree.
   */
  run: () => void;
  /**
   * Stop and cancel a running or paused execution.
   *
   * Pass `{ initiator: 'consumer' }` when the APPLICATION is halting the run
   * for its own reasons — replacing the whole project, navigating away — as
   * opposed to a person pressing Stop. Both arrive on `onRunEvent` as
   * `run:aborted` with `reason: 'stopped'`, and without this they are
   * indistinguishable: an app that (correctly) switches its auto-run off when
   * the user halts a run would switch it off on every project load too.
   * Defaults to `'user'`.
   */
  stop: (options?: { initiator?: RunHaltInitiator }) => void;
  /** Return to idle, clearing the record (the panel's Reset). Same `initiator`
   *  contract as `stop`. */
  reset: (options?: { initiator?: RunHaltInitiator }) => void;
  /**
   * The current state machine state. Read it before calling `run` if you need
   * to avoid restarting an execution that is already in flight.
   */
  getRunnerState: () => RunnerState;
};

export type { GraphRunnerHandle };
