import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { BottomDrawerDescriptor } from './bottomDrawers';

// ─────────────────────────────────────────────────────
// Context value type
// ─────────────────────────────────────────────────────

type BottomDrawerContextValue = {
  /** Registered drawers in display order — the runner first, when present. */
  drawers: ReadonlyArray<BottomDrawerDescriptor>;
  /**
   * The open drawer's id, ALREADY resolved against `drawers` (an id that is no
   * longer registered reads as `null`). `null` means every drawer is closed.
   */
  openDrawerId: string | null;
  /**
   * Open one drawer (closing any other) or close all with `null`. Accepts the
   * updater form; the updater receives the STORED id, which may be stale — use
   * `openDrawerId` from this context for the resolved value.
   */
  setOpenDrawerId: Dispatch<SetStateAction<string | null>>;
};

const BottomDrawerContext = createContext<BottomDrawerContextValue | null>(
  null,
);

// ─────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────

function useBottomDrawers(): BottomDrawerContextValue {
  const context = useContext(BottomDrawerContext);
  if (!context) {
    throw new Error(
      'useBottomDrawers must be used within a BottomDrawerProvider',
    );
  }
  return context;
}

export { BottomDrawerContext, useBottomDrawers };
export type { BottomDrawerContextValue };
