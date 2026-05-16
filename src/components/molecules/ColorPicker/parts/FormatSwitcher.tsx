import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import type { ColorFormat } from '../lib/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/molecules/Select/Select';

type ColorPickerFormatSwitcherProps = {
  formats?: ColorFormat[];
  className?: string;
  size?: 'normal' | 'small';
};

function ColorPickerFormatSwitcher({
  formats: formatsProp,
  className,
  size = 'small',
}: ColorPickerFormatSwitcherProps) {
  const {
    format,
    setFormat,
    formats: contextFormats,
  } = useColorPickerContext();
  const formats = formatsProp ?? contextFormats;

  return (
    <Select
      value={format}
      onValueChange={(value) => {
        if (value) setFormat(value as ColorFormat);
      }}
      renderInline
      size={size === 'small' ? 'compact' : 'normal'}
    >
      <SelectTrigger
        className={cn('font-mono uppercase tracking-wide w-fit', className)}
      >
        <SelectValue placeholder='Format' />
      </SelectTrigger>
      <SelectContent>
        {formats.map((formatOption) => (
          <SelectItem key={formatOption} value={formatOption}>
            {formatOption}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { ColorPickerFormatSwitcher };
export type { ColorPickerFormatSwitcherProps };
