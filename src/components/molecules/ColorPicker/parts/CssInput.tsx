import { useState, useEffect } from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';

type ColorPickerCssInputProps = {
  className?: string;
  size?: 'normal' | 'small';
};

function ColorPickerCssInput({
  className,
  size = 'small',
}: ColorPickerCssInputProps) {
  const { formatted, setFromString } = useColorPickerContext();
  const [draft, setDraft] = useState(formatted);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDraft(formatted);
    setError(false);
  }, [formatted]);

  const commit = (value: string) => {
    const success = setFromString(value.trim());
    setError(!success);
  };

  const isSmall = size === 'small';

  return (
    <input
      type='text'
      spellCheck={false}
      autoComplete='off'
      autoCorrect='off'
      autoCapitalize='off'
      value={draft}
      aria-invalid={error || undefined}
      aria-label='Color value'
      onChange={(e) => {
        setDraft(e.target.value);
        setError(false);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          setDraft(formatted);
          setError(false);
        }
      }}
      className={cn(
        'rbn:rounded-md rbn:text-primary-white rbn:bg-primary-black rbn:font-mono',
        'rbn:outline-none rbn:focus-visible:outline-none',
        'rbn:border rbn:w-full rbn:placeholder:text-graph-input-placeholder',
        error ? 'rbn:border-red-500' : 'rbn:border-secondary-dark-gray',
        isSmall
          ? 'rbn:h-[28px] rbn:px-2.5 rbn:text-[13px]'
          : 'rbn:h-[44px] rbn:px-4 rbn:text-[22px]',
        className,
      )}
    />
  );
}

export { ColorPickerCssInput };
export type { ColorPickerCssInputProps };
