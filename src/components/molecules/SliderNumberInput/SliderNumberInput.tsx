import { Button, Input } from '@/components/atoms';
import { cn } from '@/utils/cnHelper';
import { useDrag } from '@/hooks/useDrag';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * Props for the SliderNumberInput component
 */
type SliderNumberInputProps = {
  /** Display name for the input */
  name?: string;
  /** Current numeric value */
  value?: number;
  /** Callback when the value changes */
  onChange?: (value: number) => void;
  /** Additional CSS classes */
  className?: string;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step size for value changes */
  step?: number;
  /**
   * Exact change for one chevron click (◂ / ▸). Without it a click moves
   * 10 % of `step` (or of the auto step, which is proportional to the value —
   * 1 → 1.1 → 1.21…). Drags are unaffected: they stay proportional.
   */
  increment?: number;
  /** Size variant. "normal" is the canvas-friendly default, "small" is compact for toolbars. */
  size?: 'normal' | 'small';
  /** Number of decimal places to display (default: 4 for normal, 1 for small) */
  decimals?: number;
  /**
   * Text to show on the slider face INSTEAD of a number while `value` is
   * `undefined`.
   *
   * Without this the face reads `value ?? 0`, so an input whose real state is
   * "no value set — the implementation default applies" displays `0.0000`.
   * On a frequency or a decay time that is not a cosmetic difference, it is a
   * wrong reading: zero is a value, and "unset" is not.
   *
   * OPT-IN BY DESIGN. Omitting it leaves every existing call site byte-for-byte
   * unchanged, which matters because this control is also used UNCONTROLLED
   * (no `value` prop, internal state only) — those callers must keep showing
   * their number, not a placeholder, and they never pass this.
   */
  placeholder?: string;
  /**
   * Full, spoken name for the whole control.
   *
   * `name` is the SHORT label shown on screen (`dur`, `min`, `t`) so the
   * control can stay narrow; this is the long form screen readers announce.
   * It is applied to BOTH branches: as the name of the `role='group'` wrapper
   * while the control is a slider, and as the `aria-label` of the text field
   * once it is clicked into. The clicked branch is the state where the name
   * matters most — the user is committing a value — and without this the field
   * falls back to naming itself by its 3-character `placeholder`.
   *
   * Callers that wrap this control in a `<label>` to supply the name instead
   * should NOT: a `<label>` binds to its first labelable descendant, which is
   * the decrement chevron, and the browser then propagates `:hover` to that
   * chevron from anywhere inside the label.
   */
  ariaLabel?: string;
};

/**
 * A combined slider and number input component with drag functionality
 *
 * This component provides an intuitive way to input and adjust numeric values
 * through both dragging and direct input. It features a slider interface with
 * increment/decrement buttons and switches to a text input when clicked.
 *
 * Features:
 * - Drag-to-adjust functionality with visual feedback
 * - Increment/decrement buttons for precise control
 * - Click-to-edit mode with text input
 * - Min/max value constraints
 * - Customizable step size
 * - Blender-inspired dark theme styling
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the component
 * @returns JSX element containing the slider number input
 *
 * @example
 * ```tsx
 * // Basic usage
 * <SliderNumberInput
 *   name="Price"
 *   value={10.5}
 *   onChange={(value) => setPrice(value)}
 * />
 *
 * // With constraints
 * <SliderNumberInput
 *   name="Temperature"
 *   value={25}
 *   min={0}
 *   max={100}
 *   step={0.5}
 *   onChange={(value) => setTemperature(value)}
 * />
 *
 * // Controlled component
 * const [value, setValue] = useState(42);
 * <SliderNumberInput
 *   name="Count"
 *   value={value}
 *   onChange={setValue}
 *   min={0}
 *   max={1000}
 * />
 *
 * // Small variant for toolbars
 * <SliderNumberInput
 *   name="Interval"
 *   value={1}
 *   min={0.5}
 *   max={30}
 *   step={0.5}
 *   size="small"
 *   onChange={(value) => setInterval(value)}
 * />
 * ```
 */
const SliderNumberInput = forwardRef<
  HTMLInputElement & HTMLDivElement,
  SliderNumberInputProps
