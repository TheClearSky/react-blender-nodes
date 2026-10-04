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
        'rbn:rounded rbn:px-1.5 rbn:py-0.5 rbn:text-[11px] rbn:font-semibold rbn:uppercase rbn:tracking-wider',
        ok
          ? 'rbn:bg-emerald-500/15 rbn:text-emerald-400'
          : 'rbn:bg-red-500/15 rbn:text-red-400',
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
    <div className='rbn:flex rbn:flex-col rbn:gap-1.5 rbn:text-left rbn:max-w-[220px]'>
      <div className='rbn:flex rbn:items-center rbn:justify-between rbn:gap-2'>
        <div className='rbn:text-[11px] rbn:font-semibold rbn:uppercase rbn:tracking-wider rbn:text-graph-input-placeholder'>
          {title}
        </div>
        <div className='rbn:flex rbn:shrink-0 rbn:overflow-hidden rbn:rounded rbn:border rbn:border-secondary-dark-gray'>
          <span
            className='rbn:block rbn:w-3.5 rbn:h-3.5'
            style={{ background: foregroundColor }}
          />
          <span
            className='rbn:block rbn:w-3.5 rbn:h-3.5'
            style={{ background: backgroundColor }}
          />
        </div>
      </div>
      <ul className='rbn:flex rbn:flex-col rbn:gap-1'>
        {rows.map((row) => (
          <li key={row.label} className='rbn:flex rbn:items-start rbn:gap-1.5'>
            <span
              className={cn(
                'rbn:mt-0.5 rbn:inline-flex rbn:w-3 rbn:h-3 rbn:shrink-0 rbn:items-center rbn:justify-center rbn:rounded-full',
                row.ok
                  ? 'rbn:bg-emerald-500/20 rbn:text-emerald-400'
                  : 'rbn:bg-red-500/20 rbn:text-red-400',
              )}
            >
              {row.ok ? (
                <Check className='rbn:w-2 rbn:h-2' />
              ) : (
                <X className='rbn:w-2 rbn:h-2' />
              )}
            </span>
            <div className='rbn:flex rbn:flex-col'>
              <span className='rbn:text-[11px] rbn:font-medium rbn:leading-tight'>
                {row.label}
              </span>
              <span className='rbn:text-[10px] rbn:leading-snug rbn:text-graph-input-placeholder'>
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
        <div className='rbn:flex rbn:items-center rbn:gap-1'>
          {showLabel && (
            <span className='rbn:text-graph-input-placeholder'>
              {active === 'wcag' ? 'WCAG' : 'APCA'}
            </span>
          )}
          {showValue && (
            <span className='rbn:font-mono rbn:font-medium rbn:text-primary-white'>
              {active === 'wcag'
                ? `${contrast.wcag.toFixed(2)}:1`
                : `Lc ${contrast.apca.toFixed(1)}`}
            </span>
          )}
        </div>
      )}
      {showBadges && active === 'wcag' && (
        <div className='rbn:flex rbn:items-center rbn:gap-0.5'>
          <Badge ok={contrast.wcagLevel.aaNormal}>AA</Badge>
          <Badge ok={contrast.wcagLevel.aaaNormal}>AAA</Badge>
        </div>
      )}
      {showBadges && active !== 'wcag' && (
        <div className='rbn:flex rbn:items-center rbn:gap-0.5'>
          <Badge ok={apcaAbs >= 60}>
            {apcaAbs >= 75 ? 'headline' : apcaAbs >= 60 ? 'body' : 'fail'}
          </Badge>
        </div>
      )}
      {togglable && (
        <span className='rbn:ml-auto rbn:text-graph-input-placeholder'>⇅</span>
      )}
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
          'rbn:flex rbn:w-full rbn:items-center rbn:gap-2 rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:px-2 rbn:py-1.5 rbn:text-[13px]',
          togglable &&
            'rbn:cursor-pointer rbn:hover:bg-primary-gray rbn:transition-colors',
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
