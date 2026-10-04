import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BottomDrawerContext,
  type BottomDrawerContextValue,
} from './BottomDrawerContext';
import {
  resolveOpenDrawerId,
  type BottomDrawerDescriptor,
} from './bottomDrawers';

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

/**
 * Owns the ONE piece of state behind every bottom drawer: which drawer is
 * open. The runner panel's `isRunnerPanelOpen` is derived from it (see
 * `RecordingViewStateProvider`), so "at most one drawer open" holds by
 * construction rather than by coordination.
 *
 * `drawers` should be a stable reference (memoised by `FullGraph`): the
 * context value is rebuilt whenever it changes, and every drawer's chrome
 * re-renders with it.
 */
function BottomDrawerProvider({
  drawers,
  defaultOpenDrawerId = null,
  onOpenDrawerChange,
  children,
}: {
  /** Registered drawers in display order (runner first, when present). */
  drawers: ReadonlyArray<BottomDrawerDescriptor>;
  /**
   * The drawer that opens by default — at mount if it is registered then, or
   * LATER, the moment it becomes registered while nothing else is open. That
   * is how the runner keeps opening by default even when
   * `functionImplementations` arrives after the first render (lazy imports,
   * feature flags). `FullGraph` passes the runner id.
   */
  defaultOpenDrawerId?: string | null;
  /** Fires with the resolved open id whenever it CHANGES (not on mount). */
  onOpenDrawerChange?: (openDrawerId: string | null) => void;
  children: ReactNode;
}) {
  const isDefaultRegistered =
    defaultOpenDrawerId !== null &&
    drawers.some((drawer) => drawer.id === defaultOpenDrawerId);

  const [storedOpenDrawerId, setOpenDrawerId] = useState<string | null>(() =>
    isDefaultRegistered ? defaultOpenDrawerId : null,
  );
  const openDrawerId = resolveOpenDrawerId(storedOpenDrawerId, drawers);

  // Default drawer registered AFTER mount (the runner's implementations arrive
  // late): open it, unless the user already has another drawer open. The ref
  // tracks the previous registration so StrictMode's double-invoked effect and
  // ordinary re-renders cannot re-fire the transition.
  const wasDefaultRegisteredRef = useRef(isDefaultRegistered);
  useEffect(() => {
    if (isDefaultRegistered && !wasDefaultRegisteredRef.current) {
      setOpenDrawerId((previous) =>
        previous === null ? defaultOpenDrawerId : previous,
      );
    }
    wasDefaultRegisteredRef.current = isDefaultRegistered;
  }, [isDefaultRegistered, defaultOpenDrawerId]);

  // A stored id whose drawer is no longer registered resolves to "closed"
  // above; also FORGET it, so re-registering that drawer later does not pop it
  // open by itself, and so updater-form setters see the same value consumers
  // read.
  useEffect(() => {
    if (storedOpenDrawerId !== null && openDrawerId === null) {
      setOpenDrawerId(null);
    }
  }, [storedOpenDrawerId, openDrawerId]);

  // Observability: report changes of the RESOLVED id. Read through a ref at
  // call time so an inline callback is safe; skipped for the initial value.
  const onOpenDrawerChangeRef = useRef(onOpenDrawerChange);
  onOpenDrawerChangeRef.current = onOpenDrawerChange;
  const reportedOpenDrawerIdRef = useRef(openDrawerId);
  useEffect(() => {
    if (reportedOpenDrawerIdRef.current === openDrawerId) return;
    reportedOpenDrawerIdRef.current = openDrawerId;
    onOpenDrawerChangeRef.current?.(openDrawerId);
  }, [openDrawerId]);

  const value = useMemo<BottomDrawerContextValue>(
    () => ({ drawers, openDrawerId, setOpenDrawerId }),
    [drawers, openDrawerId],
  );

  return (
    <BottomDrawerContext.Provider value={value}>
      {children}
    </BottomDrawerContext.Provider>
  );
}

export { BottomDrawerProvider };
