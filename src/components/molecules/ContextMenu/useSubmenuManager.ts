import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
} from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/react';
import type { ContextMenuItem } from './ContextMenu';

const SUBMENU_DURATION_MS = 100;
const CONTENT_FADE_DURATION_MS = 100;
const HOVER_OPEN_DELAY = 75;
const HOVER_SWITCH_DELAY = 100;

/**
 * Manages all submenu interaction state for a ContextMenuSubmenu:
 * - Which submenu is active (hover timers, open/close delays)
 * - Crossfade animation phases between submenus
 * - Exit animation content preservation
 * - ResizeObserver-driven container sizing
 * - Floating UI reference switching
 */
function useSubmenuManager(
  subItems: ContextMenuItem[],
  onItemClick?: (item: ContextMenuItem) => void,
) {
  // ── Which item's submenu is active ──
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);

  // ── DOM refs for each item row (used as floating-ui reference) ──
  const itemRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Delay-based hover management ──
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInFloatingRef = useRef(false);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // ── Crossfade state ──
  const [prevSubItems, setPrevSubItems] = useState<ContextMenuItem[] | null>(
    null,
  );
  const [crossfadePhase, setCrossfadePhase] = useState<
    'initial' | 'animating' | null
  >(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevActiveIdRef = useRef<string | null>(null);

  // ── Size animation state ──
  const [containerSize, setContainerSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const incomingRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const hasEverMeasured = useRef(false);

  const isSwitchingRef = useRef(false);

  // ── Exit animation state ──
  const [exitSubItems, setExitSubItems] = useState<ContextMenuItem[] | null>(
    null,
  );
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCrossfadeTimers = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Batched submenu switcher ──
  const switchSubmenu = useCallback(
    (newId: string | null) => {
      const prevId = prevActiveIdRef.current;
      if (newId === prevId) return;
      prevActiveIdRef.current = newId;

      clearCrossfadeTimers();

      if (prevId !== null && newId !== null) {
        isSwitchingRef.current = true;
        const prevItem = subItems.find((item) => item.id === prevId);
        if (prevItem?.subItems) {
          setPrevSubItems(prevItem.subItems);
        }
        setCrossfadePhase('initial');
      } else {
        isSwitchingRef.current = false;
        setCrossfadePhase(null);
        setPrevSubItems(null);
        if (newId === null) {
          const closingItem = subItems.find((item) => item.id === prevId);
          if (closingItem?.subItems) {
            setExitSubItems(closingItem.subItems);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
            exitTimerRef.current = setTimeout(() => {
              setExitSubItems(null);
              hasEverMeasured.current = false;
              setContainerSize(null);
              exitTimerRef.current = null;
            }, SUBMENU_DURATION_MS);
          } else {
            hasEverMeasured.current = false;
            setContainerSize(null);
          }
        } else {
          if (exitTimerRef.current) {
            clearTimeout(exitTimerRef.current);
            exitTimerRef.current = null;
          }
          setExitSubItems(null);
        }
      }

      setActiveSubmenuId(newId);
    },
    [subItems, clearCrossfadeTimers],
  );

  // ── Phase 2: after 'initial' paints, flip to 'animating' ──
  useEffect(() => {
    if (crossfadePhase !== 'initial') return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setCrossfadePhase('animating');
        rafRef.current = null;

        transitionTimerRef.current = setTimeout(() => {
          setCrossfadePhase(null);
          setPrevSubItems(null);
          isSwitchingRef.current = false;
          transitionTimerRef.current = null;
        }, CONTENT_FADE_DURATION_MS);
      });
    });

    return clearCrossfadeTimers;
  }, [crossfadePhase, clearCrossfadeTimers]);

  // Look up the active item's subItems
  const activeItem = activeSubmenuId
    ? subItems.find((item) => item.id === activeSubmenuId)
    : null;
  const activeSubItems = activeItem?.subItems ?? null;

  // ── ResizeObserver on the incoming content ──
  useLayoutEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const el = incomingRef.current;
    if (!el || !activeSubmenuId) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        hasEverMeasured.current = true;
        setContainerSize({ w: width, h: height });
      }
    });

    ro.observe(el);
    observerRef.current = ro;

    return () => ro.disconnect();
  }, [activeSubmenuId]);

  // ── Floating UI ──
  const activeRef = activeSubmenuId
    ? itemRefsMap.current.get(activeSubmenuId)
    : null;

  const { refs, floatingStyles, placement } = useFloating({
    open: activeSubmenuId !== null,
    onOpenChange: (open) => {
      if (!open) switchSubmenu(null);
    },
    strategy: 'fixed',
    placement: 'right-start',
    middleware: [
      offset(5),
      flip({ fallbackPlacements: ['left-start'] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    if (activeRef) {
      refs.setReference(activeRef);
    }
  }, [activeRef, refs]);

  // ── Callbacks ──
  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.onClick) {
        item.onClick();
      }
      if (onItemClick) {
        onItemClick(item);
      }
    },
    [onItemClick],
  );

  const handleHover = useCallback(
    (itemId: string | null) => {
      clearHoverTimer();

      if (itemId === activeSubmenuId) return;

      if (activeSubmenuId === null) {
        if (itemId !== null) {
          hoverTimerRef.current = setTimeout(() => {
            switchSubmenu(itemId);
            hoverTimerRef.current = null;
          }, HOVER_OPEN_DELAY);
        }
      } else if (itemId !== null) {
        hoverTimerRef.current = setTimeout(() => {
          switchSubmenu(itemId);
          hoverTimerRef.current = null;
        }, HOVER_SWITCH_DELAY);
      } else {
        hoverTimerRef.current = setTimeout(() => {
          if (!isInFloatingRef.current) {
            switchSubmenu(null);
          }
          hoverTimerRef.current = null;
        }, HOVER_SWITCH_DELAY);
      }
    },
    [activeSubmenuId, clearHoverTimer, switchSubmenu],
  );

  const handleFloatingMouseEnter = useCallback(() => {
    isInFloatingRef.current = true;
    clearHoverTimer();
  }, [clearHoverTimer]);

  const handleFloatingMouseLeave = useCallback(() => {
    isInFloatingRef.current = false;
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      switchSubmenu(null);
      hoverTimerRef.current = null;
    }, HOVER_OPEN_DELAY);
  }, [clearHoverTimer, switchSubmenu]);

  const handleListMouseLeave = useCallback(() => {
    if (!isInFloatingRef.current) {
      clearHoverTimer();
      hoverTimerRef.current = setTimeout(() => {
        if (!isInFloatingRef.current) {
          switchSubmenu(null);
        }
        hoverTimerRef.current = null;
      }, HOVER_OPEN_DELAY);
    }
  }, [clearHoverTimer, switchSubmenu]);

  const makeItemRef = useCallback(
    (itemId: string) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefsMap.current.set(itemId, el);
      } else {
        itemRefsMap.current.delete(itemId);
      }
    },
    [],
  );

  const isOpen = activeSubmenuId !== null;

  const panelSizeStyles: React.CSSProperties =
    containerSize !== null
      ? {
          width: containerSize.w,
          height: containerSize.h,
          overflow: 'hidden',
        }
      : {};

  return {
    activeSubmenuId,
    activeSubItems,
    prevSubItems,
    exitSubItems,
    crossfadePhase,
    containerSize,
    isSwitching: isSwitchingRef.current,
    isOpen,
    panelSizeStyles,
    incomingRef,
    floatingRefs: refs,
    floatingStyles,
    placement,
    // Callbacks
    handleItemClick,
    handleHover,
    handleFloatingMouseEnter,
    handleFloatingMouseLeave,
    handleListMouseLeave,
    makeItemRef,
    // Constants re-exported for rendering
    SUBMENU_DURATION_MS,
    CONTENT_FADE_DURATION_MS,
  };
}

export { useSubmenuManager };
