import { useContext, useState } from 'react';
import { useNodeId, useNodeConnections, useReactFlow } from '@xyflow/react';
import { ListOrdered } from 'lucide-react';
import { cn } from '@/utils';
import { compareFanIn } from '@/utils/connectionOrder';
import { Popover } from '@/components/atoms/Popover/Popover';
import { DragList } from '@/components/molecules/DragList/DragList';
import type { DragListItem } from '@/components/molecules/DragList/types';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';
import { FullGraphContext } from '@/components/organisms/FullGraph/FullGraphState';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import { getHandleFromNodeDataMatchingHandleId } from '@/utils/nodeStateManagement/handles/handleGetters';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

type InputConnectionOrderControlProps = {
  /** The target input handle whose incoming connections this control reorders. */
  handleId: string;
};

/** Per-row extra data carried through the DragList (the source handle's color). */
type ConnectionRowData = { color?: string };

/**
 * The reorderable list inside the popover. Mounts only when the popover is open,
 * so it seeds its working order from a one-time snapshot of the current fan-in
 * (read via ReactFlow, since `FullGraphContext.state` is a narrowed slice). Each
 * drop updates the local order for immediate feedback AND dispatches
 * `REORDER_INPUT_CONNECTIONS` to persist it. On close/reopen it re-seeds, picking
 * up the persisted order and any connection changes; while open, the parent keys
 * it on the fan-in MEMBERSHIP so an externally added/removed connection remounts
 * it (a reorder keeps the same key, preserving an in-progress drag). Rows show
 * their 1-based position (which is the live order index) and the source handle's
 * color.
 */
function ConnectionReorderList({
  nodeId,
  handleId,
}: {
  nodeId: string;
  handleId: string;
}) {
  const fullGraphContext = useContext(FullGraphContext);
  const dispatch = fullGraphContext?.allProps?.dispatch;
  const reactFlow = useReactFlow<Nodes[number], Edges[number]>();

  // Name of the target input handle, for the popover header.
  const targetNode = reactFlow.getNode(nodeId);
  const targetHandleName = targetNode
    ? (getHandleFromNodeDataMatchingHandleId(
        handleId,
        targetNode.data,
        true, // runForInputs — the target side of an edge is an input handle
        false, // runForOutputs off — do not search outputs
      )?.value?.name ?? '')
    : '';

  const [items, setItems] = useState<DragListItem<ConnectionRowData>[]>(() => {
    const nodeById = new Map(
      reactFlow.getNodes().map((node) => [node.id, node]),
    );
    const incoming = reactFlow
      .getEdges()
      .filter(
        (edge) => edge.target === nodeId && edge.targetHandle === handleId,
      )
      .map((edge, index) => ({ edge, index }));
    incoming.sort((first, second) =>
      compareFanIn(
        first.edge.data?.order,
        first.index,
        second.edge.data?.order,
        second.index,
      ),
    );
    return incoming.map(({ edge }) => {
      const sourceNode = nodeById.get(edge.source);
      const sourceHandle = sourceNode
        ? getHandleFromNodeDataMatchingHandleId(
            edge.sourceHandle ?? '',
            sourceNode.data,
            false, // search outputs — the source side of an edge is an output
          )?.value
        : undefined;
      const sourceName = sourceNode?.data?.name ?? edge.source;
      const label = sourceHandle?.name
        ? `${sourceName} › ${sourceHandle.name}`
        : String(sourceName);
      return {
        id: edge.id,
        name: label,
        additionalProperties: { color: sourceHandle?.handleColor },
      };
    });
  });

  function handleReorder(newItems: DragListItem<ConnectionRowData>[]) {
    setItems(newItems);
    dispatch?.({
      type: actionTypesMap.REORDER_INPUT_CONNECTIONS,
      payload: {
        nodeId,
        handleId,
        orderedEdgeIds: newItems.map((item) => item.id),
      },
    });
  }

  // O(1) position lookup per row, rebuilt each render from the live order.
  const positionById = new Map(
    items.map((item, index) => [item.id, index + 1] as const),
  );

  function renderRow(item: DragListItem<ConnectionRowData>) {
    const position = positionById.get(item.id) ?? 0;
    const color = item.additionalProperties?.color;
    return (
      <span className='flex min-w-0 items-center gap-2'>
        <span className='w-4 shrink-0 text-right tabular-nums text-secondary-light-gray'>
          {position}
        </span>
        {color && (
          <span
            aria-hidden
            className='h-3 w-3 shrink-0 rounded-full border border-secondary-dark-gray'
            style={{ backgroundColor: color }}
          />
        )}
        <span className='truncate'>{item.name}</span>
      </span>
    );
  }

  return (
    <div
      data-slot='input-connection-reorder'
      className='flex flex-col gap-2 font-main'
    >
      <div className='flex items-center gap-2 px-1 text-[13px] text-secondary-light-gray'>
        <ListOrdered className='h-4 w-4 shrink-0' />
        <span className='truncate'>
          {targetHandleName
            ? `Order connections into “${targetHandleName}”`
            : 'Connection order'}
        </span>
      </div>
      <DragList
        items={items}
        onChange={handleReorder}
        maxDepth={1}
        renderContent={renderRow}
      />
    </div>
  );
}

