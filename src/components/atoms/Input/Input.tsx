import { useClickedOutside } from '@/hooks/useClickedOutside';
import { convertStringToNumber, sanitizeNumberToShowAsText } from '@/utils';
import { cn } from '@/utils/cnHelper';
import { forwardRef, useMemo, useState } from 'react';

/**
 * Props for the Input component
 */
type InputProps = {
  /**
   * The placeholder for the input
   */
  placeholder?: string;
  /**
   * The class name for the input, overrides the default styles
   */
  className?: string;
} & (
  | {
      /**
       * The value of the input, should be a number when allowOnlyNumbers is true
       */
      value?: number;
      /**
       * Whether the input should only allow numbers, influences the type of the value and the onChange function
       * - If true, the value should be a number and the onChange function should accept a number
       * - If false, the value should be a string and the onChange function should accept a string
       * @default false
       */
      allowOnlyNumbers: true;
      /**
       * The onChange function, should accept a number when allowOnlyNumbers is true
       */
      onChange?: (value: number) => void;
      /**
       * The number of decimals to show for the number, only used when allowOnlyNumbers is true
       * @default 5
       */
      numberOfDecimals?: number;
    }
  | {
      /**
       * The value of the input, should be a string when allowOnlyNumbers is false
       */
      value?: string;
      /**
       * Whether the input should only allow numbers, influences the type of the value and the onChange function
       * - If true, the value should be a number and the onChange function should accept a number
       * - If false, the value should be a string and the onChange function should accept a string
       * @default false
       */
      allowOnlyNumbers?: false;
      /**
       * The onChange function, should accept a string when allowOnlyNumbers is false
       */
      onChange?: (value: string) => void;

      /**
       * When type is string, this prop is not used and shouldn't be provided
       */
      numberOfDecimals?: never;
    }
);

/**
 * The Input component
 * - Allows the user to input a string or a number, with the ability to only allow numbers
 * - Temporarily internally manages the value when focused, only sets the value when the user clicks outside the input
 * - Can cancel the change for numbers by clearing the input and clicking outside the input
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ placeholder = 'Input', className, ...discriminatedProps }, ref) => {
    //Sanitize the value to be a string or a number, depending on the allowOnlyNumbers prop
    //For numbers, we remove the trailing zeros after the decimal point if the number is an integer, also we set the number of decimals to 5 by default
    const sanitizedValue = useMemo(() => {
      if (
        discriminatedProps.allowOnlyNumbers &&
        discriminatedProps.value !== undefined
      ) {
        return sanitizeNumberToShowAsText(
          discriminatedProps.value,
          discriminatedProps.numberOfDecimals ?? 5,
        );
      }
      return discriminatedProps.value?.toString();
    }, [
      discriminatedProps.value,
      discriminatedProps.allowOnlyNumbers,
      discriminatedProps.numberOfDecimals,
    ]);

    //Internal states
    const [valueInner, setValueInner] = useState(sanitizedValue ?? '');
    const [inputRef, setInputRef] = useState<HTMLInputElement | null>(null);

    //Derived states
    const valueToUse = discriminatedProps.value ?? valueInner;
    const [temporaryValueWhenClicked, setTemporaryValueWhenClicked] = useState(
      valueToUse.toString(),
    );

    //Handlers
    /**
     * Handles the change of the temporary value when the user is typing
     * @param value - The value to set as the temporary value
     */
    function handleTemporaryValueChange(value: string) {
      if (discriminatedProps.allowOnlyNumbers) {
        if (/[^0-9\.\-]/.test(value)) {
          return;
        }
      }
      setTemporaryValueWhenClicked(value);
    }

    /**
     * Handles the setting of the value from the temporary value when the user clicks outside the input
     * - If the temporary value is empty and its a number input, we reset the temporary value to the value of the input (cancelling the change)
     * - If the temporary value is a number, we convert it to a number and sanitize it, then we set the value of the input to the sanitized number
     * - If the temporary value is not a string, we set the value of the input to the temporary value
     */
    function handleSettingValueFromTemporaryValue() {
      if (discriminatedProps.allowOnlyNumbers) {
        const finalProcessedNumber = convertStringToNumber(
          temporaryValueWhenClicked || valueToUse.toString(),
        );
        const finalProcessedNumberAsString = sanitizeNumberToShowAsText(
          finalProcessedNumber,
          discriminatedProps.numberOfDecimals ?? 5,
        );
        setValueInner(finalProcessedNumberAsString);
        discriminatedProps.onChange?.(finalProcessedNumber);
        setTemporaryValueWhenClicked(finalProcessedNumberAsString);
      } else {
        setValueInner(temporaryValueWhenClicked);
        discriminatedProps.onChange?.(temporaryValueWhenClicked);
        setTemporaryValueWhenClicked(temporaryValueWhenClicked);
      }
    }

    useClickedOutside(inputRef, () => handleSettingValueFromTemporaryValue());
    return (
      <input
        type='text'
        className={cn(
          'h-[44px] rounded-md text-primary-white bg-primary-black font-main px-4 \
        text-[27px] leading-[27px] outline-none focus-visible:!outline-none \
        border-secondary-dark-gray border w-max min-w-0 placeholder:text-[#6B6B6B]',
          className,
        )}
        placeholder={placeholder}
        size={5}
        ref={(refInner) => {
          setInputRef(refInner);
          if (typeof ref === 'function') {
            ref(refInner);
          } else if (ref) {
            ref.current = refInner;
          }
        }}
        value={temporaryValueWhenClicked}
        onChange={(e) => handleTemporaryValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSettingValueFromTemporaryValue();
          }
        }}
        onMouseMove={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSettingValueFromTemporaryValue();
        }}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
