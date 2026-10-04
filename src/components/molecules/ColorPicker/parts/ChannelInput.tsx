import { useState, useEffect, useMemo, Fragment } from 'react';
import { cn } from '@/utils/cnHelper';
import { useColorPickerContext } from '../ColorPickerContext';
import { parseColor } from '../lib/color';
import {
  colorChannels,
  setColorChannel,
  type ChannelDescriptor,
} from '../lib/channels';
import type { ColorFormat } from '../lib/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/molecules/Select/Select';

type ColorPickerChannelInputProps = {
  showFormat?: boolean;
  className?: string;
  size?: 'normal' | 'small';
};

function formatNumber(value: number, precision: number): string {
  return precision === 0 ? String(Math.round(value)) : value.toFixed(precision);
}

function Divider() {
  return (
    <div className='rbn:w-px rbn:self-stretch rbn:bg-secondary-dark-gray' />
  );
}

function HexField({
  value,
  onCommit,
  size,
}: {
  value: string;
  onCommit: (v: string) => boolean;
  size: 'normal' | 'small';
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDraft(value);
    setError(false);
  }, [value]);

  const commit = (v: string) => {
    const success = onCommit(v.trim());
    setError(!success);
  };

  return (
    <input
      type='text'
      spellCheck={false}
      autoComplete='off'
      aria-label='Hex value'
      aria-invalid={error || undefined}
      value={draft}
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
          setDraft(value);
          setError(false);
        }
      }}
      className={cn(
        'rbn:min-w-0 rbn:flex-1 rbn:bg-transparent rbn:outline-none rbn:font-mono rbn:text-primary-white',
        size === 'small'
          ? 'rbn:px-2 rbn:text-[13px]'
          : 'rbn:px-2 rbn:text-[20px]',
        error && 'rbn:text-red-500',
      )}
    />
  );
}

function ChannelField({
  channel,
  onChange,
  onPasteColor,
  size,
}: {
  channel: ChannelDescriptor;
  onChange: (next: number) => void;
  onPasteColor: (raw: string) => boolean;
  size: 'normal' | 'small';
}) {
  const display = formatNumber(channel.value, channel.precision);
  const [draft, setDraft] = useState(display);

  useEffect(() => {
    setDraft(display);
  }, [display]);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      setDraft(display);
      return;
    }
    onChange(parsed);
  };

  const step = (delta: number) => {
    const parsed = parseFloat(draft);
    const base = Number.isNaN(parsed) ? channel.value : parsed;
    onChange(base + delta);
  };

  return (
    <label className='rbn:relative rbn:inline-flex rbn:h-full rbn:min-w-0 rbn:flex-1 rbn:items-center'>
      <input
        type='text'
        inputMode='decimal'
        spellCheck={false}
        autoComplete='off'
        aria-label={channel.label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text') ?? '';
          if (parseColor(text.trim())) {
            e.preventDefault();
            onPasteColor(text);
          }
        }}
        onKeyDown={(e) => {
          const big = e.shiftKey ? channel.bigStep : channel.step;
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(big);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-big);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          } else if (e.key === 'Escape') {
            setDraft(display);
          }
        }}
        className={cn(
          'rbn:w-full rbn:min-w-0 rbn:bg-transparent rbn:text-center rbn:outline-none rbn:tabular-nums rbn:text-primary-white rbn:font-mono',
          size === 'small'
            ? 'rbn:px-1 rbn:text-[13px]'
            : 'rbn:px-1.5 rbn:text-[20px]',
        )}
      />
      {channel.suffix && (
        <span className='rbn:pointer-events-none rbn:pr-1 rbn:text-graph-input-placeholder rbn:text-[12px]'>
          {channel.suffix}
        </span>
      )}
    </label>
  );
}

function ColorPickerChannelInput({
  showFormat = true,
  className,
  size = 'small',
}: ColorPickerChannelInputProps) {
  const {
    color,
    format,
    formatted,
    setFormat,
    setColor,
    setFromString,
    formats,
  } = useColorPickerContext();

  const channels = useMemo(() => colorChannels(color, format), [color, format]);

  const handleChannelChange = (key: string, value: number) => {
    setColor(setColorChannel(color, format, key, value));
  };

  const isSmall = size === 'small';

  return (
    <div
      className={cn(
        'rbn:flex rbn:items-stretch rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:font-mono',
        isSmall
          ? 'rbn:h-[28px] rbn:text-[13px]'
          : 'rbn:h-[44px] rbn:text-[20px]',
        className,
      )}
    >
      {showFormat && (
        <>
          <div className='rbn:shrink-0 rbn:w-fit'>
            <Select
              value={format}
              onValueChange={(value) => {
                if (value) setFormat(value as ColorFormat);
              }}
              size='compact'
            >
              <SelectTrigger className='rbn:font-mono rbn:uppercase rbn:tracking-wide rbn:border-0 rbn:rounded-none rbn:bg-transparent rbn:h-full rbn:w-fit'>
                <SelectValue placeholder='fmt' />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Divider />
        </>
      )}
      {format === 'hex' ? (
        <HexField value={formatted} onCommit={setFromString} size={size} />
      ) : (
        channels.map((ch, i) => (
          <Fragment key={ch.key}>
            <ChannelField
              channel={ch}
              onChange={(v) => handleChannelChange(ch.key, v)}
              onPasteColor={setFromString}
              size={size}
            />
            {i < channels.length - 1 && <Divider />}
          </Fragment>
        ))
      )}
    </div>
  );
}

export { ColorPickerChannelInput };
export type { ColorPickerChannelInputProps };
