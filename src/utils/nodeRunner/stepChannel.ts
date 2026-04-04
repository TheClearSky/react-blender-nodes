import type { ExecutionStepRecord, ExecutionRecord } from './types';

/**
 * Payload yielded by the step-by-step generator after each internal step.
 */
type StepYield = {
  stepRecord: ExecutionStepRecord;
  partialRecord: ExecutionRecord;
};

/**
 * A single-item async channel for synchronizing the step-by-step generator
 * with the execution functions (loop blocks, group scopes).
 *
 * The execution function pushes a step payload and blocks until the generator
 * consumes it. The generator pulls payloads and yields them to the caller.
 * This creates a lock-step handshake: execute one node, pause, yield, resume.
 *
 * ## Protocol
 *
 * 1. Execution calls `push(payload)` — stores the payload and returns a
 *    Promise that resolves when the generator calls `pull()` again (or the
 *    channel is closed).
 * 2. Generator calls `pull()` — returns the pending payload (or waits for
 *    one to arrive via push). After processing, calls `pull()` again to
 *    unblock the next push.
 * 3. When execution completes, call `close()` — any pending `pull()` resolves
 *    with `null`, signaling the generator to stop.
 *
 * ## Error handling
 *
 * If execution throws, `closeWithError(err)` propagates the error to any
 * pending `pull()` so the generator can rethrow it.
 */
class StepChannel {
  /** Pending payload waiting to be pulled by the generator. */
  private pendingPayload: StepYield | null = null;

  /** Resolve function to unblock the execution after the generator consumes a payload. */
  private pendingPushResolve: (() => void) | null = null;

  /** Resolve function for a generator waiting for the next payload. */
  private pendingPullResolve: ((payload: StepYield | null) => void) | null =
    null;

  /** Reject function for a generator waiting for the next payload (error propagation). */
  private pendingPullReject: ((err: unknown) => void) | null = null;

  /** Whether the channel has been closed. */
  private closed = false;

  /** Stored error from closeWithError. */
  private error: unknown = undefined;

  /**
   * Push a step payload into the channel. Blocks until the generator
   * consumes it (i.e., until the next `pull()` call after this one).
   *
   * Called from inside execution functions (e.g., `executeLoopBlock`).
   */
  push(payload: StepYield): Promise<void> {
    if (this.closed) return Promise.resolve();

    // If the generator is already waiting for a payload, deliver immediately
    if (this.pendingPullResolve) {
      const resolve = this.pendingPullResolve;
      this.pendingPullResolve = null;
      this.pendingPullReject = null;
      resolve(payload);

      // Block until the generator pulls again (signaling it's ready for the next step)
      return new Promise<void>((r) => {
        this.pendingPushResolve = r;
      });
    }

    // Generator hasn't pulled yet — store payload and block
    this.pendingPayload = payload;
    return new Promise<void>((r) => {
      this.pendingPushResolve = r;
    });
  }

  /**
   * Pull the next step payload from the channel. Returns `null` when the
   * channel is closed (execution completed or errored).
   *
   * Called from the `executeStepByStep` generator.
   */
  pull(): Promise<StepYield | null> {
    if (this.error !== undefined) {
      return Promise.reject(this.error);
    }

    // If a payload is already pending, deliver it and unblock the push
    if (this.pendingPayload) {
      const payload = this.pendingPayload;
      this.pendingPayload = null;

      // Unblock the previous push (execution can proceed to next step)
      if (this.pendingPushResolve) {
        const resolve = this.pendingPushResolve;
        this.pendingPushResolve = null;
        resolve();
      }

      return Promise.resolve(payload);
    }

    if (this.closed) return Promise.resolve(null);

    // No payload yet — wait for the next push
    return new Promise<StepYield | null>((resolve, reject) => {
      this.pendingPullResolve = resolve;
      this.pendingPullReject = reject;

      // Unblock any pending push that's waiting for us to be ready
      if (this.pendingPushResolve) {
        const pushResolve = this.pendingPushResolve;
        this.pendingPushResolve = null;
        pushResolve();
      }
    });
  }

  /**
   * Close the channel normally (execution completed successfully).
   * Any pending `pull()` resolves with `null`.
   */
  close(): void {
    this.closed = true;
    if (this.pendingPullResolve) {
      this.pendingPullResolve(null);
      this.pendingPullResolve = null;
      this.pendingPullReject = null;
    }
    if (this.pendingPushResolve) {
      this.pendingPushResolve();
      this.pendingPushResolve = null;
    }
  }

  /**
   * Close the channel with an error. Any pending `pull()` rejects with the error.
   */
  closeWithError(err: unknown): void {
    this.closed = true;
    this.error = err;
    if (this.pendingPullReject) {
      this.pendingPullReject(err);
      this.pendingPullResolve = null;
      this.pendingPullReject = null;
    }
    if (this.pendingPushResolve) {
      this.pendingPushResolve();
      this.pendingPushResolve = null;
    }
  }
}

export { StepChannel };
export type { StepYield };