>(
  (
    {
      name = 'Input',
      value,
      onChange = () => {},
      className,
      min,
      max,
      step,
      increment,
      size = 'normal',
      decimals,
      ariaLabel,
      placeholder,
    },
    ref,
  ) => {
    const isSmall = size === 'small';
    const displayDecimals = decimals ?? (isSmall ? 1 : 4);
    /**
     * Show the placeholder only while the control is CONTROLLED-but-unset.
     * `value === undefined` alone is not enough: an uncontrolled slider also
     * has no `value`, and it must keep showing its own number.
     */
    const showPlaceholder = placeholder !== undefined && value === undefined;

    //Internal states
    const [valueInner, setValueInner] = useState(value ?? 0);
    const [isClicked, setIsClicked] = useState(false);
    const cumulativeDragRatio = useRef(0);
    const lastDragTimestamp = useRef(0);
    // Mirrors valueInner so handleChange can compute the next value and notify
    // the parent WITHOUT calling onChange inside the setValueInner updater
    // (which runs during render). Updated synchronously in handleChange so
    // rapid successive changes chain the same way the updater's `prev` did.
    const valueInnerRef = useRef(valueInner);

    // Sync the internal chain state when the CONTROLLED value changes
    // EXTERNALLY (programmatic UPDATE_INPUT_VALUE — seeded defaults, undo/
    // redo, collaborative edits). Internal changes are already synced inside
    // handleChange before onChange fires, so the prop echoing back compares
    // equal and this is a no-op for them. Without this, the first increment/
    // decrement after an external change chains off the MOUNT-TIME value
    // (often 0) and stomps the controlled value (0.4 → 0.04 instead of 0.44).
    useEffect(() => {
      if (value !== undefined && value !== valueInnerRef.current) {
        valueInnerRef.current = value;
        setValueInner(value);
      }
    }, [value]);

    //Derived states
    const valueToUse = value ?? valueInner;
    // Compute the effective step for drag/increment operations.
    //
    // The step represents the value change for a full-width drag (ratio=1).
    // The drag handler fires in ~5% increments, so effective per-tick
    // change ≈ step × 0.05.
    //
    // Priority:
    //   1. Explicit `step` prop — always wins.
    //   2. `min`/`max` range — use the range as the proportional base.
    //   3. Fallback — proportional to |value| (a full drag roughly
    //      doubles/halves the value), floored by display precision so
    //      zero or tiny values can't trap the drag.
    const stepToUse = useRef(0);
    useEffect(() => {
      if (step !== undefined) {
        stepToUse.current = Math.abs(step);
      } else if (min !== undefined && max !== undefined) {
        stepToUse.current = Math.abs(max - min);
      } else {
        const minStep = Math.pow(10, -displayDecimals);
        stepToUse.current = Math.max(
          Math.abs(parseFloat((valueToUse || 1).toString())),
          minStep,
        );
      }
    }, [valueToUse, step, displayDecimals, max, min]);

    // Use the drag hook
    const { isDragging, dragRef } = useDrag({
      onMove: (movementX, _movementY, _deltaX, _deltaY, width) => {
        const distanceRatio = movementX / (width + 60);
        cumulativeDragRatio.current += distanceRatio;
        if (
          Math.abs(cumulativeDragRatio.current) > 0.05 &&
          Date.now() - lastDragTimestamp.current > 50
        ) {
          lastDragTimestamp.current = Date.now();
          handleChange(stepToUse.current * cumulativeDragRatio.current);
          cumulativeDragRatio.current = 0;
        }
      },
      onClick: handleSwitchFromSliderToInput,
      clickThreshold: 2,
    });

    // Re-anchor the internal chain to the DISPLAYED value at the START of each
    // drag/click gesture. The [value] sync effect above only fires when the
    // prop CHANGES, so it cannot observe a parent that CLAMPS or QUANTIZES the
    // emitted value back to an UNCHANGED prop — e.g. Max Loops
    // `Math.max(1, round(v))` at the floor: dragging left emits 0.92, 0.84, …
    // which all quantize back to 1, so the prop never changes while
    // `valueInnerRef` sinks unboundedly below the floor. The next opposite
    // drag then shows a multi-second "dead zone" as the chain climbs back.
    // Anchoring on gesture start makes every gesture begin from what the user
    // actually sees, without touching the within-gesture accumulation that is
    // needed to cross a rounding quantum.
    const wasDraggingRef = useRef(false);
    useLayoutEffect(() => {
      if (isDragging && !wasDraggingRef.current) {
        valueInnerRef.current = valueToUse;
      }
      wasDraggingRef.current = isDragging;
    }, [isDragging, valueToUse]);

    //Handlers
    function handleChange(difference: number) {
      let newValue = valueInnerRef.current + difference;
      if (min !== undefined && newValue <= min) {
        newValue = min;
      } else if (max !== undefined && newValue >= max) {
        newValue = max;
      }
      // Update the ref first so successive calls within one tick chain off the
      // latest value; then commit state and notify the parent — both outside
      // the updater, so onChange no longer runs during render.
      valueInnerRef.current = newValue;
      setValueInner(newValue);
      onChange(newValue);
    }
    function handleIncrement(ratio: number = 0.1) {
      handleChange(
        increment !== undefined
          ? Math.abs(increment)
          : stepToUse.current * ratio,
      );
    }
    function handleDecrement(ratio: number = 0.1) {
      handleChange(
        -(increment !== undefined
          ? Math.abs(increment)
          : stepToUse.current * ratio),
      );
    }

    function handleSwitchFromSliderToInput() {
      setIsClicked(true);
    }
    function handleSwitchFromInputToSlider(newValue: number) {
      handleChange(newValue - valueToUse);
      setIsClicked(false);
    }

    const disableHoverStyles = isDragging;

    const valuePercentage =
      min !== undefined &&
      max !== undefined &&
      valueToUse !== undefined &&
      max !== min
        ? ((valueToUse - min) / (max - min)) * 100
        : -1;

    const gradient =
      valuePercentage !== -1
        ? `linear-gradient(90deg,var(--color-primary-blue) ${valuePercentage}%, var(--color-primary-gray) ${valuePercentage}%)`
        : '';

    // Size-dependent classes
    const heightClass = isSmall ? 'rbn:h-[22px]' : 'rbn:h-[44px]';
    const chevronBtnClass = isSmall
      ? `${heightClass} rbn:w-[18px]`
      : `${heightClass} rbn:w-[30px]`;
    const iconClass = isSmall ? 'rbn:h-3 rbn:w-3' : '';
    // 12px: the size of the labels and buttons a compact field sits beside
    // (toolbars, menus). At 10px it read as a different, smaller control.
    const textClass = isSmall ? 'rbn:text-[12px]' : '';
    const centerBtnClass = isSmall
      ? `${heightClass} rbn:rounded-none rbn:px-1.5 rbn:flex-1 rbn:justify-between rbn:grid rbn:grid-cols-[repeat(2,auto)] rbn:bg-transparent rbn:gap-1`
      : `${heightClass} rbn:rounded-none rbn:pl-1.5 rbn:pr-0 rbn:flex-1 rbn:justify-between rbn:grid rbn:grid-cols-[repeat(2,auto)] rbn:bg-transparent`;

    return !isClicked ? (
      <div
        className={cn(
          'rbn:flex rbn:items-center rbn:gap-0 rbn:group/lightParentGroupBasedHover rbn:w-max rbn:bg-primary-gray',
          isSmall ? 'rbn:rounded-sm' : 'rbn:rounded-md',
          className,
        )}
        style={gradient !== '' ? { background: gradient } : {}}
        ref={ref}
        role={ariaLabel !== undefined ? 'group' : undefined}
        aria-label={ariaLabel}
      >
        <Button
          color='lightParentGroupBasedHover'
          className={cn(
            chevronBtnClass,
            'rbn:rounded-r-none rbn:p-0 rbn:shrink-0 rbn:bg-transparent',
            textClass,
          )}
          onClick={() => handleDecrement(0.1)}
          aria-label={`Decrement ${name}`}
          applyHoverStyles={!disableHoverStyles}
        >
          <ChevronLeftIcon className={iconClass || undefined} />
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className={cn(centerBtnClass, textClass)}
          applyHoverStyles={!disableHoverStyles}
          ref={dragRef}
        >
          <span className='rbn:truncate rbn:text-left'>{name}</span>
          <span className='rbn:truncate rbn:tabular-nums'>
            {showPlaceholder
              ? placeholder
              : valueToUse.toFixed(displayDecimals)}
          </span>
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className={cn(
            chevronBtnClass,
            'rbn:rounded-l-none rbn:p-0 rbn:shrink-0 rbn:bg-transparent',
            textClass,
          )}
          onClick={() => handleIncrement(0.1)}
          aria-label={`Increment ${name}`}
          applyHoverStyles={!disableHoverStyles}
        >
          <ChevronRightIcon className={iconClass || undefined} />
        </Button>
      </div>
    ) : (
      <Input
        className={cn(
          'rbn:w-full',
          isSmall && 'rbn:h-[22px] rbn:text-[12px] rbn:px-1.5',
          className,
        )}
        placeholder={name}
        // The name matters MOST here: this is the state where the user is
        // committing a value. Without it the field names itself by its
        // 3-character placeholder (WCAG 3.3.2 / 1.3.1 weak pattern).
        aria-label={ariaLabel}
        // Focus the field as soon as it replaces the slider. `useDrag`'s
        // mousedown calls preventDefault(), which suppresses focus-on-mousedown,
        // and the button that was clicked is then unmounted — so without this
        // the user gets a text box they cannot type into until they click a
        // SECOND time, and assistive tech reading the tree in that window sees
        // the field named by its 3-character placeholder.
        autoFocus
        value={valueToUse}
        allowOnlyNumbers
        numberOfDecimals={displayDecimals}
        onChange={(value) => handleSwitchFromInputToSlider(value)}
        ref={ref}
      />
    );
  },
);

SliderNumberInput.displayName = 'SliderNumberInput';

export { SliderNumberInput };
export type { SliderNumberInputProps };
