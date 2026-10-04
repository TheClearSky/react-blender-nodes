import { useClickedOutside } from '@/hooks/useClickedOutside';
import { convertStringToNumber, sanitizeNumberToShowAsText } from '@/utils';
import { cn } from '@/utils/cnHelper';
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/**
 * Native `<input>` attributes this component forwards to the element verbatim,
 * so a consumer can label, identify, size or disable the field.
 *
 * Spelled out rather than derived with `Omit<ComponentPropsWithoutRef<'input'>,
 * …>`: that derivation resolves to `{}` in a consumer whose React JSX types are
 * configured differently from this repo's, which silently drops every forwarded
 * prop from the published `.d.ts` (measured — a linked consumer could not pass
 * `aria-label` or `style`). An explicit list is also the honest public contract:
 * what is NOT here is owned by the component — `value`/`onChange` (the
 * discriminated union below), `size` (the variant, not the HTML character-width
 * attribute), `type` (always `text`, so number mode keeps its own sanitizing),
 * and the keyboard/focus handlers that implement the draft-commit discipline.
 */
type ForwardedInputProps = {
  id?: string;
  name?: string;
  title?: string;
  style?: CSSProperties;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
  autoComplete?: string;
  spellCheck?: boolean;
  inputMode?:
    | 'none'
    | 'text'
    | 'tel'
    | 'url'
    | 'email'
    | 'numeric'
    | 'decimal'
    | 'search';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'data-testid'?: string;
};

/**
 * Props for the Input component
 */
type InputProps = ForwardedInputProps & {
  /**
   * The placeholder for the input
   */
  placeholder?: string;
  /**
   * The class name for the input, overrides the default styles
   */
  className?: string;
  /** Size variant. "normal" is the canvas-friendly 2x default, "small" is compact for panels/drawers. */
  size?: 'normal' | 'small';
  /** When true, calls onChange on every keystroke instead of only on blur/Enter. */
  liveUpdate?: boolean;
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
  (
    {
      placeholder = 'Input',
      className,
      size = 'normal',
      liveUpdate,
      ...restProps
    },
    ref,
  ) => {
    // Split the value/onChange discriminated union from the native props that
    // are forwarded to the element untouched.
    const {
      value,
      onChange,
      allowOnlyNumbers,
      numberOfDecimals,
      ...forwardedProps
    } = restProps as typeof restProps & {
      value?: string | number;
      onChange?: (value: never) => void;
      allowOnlyNumbers?: boolean;
      numberOfDecimals?: number;
    };
    const discriminatedProps = {
      value,
      onChange,
      allowOnlyNumbers,
      numberOfDecimals,
    } as Extract<InputProps, { allowOnlyNumbers?: boolean }>;
    const isSmall = size === 'small';
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
    const isFocusedRef = useRef(false);

    //Derived states
    const valueToUse = discriminatedProps.value ?? valueInner;
    const [temporaryValueWhenClicked, setTemporaryValueWhenClicked] = useState(
      valueToUse.toString(),
    );

    // Re-sync temporaryValueWhenClicked when the parent changes the value prop,
    // but only when the input is not focused (to avoid clobbering user typing)
    useEffect(() => {
      if (!isFocusedRef.current && sanitizedValue !== undefined) {
        setTemporaryValueWhenClicked(sanitizedValue);
      }
    }, [sanitizedValue]);

    //Handlers
    /**
     * Handles the change of the temporary value when the user is typing
     * @param value - The value to set as the temporary value
     */
    function handleTemporaryValueChange(value: string) {
      if (discriminatedProps.allowOnlyNumbers) {
        if (/[^0-9.-]/.test(value)) {
          return;
        }
      }
      setTemporaryValueWhenClicked(value);
      if (liveUpdate && !discriminatedProps.allowOnlyNumbers) {
        discriminatedProps.onChange?.(value);
      }
    }

    /**
     * Handles the setting of the value from the temporary value when the user clicks outside the input
     * - If the temporary value is empty and its a number input, we reset the temporary value to the value of the input (cancelling the change)
     * - If the temporary value is a number, we convert it to a number and sanitize it, then we set the value of the input to the sanitized number
     * - If the temporary value is not a string, we set the value of the input to the temporary value
     */
    function handleSettingValueFromTemporaryValue() {
      if (discriminatedProps.allowOnlyNumbers) {
        const sourceText = temporaryValueWhenClicked || valueToUse.toString();
        // An EMPTY number field has nothing to commit. `convertStringToNumber('')`
        // returns 0, so committing here would turn "unset" into a real 0 — a
        // value the user never typed. Consumers that render an empty box as
        // "auto"/"use the default" lose that state, and because the commit runs
        // on every outside mousedown it happened on ANY click anywhere on the
        // page, for every unset field at once. Cancelling is also what this
        // function's contract has always said it does.
        if (sourceText === '') {
          setTemporaryValueWhenClicked('');
          return;
        }
        const finalProcessedNumber = convertStringToNumber(sourceText);
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

    // Commit on an outside click ONLY if this input is actually being edited.
    //
    // `useClickedOutside` attaches a document-level `mousedown` listener per
    // instance, so without this guard every mounted Input committed its value
    // on every click anywhere on the page — including inputs the user had never
    // touched. In a graph editor that is one dispatch per unset field per click.
    //
    // The handler is still needed for the focused case: a canvas that calls
    // `preventDefault()` on mousedown (as the drag hook does) suppresses the
    // browser's focus change, so `onBlur` never fires and this is the only
    // commit path. When blur DOES fire it clears the flag first, so this
    // becomes a no-op rather than a second commit.
    useClickedOutside(inputRef, () => {
      if (!isFocusedRef.current) return;
      handleSettingValueFromTemporaryValue();
    });
    return (
      <input
        {...forwardedProps}
        type='text'
        className={cn(
          'rbn:rounded-md rbn:text-primary-white rbn:bg-primary-black rbn:font-main \
        rbn:outline-none rbn:focus-visible:outline-none! \
        rbn:border-secondary-dark-gray rbn:border rbn:w-max rbn:min-w-0 rbn:placeholder:text-graph-input-placeholder',
          isSmall
            ? 'rbn:h-[28px] rbn:px-3 rbn:text-[16px] rbn:leading-[16px]'
            : 'rbn:h-[44px] rbn:px-4 rbn:text-[27px] rbn:leading-[27px]',
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
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onMouseMove={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={(e) => {
          isFocusedRef.current = false;
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
export type { InputProps, ForwardedInputProps };
