import type { ReactNode } from 'react';

/** The slice of a run target the controls need (id, label, mode, optional icon). */
type RunControlsRunTarget = {
  id: string;
  label: string;
  mode: 'execute' | 'artifact';
  icon?: ReactNode;
};

/**
 * Execution mode: instant runs the whole graph then enables replay,
 * stepByStep pauses between each execution step.
 */
type RunMode = 'instant' | 'stepByStep';

const RUN_MODE_OPTIONS = [
  { value: 'instant' as const, label: 'Instant' },
  { value: 'stepByStep' as const, label: 'Step-by-Step' },
];

export { RUN_MODE_OPTIONS };
export type { RunControlsRunTarget, RunMode };
