import { useState, useRef, useEffect } from 'react';

const DEFAULT_DURATION_MS = 250;

/**
 * Web Animations API-based mount/unmount lifecycle for slide animations.
 *
 * Uses single-keyframe animations so interrupted toggles (e.g. rapid
 * close→open) smoothly reverse from the current position rather than
 * snapping. The clip wrapper pattern (overflow:hidden on parent)
 * prevents layout overflow.
 *
 * @param isOpen - Whether the element should be visible
 * @param options - Animation configuration
 * @returns mounted state, ref to attach to the animated element, and initial inline style
 */
function useSlideAnimation(
  isOpen: boolean,
  options: {
    durationMs?: number;
    hiddenTransform?: string;
    visibleTransform?: string;
    easing?: string;
  } = {},
) {
  const {
    durationMs = DEFAULT_DURATION_MS,
    hiddenTransform = 'translateY(100%)',
    visibleTransform = 'translateY(0)',
    easing = 'cubic-bezier(0.32, 0.72, 0, 1)',
  } = options;

  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  // Mount the element when opening
  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  // Run the Web Animation when mounted state or isOpen changes.
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;

    // Commit the animation's current position to inline style before
    // cancelling. Without this, cancel() removes fill:forwards and the
    // element snaps back to the baseline inline style (hiddenTransform),
    // making the exit animation a no-op.
    if (animRef.current) {
      el.style.transform = getComputedStyle(el).transform;
      animRef.current.cancel();
      animRef.current = null;
    }

    const targetTransform = isOpen ? visibleTransform : hiddenTransform;

    // Single-keyframe form: the browser interpolates from the element's
    // current computed transform to the target. This means interrupted
    // animations smoothly reverse from wherever the element currently is.
    const anim = el.animate([{ transform: targetTransform }], {
      duration: durationMs,
      easing,
      fill: 'forwards',
    });
    animRef.current = anim;

    if (!isOpen) {
      anim.onfinish = () => setMounted(false);
    }
  }, [isOpen, mounted, durationMs, hiddenTransform, visibleTransform, easing]);

  // Inline style keeps the element at the hidden position on first paint
  // (before the effect runs). The animation's fill: 'forwards' overrides
  // this while active.
  const style: React.CSSProperties = { transform: hiddenTransform };

  return { mounted, ref, style };
}

export { useSlideAnimation };
