import { Button, Input } from '@/components/atoms';
import { cn } from '@/utils/cnHelper';
import { useDrag } from '@/hooks/useDrag';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';

type SliderNumberInputProps = {
  name?: string;
  value?: number;
  onChange?: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
};

const SliderNumberInput = forwardRef<
  HTMLInputElement & HTMLDivElement,
  SliderNumberInputProps
>(
  (
    { name = 'Input', value, onChange = () => {}, className, min, max, step },
    ref,
  ) => {
    //Internal states
    const [valueInner, setValueInner] = useState(value ?? 0);
    const [isClicked, setIsClicked] = useState(false);
    const cumulativeDragRatio = useRef(0);
    const lastDragTimestamp = useRef(0);

    //Derived states
    const valueToUse = value ?? valueInner;
    const stepToUse = useRef(0);
    useEffect(() => {
      stepToUse.current = Math.abs(
        step ??
          (max === undefined || min === undefined
            ? parseFloat((valueToUse || 1).toString())
            : parseFloat((max - min).toString())),
      );
    }, [valueToUse, step, max, min]);

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

    return !isClicked ? (
      <div
        className={cn(
          'flex items-center gap-0 group/lightParentGroupBasedHover w-max rounded-md bg-primary-gray',
          className,
        )}
        style={gradient !== '' ? { background: gradient } : {}}
        ref={ref}
      >
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-r-none w-[30px] p-0 shrink-0 bg-transparent'
          onClick={() => handleDecrement(0.1)}
          aria-label={`Decrement ${name}`}
          applyHoverStyles={!disableHoverStyles}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-none pl-1.5 pr-0 flex-1 justify-between grid grid-cols-[repeat(2,auto)] bg-transparent'
          applyHoverStyles={!disableHoverStyles}
          ref={dragRef}
        >
          <span className='truncate text-left'>{name}</span>
          <span className='truncate'>{valueToUse.toFixed(4)}</span>
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-l-none w-[30px] p-0 shrink-0 bg-transparent'
          onClick={() => handleIncrement(0.1)}
          aria-label={`Increment ${name}`}
          applyHoverStyles={!disableHoverStyles}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    ) : (
      <Input
        className='w-full'
        placeholder={name}
        value={valueToUse}
        allowOnlyNumbers
        onChange={(value) => handleSwitchFromInputToSlider(value)}
        ref={ref}
      />
    );
  },
);

SliderNumberInput.displayName = 'SliderNumberInput';

export { SliderNumberInput };
export type { SliderNumberInputProps };