/**
 * A per-input-handle control that appears only when the handle has 2+ incoming
 * connections (fan-in). It shows a compact trigger — an ordered-list icon plus
 * the connection count — at the handle and, on click, opens a popover with a
 * drag-to-reorder list of the connections. Reordering pins each edge's
 * `data.order` so the runner and every codegen target consume the fan-in in that
 * order.
 *
 * Rendered ONLY inside ReactFlow (it reads the node id via `useNodeId` and the
 * handle's connections via `useNodeConnections`), so the caller gates it on
 * `isCurrentlyInsideReactFlow`.
 */
function InputConnectionOrderControl({
  handleId,
}: InputConnectionOrderControlProps) {
  const nodeId = useNodeId();
  const theme = useGraphTheme();
  const connections = useNodeConnections({ handleId, handleType: 'target' });

  // Only a fan-in (2+ incoming connections) is orderable.
  if (connections.length < 2 || !nodeId) return null;

  // Remount the reorder list when the fan-in MEMBERSHIP changes (a connection
  // added/removed while the popover is open) so it re-seeds — but NOT on a
  // reorder (same edge set, different order ⇒ same sorted key), which would
  // interrupt an in-progress drag.
  const membershipKey = connections
    .map((connection) => connection.edgeId)
    .sort()
    .join('|');

  return (
    <Popover
      placement='left-start'
      triggerLabel={`Reorder ${connections.length} input connections`}
      // `nodrag`/`nopan` keep clicking the trigger from dragging/panning the canvas.
      triggerClassName={cn(
        // A small accent-colored count badge (the connection count, capped at
        // `9+`). The colored fill is self-contained (independent of the node
        // body), so it reads in BOTH light and dark themes. `text-white` is a
        // deliberate literal, not the `text-primary-white` token: the badge must
        // stay white-on-blue regardless of theme (the fill is a fixed
        // `bg-primary-blue`) — bold white numerals on primary-blue clear ≈4.7:1
        // (AA for bold text). `scale-150` enlarges it via the CSS `scale`
        // property (no reflow — the fixed 20px `w-5` box is unchanged, so the row
        // never shifts, even at a two-character `9+`).
        'nodrag nopan h-5 w-5 scale-150 rounded-full bg-primary-blue p-0 text-white hover:bg-primary-blue/85',
        theme?.node?.inputOrderBadge,
      )}
      trigger={
        <span
          data-slot='input-order-badge'
          className='text-[12px] font-semibold leading-none tabular-nums'
        >
          {connections.length > 9 ? '9+' : connections.length}
        </span>
      }
      contentClassName={cn('min-w-[240px]', theme?.node?.inputOrderPopover)}
    >
      <ConnectionReorderList
        key={membershipKey}
        nodeId={nodeId}
        handleId={handleId}
      />
    </Popover>
  );
}

export { InputConnectionOrderControl };
export type { InputConnectionOrderControlProps };
