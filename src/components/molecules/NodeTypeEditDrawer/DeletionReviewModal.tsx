import { useEffect, useState } from 'react';
import { Button } from '@/components/atoms';
import { Checkbox } from '@/components/atoms/Checkbox/Checkbox';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@/components/atoms/Modal/Modal';
import {
  HandleSummaryContent,
  type GetNeighborhood,
} from './HandleSummaryModal';
import { buildConsolidatedViews } from './consolidatedViews';
import { ExpandableConnectionMiniMap } from '@/components/molecules/ConnectionMiniMap';
import type {
  HandleBlastRadius,
  HandleDeletionTarget,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

type DeletionReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** One blast radius per staged handle deletion (one page each). */
  blastRadii: HandleBlastRadius[];
  getNeighborhood: GetNeighborhood;
  /** Called with the targets the user kept toggled on. */
  onConfirm: (includedTargets: HandleDeletionTarget[]) => void;
  /** Show one whole-structure mini-map per page (all breaking edges highlighted)
   *  instead of a per-connection list — used for loop/switch channel deletion. */
  consolidatedMap?: boolean;
  /** Review ALL staged deletions on a single page: a channel checklist plus one
   *  consolidated map of every selected channel's connections (loops/switches).
   *  Takes precedence over the paginated layout. */
  singleMap?: boolean;
};

/**
 * Multi-page review shown on Save: one page per staged handle deletion, each
 * with its full connection summary and an include/exclude toggle. Confirm
 * applies only the toggled-on deletions (as one undoable step upstream).
 */
function DeletionReviewModal({
  isOpen,
  onClose,
  blastRadii,
  getNeighborhood,
  onConfirm,
  consolidatedMap = false,
  singleMap = false,
}: DeletionReviewModalProps) {
  const [page, setPage] = useState(0);
  const [included, setIncluded] = useState<boolean[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPage(0);
      setIncluded(blastRadii.map(() => true));
    }
  }, [isOpen, blastRadii.length]);

  if (blastRadii.length === 0) return null;

  const total = blastRadii.length;
  const safePage = Math.min(page, total - 1);
  const current = blastRadii[safePage];
  const includedCount = included.filter(Boolean).length;
  const isLastPage = safePage === total - 1;

  const confirm = () => {
    const targets = blastRadii
      .filter((_, index) => included[index])
      .map((blastRadius) => blastRadius.target);
    if (targets.length === 0) return;
    onConfirm(targets);
  };

  if (singleMap) {
    // All staged channels on one page: a checklist + a single consolidated map
    // of every selected channel's connections (they all sit in one scope).
    const checkedEdgeIds = blastRadii
      .filter((_, index) => included[index])
      .flatMap((blastRadius) =>
        blastRadius.scopes.flatMap((scope) =>
          scope.connections.map((connection) => connection.edgeId),
        ),
      );
    const scopeId = blastRadii[0]?.scopes[0]?.scopeId ?? 'root';
    const { neighbourhood, complete } = buildConsolidatedViews(
      getNeighborhood,
      scopeId,
      checkedEdgeIds,
    );
    const channelPlural = includedCount === 1 ? '' : 's';
    const cPlural = checkedEdgeIds.length === 1 ? '' : 's';
    return (
      <Modal
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <ModalContent size='lg'>
          <ModalHeader>
            <ModalTitle>Review channel deletions</ModalTitle>
            <ModalDescription>
              {includedCount} of {total} channel{total === 1 ? '' : 's'}{' '}
              selected to delete
            </ModalDescription>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody className='flex flex-col gap-3'>
            <div className='flex flex-col gap-1'>
              {blastRadii.map((blastRadius, index) => (
                <label
                  key={index}
                  className='flex items-center gap-2 cursor-pointer select-none'
                >
                  <Checkbox
                    checked={included[index] ?? true}
                    onCheckedChange={(checked) =>
                      setIncluded((prev) =>
                        prev.map((value, i) =>
                          i === index ? checked !== false : value,
                        ),
                      )
                    }
                  />
                  <span className='text-[13px] text-primary-white font-main truncate'>
                    Delete "{blastRadius.target.handleName}"
                  </span>
                  <span className='ml-auto shrink-0 text-[11px] text-primary-white/50 font-main'>
                    {blastRadius.totalConnections} connection
                    {blastRadius.totalConnections === 1 ? '' : 's'}
                  </span>
                </label>
              ))}
            </div>
            {checkedEdgeIds.length > 0 ? (
              <ExpandableConnectionMiniMap
                neighborhood={neighbourhood}
                wholeTree={complete}
                inlineToggle
                height={240}
                title={`${includedCount} channel${channelPlural} · ${checkedEdgeIds.length} connection${cPlural}`}
              />
            ) : (
              <div className='text-[13px] text-primary-white/60 font-main py-4 text-center'>
                No channels selected.
              </div>
            )}
          </ModalBody>
          <ModalFooter align='right'>
            <Button
              size='small'
              color='lightNonPriority'
              onClick={confirm}
              disabled={includedCount === 0}
            >
              Delete {includedCount} channel{channelPlural}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent size='lg'>
        <ModalHeader>
          <ModalTitle>Review handle deletions</ModalTitle>
          <ModalDescription>
            Handle {safePage + 1} of {total} · {includedCount} selected to
            delete
          </ModalDescription>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <label className='flex items-center gap-2 mb-3 cursor-pointer select-none'>
            <Checkbox
              checked={included[safePage] ?? true}
              onCheckedChange={(checked) =>
                setIncluded((prev) =>
                  prev.map((value, index) =>
                    index === safePage ? checked !== false : value,
                  ),
                )
              }
            />
            <span className='text-[13px] text-primary-white font-main'>
              Delete "{current.target.handleName}" ({current.target.direction})
            </span>
          </label>
          <div
            className={included[safePage] === false ? 'opacity-40' : undefined}
          >
            <HandleSummaryContent
              blastRadius={current}
              getNeighborhood={getNeighborhood}
              consolidatedMap={consolidatedMap}
            />
          </div>
        </ModalBody>
        <ModalFooter align='right'>
          <Button
            size='small'
            color='dark'
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            Back
          </Button>
          {isLastPage ? (
            <Button
              size='small'
              color='lightNonPriority'
              onClick={confirm}
              disabled={includedCount === 0}
            >
              Delete {includedCount} handle{includedCount === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button
              size='small'
              color='lightNonPriority'
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
            >
              Next
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export { DeletionReviewModal };
export type { DeletionReviewModalProps };
