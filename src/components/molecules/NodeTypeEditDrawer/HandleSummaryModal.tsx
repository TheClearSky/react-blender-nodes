import { useState } from 'react';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { buildConsolidatedViews } from './consolidatedViews';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalCloseButton,
} from '@/components/atoms/Modal/Modal';
import { ExpandableConnectionMiniMap } from '@/components/molecules/ConnectionMiniMap';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import type {
  HandleBlastRadius,
  ScopeConnections,
  ConnectionRef,
  ConnectionNeighborhood,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

type GetNeighborhood = (
  scopeId: string,
  edgeId: string,
  /** 'neighbourhood' (default): edge endpoints + 1-hop. 'tree': the whole scope. */
  mode?: 'neighbourhood' | 'tree',
) => ConnectionNeighborhood;

function ConnectionRow({
  scopeId,
  connection,
  getNeighborhood,
}: {
  scopeId: string;
  connection: ConnectionRef;
  getNeighborhood: GetNeighborhood;
}) {
  const [showMap, setShowMap] = useState(false);
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-1.5 text-[12px] text-primary-white/90'>
        <span className='truncate max-w-[110px]'>
          {connection.sourceNodeName}
        </span>
        {connection.sourceHandleName && (
          <span className='text-primary-white/50 truncate'>
            {'▸'} {connection.sourceHandleName}
          </span>
        )}
        <ArrowRight className='w-3 h-3 shrink-0 text-primary-white/50' />
        {connection.targetHandleName && (
          <span className='text-primary-white/50 truncate'>
            {connection.targetHandleName} {'▸'}
          </span>
        )}
        <span className='truncate max-w-[110px]'>
          {connection.targetNodeName}
        </span>
        <button
          type='button'
          onClick={() => setShowMap((v) => !v)}
          className='ml-auto shrink-0 text-[10px] text-primary-white/70 hover:text-primary-white px-1.5 py-0.5 rounded bg-primary-gray'
        >
          {showMap ? 'Hide' : 'Look'}
        </button>
      </div>
      {showMap && (
        <ExpandableConnectionMiniMap
          neighborhood={getNeighborhood(scopeId, connection.edgeId)}
          wholeTree={getNeighborhood(scopeId, connection.edgeId, 'tree')}
          height={140}
          title={[
            connection.sourceNodeName,
            connection.sourceHandleName && `▸ ${connection.sourceHandleName}`,
            '→',
            connection.targetHandleName && `${connection.targetHandleName} ▸`,
            connection.targetNodeName,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}
    </div>
  );
}

function ScopeSection({
  scope,
  getNeighborhood,
}: {
  scope: ScopeConnections;
  getNeighborhood: GetNeighborhood;
}) {
  const [expanded, setExpanded] = useState(true);
  const showManifestations =
    scope.scopeId !== 'root' && scope.instanceManifestations > 1;
  return (
    <div className='rounded border border-secondary-dark-gray'>
      <button
        type='button'
        onClick={() => setExpanded((v) => !v)}
        className='w-full flex items-center gap-2 px-2.5 py-1.5 text-left'
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-primary-white/70 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span className='text-[13px] text-primary-white font-medium truncate'>
          {scope.scopeLabel}
        </span>
        {showManifestations && (
          <span className='text-[10px] text-primary-white/50 shrink-0'>
            {'·'} {scope.instanceManifestations} places
          </span>
        )}
        <span className='ml-auto shrink-0 text-[11px] text-primary-white/80 bg-primary-gray rounded px-1.5'>
          {scope.connections.length}
        </span>
      </button>
      {expanded && (
        <div className='flex flex-col gap-2 px-2.5 pb-2.5'>
          {scope.connections.map((connection) => (
            <ConnectionRow
              key={connection.edgeId}
              scopeId={scope.scopeId}
              connection={connection}
              getNeighborhood={getNeighborhood}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Reusable summary body: the scope-grouped tree of connections a handle
 * deletion would break, with inline mini-diagrams and an on-demand read-only
 * mini-map per connection. Used by both the standalone summary modal and each
 * page of the Save review. Renders purely from precomputed data — no canvas
 * navigation, so the editor's staged state is never disturbed.
 */
function HandleSummaryContent({
  blastRadius,
  getNeighborhood,
  consolidatedMap = false,
}: {
  blastRadius: HandleBlastRadius;
  getNeighborhood: GetNeighborhood;
  /** When set, show ONE whole-structure mini-map with every breaking connection
   *  highlighted at once, instead of a per-connection list (loops/switches —
   *  where a "handle" is a channel spanning a single scope). */
  consolidatedMap?: boolean;
}) {
  if (blastRadius.totalConnections === 0) {
    return (
      <div className='text-[13px] text-primary-white/70 font-main'>
        "{blastRadius.target.handleName}" isn't connected anywhere — deleting it
        won't break any edges.
      </div>
    );
  }
  const cPlural = blastRadius.totalConnections === 1 ? '' : 's';
  const sPlural = blastRadius.scopes.length === 1 ? '' : 's';

  if (consolidatedMap) {
    // One map per channel, all of its breaking edges lit. The Neighbourhood /
    // Complete map toggle lets the user focus or see the whole structure.
    const edgeIds = blastRadius.scopes.flatMap((scope) =>
      scope.connections.map((connection) => connection.edgeId),
    );
    const scopeId = blastRadius.scopes[0]?.scopeId ?? 'root';
    const { neighbourhood, complete } = buildConsolidatedViews(
      getNeighborhood,
      scopeId,
      edgeIds,
    );
    return (
      <div className='flex flex-col gap-2.5 font-main'>
        <div className='text-[13px] text-primary-white/90'>
          Deleting{' '}
          <span className='font-medium'>{blastRadius.target.handleName}</span>{' '}
          breaks{' '}
          <span className='font-medium'>{blastRadius.totalConnections}</span>{' '}
          connection{cPlural} — highlighted below:
        </div>
        <ExpandableConnectionMiniMap
          neighborhood={neighbourhood}
          wholeTree={complete}
          inlineToggle
          height={200}
          title={`${blastRadius.target.handleName} · ${blastRadius.totalConnections} connection${cPlural}`}
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2.5 font-main'>
      <div className='text-[13px] text-primary-white/90'>
        Deleting{' '}
        <span className='font-medium'>{blastRadius.target.handleName}</span> (
        {blastRadius.target.direction}) breaks{' '}
        <span className='font-medium'>{blastRadius.totalConnections}</span>{' '}
        connection{cPlural} across {blastRadius.scopes.length} location{sPlural}
        :
      </div>
      {blastRadius.scopes.map((scope) => (
        <ScopeSection
          key={scope.scopeId}
          scope={scope}
          getNeighborhood={getNeighborhood}
        />
      ))}
    </div>
  );
}

type HandleSummaryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  blastRadius: HandleBlastRadius | null;
  getNeighborhood: GetNeighborhood;
  /** Show one whole-structure mini-map (all breaking edges highlighted) instead
   *  of a per-connection list — used for loop/switch channel deletion. */
  consolidatedMap?: boolean;
};

function HandleSummaryModal({
  isOpen,
  onClose,
  blastRadius,
  getNeighborhood,
  consolidatedMap = false,
}: HandleSummaryModalProps) {
  const theme = useGraphTheme();
  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent
        size='lg'
        className={theme?.modal?.content}
        overlayClassName={theme?.modal?.overlay}
      >
        <ModalHeader className={theme?.modal?.header}>
          <ModalTitle className={theme?.modal?.title}>
            Connections for "{blastRadius?.target.handleName ?? ''}"
          </ModalTitle>
          <ModalDescription>
            Edges that would break if this handle is deleted.
          </ModalDescription>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody className={theme?.modal?.body}>
          {blastRadius && (
            <HandleSummaryContent
              blastRadius={blastRadius}
              getNeighborhood={getNeighborhood}
              consolidatedMap={consolidatedMap}
            />
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export { HandleSummaryModal, HandleSummaryContent };
export type { HandleSummaryModalProps, GetNeighborhood };
