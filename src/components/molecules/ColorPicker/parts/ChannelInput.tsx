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
  return <div className='w-px self-stretch bg-secondary-dark-gray' />;
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
        'min-w-0 flex-1 bg-transparent outline-none font-mono text-primary-white',
        size === 'small' ? 'px-2 text-[13px]' : 'px-2 text-[20px]',
        error && 'text-red-500',
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
    <label className='relative inline-flex h-full min-w-0 flex-1 items-center'>
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
          'w-full min-w-0 bg-transparent text-center outline-none tabular-nums text-primary-white font-mono',
          size === 'small' ? 'px-1 text-[13px]' : 'px-1.5 text-[20px]',
        )}
      />
      {channel.suffix && (
        <span className='pointer-events-none pr-1 text-[#6B6B6B] text-[12px]'>
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
        'flex items-stretch rounded-md border border-secondary-dark-gray bg-primary-black font-mono',
        isSmall ? 'h-[28px] text-[13px]' : 'h-[44px] text-[20px]',
        className,
      )}
    >
      {showFormat && (
        <>
          <div className='shrink-0 w-fit'>
            <Select
              value={format}
              onValueChange={(value) => {
                if (value) setFormat(value as ColorFormat);
              }}
              size='compact'
            >
              <SelectTrigger className='font-mono uppercase tracking-wide border-0 rounded-none bg-transparent h-full w-fit'>
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
