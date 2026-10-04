import { Info } from 'lucide-react';
import { cn } from '@/utils';
import { Tooltip } from '../Tooltip/Tooltip';

type InfoHintProps = {
  /** The documentation to show. Line breaks are kept. */
  text: string;
  /** Visibility and size classes (e.g. reveal on a parent's hover). */
  className?: string;
  /** Accessible name — defaults to "About this". */
  label?: string;
};

/**
 * An ⓘ that shows in-app documentation on hover (nodes, node groups, zones,
 * loops, sockets). `nodrag nopan` keep a hover or press on it from dragging
 * the node or panning the canvas; the tooltip portals, so it reads at screen
 * size at any zoom.
 *
 * It takes the colour of the text beside it (`currentColor`) and has no hover
 * style of its own. To reveal it only while a parent is hovered WITHOUT it
 * taking space when hidden, toggle its display from the parent's state:
 * `rbn:hidden rbn:group-hover/<name>:inline-flex` with `rbn:group/<name>` on
 * the parent (Tailwind's named-group variants).
 */
function InfoHint({ text, className, label = 'About this' }: InfoHintProps) {
  return (
    <Tooltip
      content={<span className='rbn:whitespace-pre-line'>{text}</span>}
      maxWidth={320}
      placement='top'
      className={cn(
        'nodrag nopan rbn:inline-flex rbn:shrink-0 rbn:cursor-help rbn:items-center',
        className,
      )}
      triggerProps={
        {
          'aria-label': label,
          role: 'img',
        } as React.HTMLAttributes<HTMLElement>
      }
    >
      <Info className='rbn:h-[0.75em] rbn:w-[0.75em]' aria-hidden='true' />
    </Tooltip>
  );
}

export { InfoHint };
export type { InfoHintProps };
