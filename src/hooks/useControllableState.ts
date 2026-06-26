import { useCallback, useRef, useState } from 'react';

type UseControllableStateOptions<T> = {
  /** The controlled value. When `undefined`, the hook is uncontrolled. */
  value?: T;
  /** Initial value used while uncontrolled. */
  defaultValue: T;
  /** Called on every set (controlled or uncontrolled). */
  onChange?: (value: T) => void;
};

/**
 * A `useState`-shaped primitive that is controlled when `value` is provided and
 * uncontrolled otherwise — the shared distillation of the repo's existing
 * controlled/uncontrolled pattern (the `Input` `value ?? valueInner` idiom and
 * `useNodeRunner`'s `executionRecord`). The latest `onChange` is read through a
 * ref so the returned setter is referentially stable.
 *
 * Intentionally returns a `useState`-shaped `[value, setValue]` tuple — the
 * documented exception to the repo's object-return hook convention, because this
 * is a `useState` drop-in primitive (see `docs/codingGuidelines.md`).
 */
function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<T>(defaultValue);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const currentValue = isControlled ? (value as T) : internalValue;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternalValue(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [currentValue, setValue];
}

export { useControllableState };
export type { UseControllableStateOptions };
