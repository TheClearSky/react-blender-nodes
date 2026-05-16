import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { Tooltip } from '@/components/atoms/Tooltip/Tooltip';
import { useColorPickerContext } from '../ColorPickerContext';
import { formatColor } from '../lib/color';

type ContrastMetric = 'wcag' | 'apca';

type ColorPickerContrastReadoutProps = {
  metrics?: ContrastMetric[];
  defaultMetric?: ContrastMetric;
  showLabel?: boolean;
  showValue?: boolean;
  showBadges?: boolean;
  className?: string;
};

type PassRow = {
  ok: boolean;
  label: string;
  detail: string;
};

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        ok
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-red-500/15 text-red-400',
      )}
    >
      {children}
    </span>
  );
}

function PopoverContent({
  title,
  rows,
  foregroundColor,
  backgroundColor,
}: {
  title: string;
  rows: PassRow[];
  foregroundColor: string;
  backgroundColor: string;
}) {
  return (
    <div className='flex flex-col gap-1.5 text-left max-w-[220px]'>
      <div className='flex items-center justify-between gap-2'>
        <div className='text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]'>
          {title}
        </div>
        <div className='flex shrink-0 overflow-hidden rounded border border-secondary-dark-gray'>
          <span
            className='block w-3.5 h-3.5'
            style={{ background: foregroundColor }}
          />
          <span
            className='block w-3.5 h-3.5'
            style={{ background: backgroundColor }}
          />
        </div>
      </div>
      <ul className='flex flex-col gap-1'>
        {rows.map((row) => (
          <li key={row.label} className='flex items-start gap-1.5'>
            <span
              className={cn(
                'mt-0.5 inline-flex w-3 h-3 shrink-0 items-center justify-center rounded-full',
                row.ok
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400',
              )}
            >
              {row.ok ? (
                <Check className='w-2 h-2' />
              ) : (
                <X className='w-2 h-2' />
              )}
            </span>
            <div className='flex flex-col'>
              <span className='text-[11px] font-medium leading-tight'>
                {row.label}
              </span>
              <span className='text-[10px] leading-snug text-[#6B6B6B]'>
                {row.detail}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorPickerContrastReadout({
  metrics = ['wcag'],
  defaultMetric,
  showLabel = true,
  showValue = true,
  showBadges = true,
  className,
}: ColorPickerContrastReadoutProps) {
  const { contrast, color, background } = useColorPickerContext();
  const foregroundCss = formatColor(color, 'rgb');
  const backgroundCss = formatColor(background, 'rgb');

  const initial =
    defaultMetric && metrics.includes(defaultMetric)
      ? defaultMetric
      : metrics[0];
  const [active, setActive] = useState<ContrastMetric>(initial);

  useEffect(() => {
    if (!metrics.includes(active)) setActive(metrics[0]);
  }, [metrics, active]);

  const togglable = metrics.length > 1;
  const cycle = () => {
    const index = metrics.indexOf(active);
    setActive(metrics[(index + 1) % metrics.length]);
  };

  const wcagRows: PassRow[] = [
    {
      ok: contrast.wcagLevel.aaNormal,
      label: contrast.wcagLevel.aaNormal ? 'Passes AA' : 'Fails AA',
      detail: 'Body text needs ≥ 4.5:1',
    },
    {
      ok: contrast.wcagLevel.aaaNormal,
      label: contrast.wcagLevel.aaaNormal ? 'Passes AAA' : 'Fails AAA',
      detail: 'Enhanced body text needs ≥ 7:1',
    },
  ];

  const apcaAbs = Math.abs(contrast.apca);
  const apcaRows: PassRow[] = [
    {
      ok: apcaAbs >= 60,
      label: apcaAbs >= 60 ? 'Passes body text' : 'Fails body text',
      detail: 'Body text needs |Lc| ≥ 60',
    },
    {
      ok: apcaAbs >= 75,
      label: apcaAbs >= 75 ? 'Passes headlines' : 'Fails headlines',
      detail: 'Headline / large text needs |Lc| ≥ 75',
    },
  ];

  const popoverTitle =
    active === 'wcag'
      ? `WCAG ${contrast.wcag.toFixed(2)}:1`
      : `APCA Lc ${contrast.apca.toFixed(1)}`;
  const popoverRows = active === 'wcag' ? wcagRows : apcaRows;

  const bodyContent = (
    <>
      {(showLabel || showValue) && (
        <div className='flex items-center gap-1'>
          {showLabel && (
            <span className='text-[#6B6B6B]'>
              {active === 'wcag' ? 'WCAG' : 'APCA'}
            </span>
          )}
          {showValue && (
            <span className='font-mono font-medium text-primary-white'>
              {active === 'wcag'
                ? `${contrast.wcag.toFixed(2)}:1`
                : `Lc ${contrast.apca.toFixed(1)}`}
            </span>
          )}
        </div>
      )}
      {showBadges && active === 'wcag' && (
        <div className='flex items-center gap-0.5'>
          <Badge ok={contrast.wcagLevel.aaNormal}>AA</Badge>
          <Badge ok={contrast.wcagLevel.aaaNormal}>AAA</Badge>
        </div>
      )}
      {showBadges && active !== 'wcag' && (
        <div className='flex items-center gap-0.5'>
          <Badge ok={apcaAbs >= 60}>
            {apcaAbs >= 75 ? 'headline' : apcaAbs >= 60 ? 'body' : 'fail'}
          </Badge>
        </div>
      )}
      {togglable && <span className='ml-auto text-[#6B6B6B]'>⇅</span>}
    </>
  );

  const tooltipContent = (
    <PopoverContent
      title={popoverTitle}
      rows={popoverRows}
      foregroundColor={foregroundCss}
      backgroundColor={backgroundCss}
    />
  );

  return (
    <Tooltip content={tooltipContent} placement='top' maxWidth={260}>
      <div
        onClick={togglable ? cycle : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-secondary-dark-gray px-2 py-1.5 text-[13px]',
          togglable && 'cursor-pointer hover:bg-primary-gray transition-colors',
          className,
        )}
      >
        {bodyContent}
      </div>
    </Tooltip>
  );
}

export { ColorPickerContrastReadout };
export type { ColorPickerContrastReadoutProps, ContrastMetric };
