import { useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalCloseButton,
} from '@/components/atoms/Modal/Modal';
import type { ConnectionNeighborhood } from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';
import { ButtonToggle } from '@/components/molecules/ButtonToggle/ButtonToggle';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { ConnectionMiniMap } from './ConnectionMiniMap';

type ExpandableConnectionMiniMapProps = {
  neighborhood: ConnectionNeighborhood;
  /**
   * The complete-scope graph (all nodes/edges at this connection's level). When
   * provided, a Neighbourhood / Complete map toggle is offered (in the enlarged
   * modal, and inline too when `inlineToggle` is set).
   */
  wholeTree?: ConnectionNeighborhood;
  /** Show the Neighbourhood / Complete map toggle on the inline map too (not
   *  only in the enlarged modal). Requires `wholeTree`. */
  inlineToggle?: boolean;
  /** Inline (collapsed) height in px. Default 170. */
  height?: number;
  highlightColor?: string;
  /** Title shown in the enlarged modal header. */
  title?: ReactNode;
  /** Subtitle under the title in the enlarged modal. */
  description?: ReactNode;
};

const VIEW_OPTIONS = [
  { value: 'neighbourhood', label: 'Neighbourhood' },
  { value: 'tree', label: 'Complete map' },
] as const;

/**
 * A read-only connection mini-map with a corner "maximize" button that opens
 * the same neighbourhood in a large modal (~90vw × 85vh — not edge-to-edge).
 * The inline map and the enlarged map are independent ReactFlow instances, each
 * with its own camera/fitView. The maximize button is an overlay sibling of the
 * map (its own pointer events), so clicking it never starts a pane pan. Drop it
 * anywhere a ConnectionMiniMap would go and get the enlarge affordance for free.
 */
function ExpandableConnectionMiniMap({
  neighborhood,
  wholeTree,
  inlineToggle = false,
  height = 170,
  highlightColor,
  title,
  description,
}: ExpandableConnectionMiniMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'neighbourhood' | 'tree'>('neighbourhood');
  const theme = useGraphTheme();
  const activeData = view === 'tree' && wholeTree ? wholeTree : neighborhood;
  const showInlineToggle = inlineToggle && !!wholeTree;

  return (
    <div className='rbn:flex rbn:flex-col rbn:gap-2'>
      {showInlineToggle && (
        <div className='rbn:flex rbn:shrink-0 rbn:justify-end'>
          <ButtonToggle
            size='small'
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
          />
        </div>
      )}

      <div className='rbn:relative'>
        {/* key on `view` (only when the inline toggle is active) so switching
            datasets remounts the map and re-runs fitView at the new bounds. */}
        <ConnectionMiniMap
          key={showInlineToggle ? view : undefined}
          neighborhood={showInlineToggle ? activeData : neighborhood}
          height={height}
          highlightColor={highlightColor}
        />
        <button
          type='button'
          aria-label='Expand'
          onClick={() => setExpanded(true)}
          className='rbn:absolute rbn:top-1 rbn:right-1 rbn:z-10 rbn:rounded rbn:bg-primary-gray/80 rbn:p-1 rbn:text-primary-white/80 rbn:hover:text-primary-white rbn:hover:bg-primary-gray rbn:transition-colors rbn:focus:outline-none'
        >
          <Maximize2 className='rbn:w-3.5 rbn:h-3.5' />
        </button>
      </div>

      <Modal open={expanded} onOpenChange={setExpanded}>
        <ModalContent
          size='fullscreen'
          className={theme?.modal?.content}
          overlayClassName={theme?.modal?.overlay}
          // The embedded ReactFlow takes focus on pan/zoom and swallows the
          // Escape keydown before it bubbles to Radix's document listener, so
          // Escape wouldn't close the modal. Catch it in the capture phase
          // (runs before the map's handlers) and close here instead.
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setExpanded(false);
            }
          }}
        >
          <ModalHeader className={theme?.modal?.header}>
            <ModalTitle className={theme?.modal?.title}>
              {title ?? 'Connection preview'}
            </ModalTitle>
            <ModalDescription>
              {description ?? 'Read-only preview — pan and zoom to explore.'}
            </ModalDescription>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody
            className={cn(
              'rbn:p-2 rbn:min-h-0 rbn:flex rbn:flex-col rbn:gap-2',
              theme?.modal?.body,
            )}
          >
            {wholeTree && (
              <div className='rbn:flex rbn:shrink-0 rbn:justify-end'>
                <ButtonToggle
                  size='small'
                  value={view}
                  onChange={setView}
                  options={VIEW_OPTIONS}
                />
              </div>
            )}
            {/* key on `view` so switching datasets remounts the map and re-runs
                fitView at the new node set's bounds. */}
            <div className='rbn:min-h-0 rbn:flex-1'>
              <ConnectionMiniMap
                key={view}
                neighborhood={activeData}
                height='100%'
                highlightColor={highlightColor}
              />
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}

export { ExpandableConnectionMiniMap };
export type { ExpandableConnectionMiniMapProps };
