import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cnHelper';
import { Input } from '@/components/atoms';
import { NodeIdentityLabel } from '@/components/atoms/NodeIdentityLabel';

type EditableNodeTitleProps = {
  /** The node's type (actual) name — always shown. */
  typeName: string;
  /** The node's current custom name (the editable value); absent = none. */
  customName?: string;
  /** Whether this node supports inline renaming (standard nodes inside ReactFlow). */
  isEditable: boolean;
  /** Commit a new custom name, or `undefined` to clear it. */
  onCommit: (name: string | undefined) => void;
  /** Extra classes merged onto the root (e.g. the `node.headerTitle` theme slot). */
  className?: string;
};

/**
 * The node header title: shows `NodeIdentityLabel` (type name, or `Custom : Type`) and,
 * for editable nodes, double-click to edit the custom name in place.
 *
 * Controlled + context-free (the parent owns `customName` and the dispatch). Two refs
 * make the rename exactly ONE history entry and let Escape truly cancel, working around
 * the `Input` atom's commit behavior (it fires `onChange` on Enter AND blur/clickout,
 * and its blur fires on unmount):
 * - `lastCommitted` dedupes the double-fire (Enter then blur with the same value).
 * - `isCancelling` swallows the unmount-blur commit after Escape.
 *
 * `nodrag nopan` on the title is required so a double-click edits instead of zooming
 * the ReactFlow canvas (`zoomOnDoubleClick` defaults true; a synthetic `stopPropagation`
 * does not stop d3-zoom's native listener) — mirrors `InputConnectionOrderControl`.
 */
function EditableNodeTitle({
  typeName,
  customName,
  isEditable,
  onCommit,
  className,
}: EditableNodeTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommitted = useRef<string | undefined>(undefined);
  const isCancelling = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startEditing() {
    lastCommitted.current = customName;
    isCancelling.current = false;
    setDraft(customName ?? '');
    setEditing(true);
  }

  function commit(raw: string) {
    if (isCancelling.current) return;
    const trimmed = raw.trim();
    const next = trimmed ? trimmed : undefined;
    setEditing(false);
    // Dedupe the Input atom's Enter-then-blur double fire (lastCommitted), AND skip a
    // no-op write against the LIVE prop — so a concurrent external change to
    // `customName` during the edit can't be silently masked by committing the
    // start-of-edit value.
    if (next === lastCommitted.current || next === (customName ?? undefined)) {
      return;
    }
    lastCommitted.current = next;
    onCommit(next);
  }

  function cancel() {
    isCancelling.current = true;
    setEditing(false);
  }

  return (
    <div
      className={cn(
        'flex min-w-0 py-2',
        isEditable && 'nodrag nopan cursor-text',
        className,
      )}
      onDoubleClick={
        isEditable && !editing
          ? (event) => {
              event.stopPropagation();
              startEditing();
            }
          : undefined
      }
      onKeyDown={
        editing
          ? (event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                cancel();
              }
            }
          : undefined
      }
      data-slot='node-title'
    >
      {editing ? (
        <span className='flex min-w-0 flex-1 items-baseline'>
          <Input
            ref={inputRef}
            allowOnlyNumbers={false}
            size='small'
            value={draft}
            onChange={commit}
            placeholder='Name'
            // `text-[length:inherit] leading-[inherit] h-auto` override the Input atom's
            // `size='small'` preset (text-[16px]) so the edit field matches the header
            // title's inherited size instead of shrinking on double-click. Same-group
            // arbitrary VALUES (not `[font-size:…]` arbitrary properties) so tailwind-merge
            // actually drops the atom's `text-[16px]`/`leading-[16px]`.
            className='nodrag nopan h-auto w-full min-w-0 border-0 bg-transparent px-0 text-primary-white text-[length:inherit] leading-[inherit]'
          />
          {/* dimmed type suffix mirrors the static `Custom : Type` display so it's
              clear which node is being named. */}
          <span className='shrink-0 truncate pl-1.5 opacity-75'>{`: ${typeName}`}</span>
        </span>
      ) : (
        <NodeIdentityLabel
          typeName={typeName}
          customName={customName}
          className='min-w-0 flex-1'
        />
      )}
    </div>
  );
}

export { EditableNodeTitle };
export type { EditableNodeTitleProps };
