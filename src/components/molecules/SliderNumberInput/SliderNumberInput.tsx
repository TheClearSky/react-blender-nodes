import { Button } from '@/components/atoms';
import { useClickedOutside } from '@/hooks/useClickedOutside';
import { cn } from '@/utils/cnHelper';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { forwardRef, useRef, useState } from 'react';

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
  HTMLInputElement | HTMLDivElement,
  SliderNumberInputProps
>(
  (
    { name = 'Input', value, onChange = () => {}, className, min, max, step },
    ref,
  ) => {
    //Internal states
    const [valueInner, setValueInner] = useState(value ?? 0);
    const [temporaryValueWhenClicked, setTemporaryValueWhenClicked] =
      useState('');
    const [isClicked, setIsClicked] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    //Derived states
    const valueToUse = value ?? valueInner;
    const stepToUse = Math.abs(
      step ??
        (max === undefined || min === undefined
          ? parseFloat(((valueToUse || 1) / 10).toPrecision(2))
          : parseFloat(((max - min) / 10).toPrecision(2))),
    );

    //Handlers
    function handleChange(value: number) {
      if (min !== undefined && value <= min) {
        value = min;
      } else if (max !== undefined && value >= max) {
        value = max;
      }
      setValueInner(value);
      onChange(value);
    }
    function handleIncrement() {
      handleChange(valueToUse + stepToUse);
    }
    function handleDecrement() {
      handleChange(valueToUse - stepToUse);
    }

    function handleSwitchFromSliderToInput() {
      setTemporaryValueWhenClicked(valueToUse.toFixed(5).replace(/[0]+$/, ''));
      setIsClicked(true);
    }
    function handleTemporaryValueChange(value: string) {
      if (/[^0-9\.\-]/.test(value)) {
        return;
      }
      setTemporaryValueWhenClicked(value);
    }
    function handleSwitchFromInputToSlider() {
      const isNegative = temporaryValueWhenClicked.startsWith('-');
      const textWithJustNumbersAndDecimals =
        temporaryValueWhenClicked.replaceAll(/[^0-9\.]/g, '');
      const firstDecimalIndex = textWithJustNumbersAndDecimals.indexOf('.');
      let finalProcessedNumber = 0;

      if (firstDecimalIndex === -1) {
        finalProcessedNumber = Number(textWithJustNumbersAndDecimals);
      } else {
        const numberBeforeDecimal = textWithJustNumbersAndDecimals
          .substring(0, firstDecimalIndex)
          .replaceAll(/[^0-9]/g, '');
        const numberAfterDecimal = textWithJustNumbersAndDecimals
          .substring(firstDecimalIndex + 1)
          .replaceAll(/[^0-9]/g, '');
        finalProcessedNumber = Number(
          numberBeforeDecimal + '.' + numberAfterDecimal,
        );
      }

      if (isNegative) {
        finalProcessedNumber = -finalProcessedNumber;
      }
      handleChange(finalProcessedNumber);
      setIsClicked(false);
    }

    useClickedOutside(inputRef, handleSwitchFromInputToSlider);
    return !isClicked ? (
      <div
        className={cn(
          'flex items-center gap-0 group/lightParentGroupBasedHover w-max',
          className,
        )}
        ref={ref}
      >
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-r-none w-[30px] p-0 shrink-0'
          onClick={handleDecrement}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-none pl-1.5 pr-0 flex-1 justify-between grid grid-cols-[repeat(2,auto)]'
          onClick={handleSwitchFromSliderToInput}
        >
          <span className='truncate text-left'>{name}</span>
          <span className='truncate'>{valueToUse.toFixed(4)}</span>
        </Button>
        <Button
          color='lightParentGroupBasedHover'
          className='h-[44px] rounded-l-none w-[30px] p-0 shrink-0'
          onClick={handleIncrement}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    ) : (
      <input
        type='text'
        className={cn(
          'h-[44px] rounded-md text-primary-white bg-primary-black font-main px-4 \
        text-[27px] leading-[27px] outline-none focus-visible:!outline-none \
        border-secondary-dark-gray border w-max min-w-0',
          className,
        )}
        size={5}
        ref={inputRef}
        value={temporaryValueWhenClicked}
        onChange={(e) => handleTemporaryValueChange(e.target.value)}
      />
    );
  },
);

SliderNumberInput.displayName = 'SliderNumberInput';

export { SliderNumberInput };
export type { SliderNumberInputProps };
