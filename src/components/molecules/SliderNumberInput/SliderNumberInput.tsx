import { Button, Input } from '@/components/atoms';
import { cn } from '@/utils/cnHelper';
import { useDrag } from '@/hooks/useDrag';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';

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
  /** Size variant. "normal" is the canvas-friendly default, "small" is compact for toolbars. */
  size?: 'normal' | 'small';
  /** Number of decimal places to display (default: 4 for normal, 1 for small) */
  decimals?: number;
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
      size = 'normal',
      decimals,
    },
    ref,
  ) => {
    const isSmall = size === 'small';
    const displayDecimals = decimals ?? (isSmall ? 1 : 4);

    //Internal states
    const [valueInner, setValueInner] = useState(value ?? 0);
    const [isClicked, setIsClicked] = useState(false);
    const cumulativeDragRatio = useRef(0);
    const lastDragTimestamp = useRef(0);

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

    //Handlers
    function handleChange(difference: number) {
      setValueInner((prev) => {
        let newValue = prev + difference;
        if (min !== undefined && newValue <= min) {
          newValue = min;
        } else if (max !== undefined && newValue >= max) {
          newValue = max;
        }
        onChange(newValue);
        return newValue;
      });
    }
    function handleIncrement(ratio: number = 0.1) {
      handleChange(stepToUse.current * ratio);
    }
    function handleDecrement(ratio: number = 0.1) {
      handleChange(-stepToUse.current * ratio);
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
        ? `linear-gradient(90deg,#4772b3 ${valuePercentage}%, #545454 ${valuePercentage}%)`
        : '';

    // Size-dependent classes
    const heightClass = isSmall ? 'h-[22px]' : 'h-[44px]';
    const chevronBtnClass = isSmall
      ? `${heightClass} w-[18px]`
      : `${heightClass} w-[30px]`;
    const iconClass = isSmall ? 'h-3 w-3' : '';
    const textClass = isSmall ? 'text-[10px]' : '';
    const centerBtnClass = isSmall
      ? `${heightClass} rounded-none px-1.5 flex-1 justify-between grid grid-cols-[repeat(2,auto)] bg-transparent gap-1`
      : `${heightClass} rounded-none pl-1.5 pr-0 flex-1 justify-between grid grid-cols-[repeat(2,auto)] bg-transparent`;

    return !isClicked ? (
      <div
        className={cn(
          'flex items-center gap-0 group/lightParentGroupBasedHover w-max bg-primary-gray',
          isSmall ? 'rounded-sm' : 'rounded-md',
          className,
        )}
        style={gradient !== '' ? { background: gradient } : {}}
        ref={ref}
      >
        <Button
          color='lightParentGroupBasedHover'
          className={cn(
            chevronBtnClass,
            'rounded-r-none p-0 shrink-0 bg-transparent',
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
          <span className='truncate text-left'>{name}</span>
          <span className='truncate tabular-nums'>
            {valueToUse.toFixed(displayDecimals)}
          </span>
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className={cn(
            chevronBtnClass,
            'rounded-l-none p-0 shrink-0 bg-transparent',
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
        className={cn('w-full', isSmall && 'h-[22px] text-[11px] px-1.5')}
        placeholder={name}
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
