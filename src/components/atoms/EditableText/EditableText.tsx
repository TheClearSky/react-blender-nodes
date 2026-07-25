import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '@/utils/cnHelper';
import { Input } from '@/components/atoms';

type EditableTextHandle = {
  /** Enter edit mode programmatically (no-op while already editing) — lets a
   *  PARENT element be the double-click target. */
  beginEditing: () => void;
};

type EditableTextProps = {
  /** The current (committed) text. */
  value: string;
  /** Commit a new (trimmed) value. The parent decides what an empty string means. */
  onCommit: (next: string) => void;
  /**
   * Fires on every edit-mode transition (true = editing started, false = ended
   * via commit OR Escape-cancel). Fired from an effect on the editing state so
   * EVERY exit path is covered; may fire redundantly (the Input atom's
   * Enter-then-blur double commit) — the callback must be idempotent.
   */
  onEditingChange?: (editing: boolean) => void;
  /** When false, double-click does nothing and the static text is shown. */
  isEditable?: boolean;
  placeholder?: string;
  /** Classes for the static (display) span. */
  className?: string;
  /** Classes for the edit `<Input>`. */
  inputClassName?: string;
};

/**
 * Inline double-click-to-edit text. Generalizes the hard-won mechanics of
 * `EditableNodeTitle` (the `Input` atom fires `onChange` on BOTH Enter and
 * blur/clickout, and its blur fires on unmount):
 * - `lastCommitted` dedupes the Enter-then-blur double fire,
 * - the second clause skips a no-op against the LIVE `value` (so a concurrent
 *   external change isn't masked by committing the start-of-edit value),
 * - `isCancelling` swallows the unmount-blur after Escape.
 *
 * `nodrag nopan` on both the static span and the input so a double-click edits
 * instead of zooming the ReactFlow canvas.
 */
const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(
  function EditableText(
    {
      value,
      onCommit,
      onEditingChange,
      isEditable = true,
      placeholder = 'Name',
      className,
      inputClassName,
    },
    ref,
  ) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const lastCommitted = useRef<string>('');
    const isCancelling = useRef(false);

    useEffect(() => {
      if (!editing) return;
      inputRef.current?.focus();
      inputRef.current?.select();
    }, [editing]);

    // Mirror every editing transition to the parent (hold-open guards etc.).
    // An effect — not per-call-site wiring — so the Escape-cancel path (which
    // the commit path does NOT cover, due to the isCancelling early-return)
    // can never be missed.
    useEffect(() => {
      onEditingChange?.(editing);
    }, [editing, onEditingChange]);

    function startEditing() {
      lastCommitted.current = value;
      isCancelling.current = false;
      setDraft(value);
      setEditing(true);
    }

    // NO deps array: the handle must be the current-render closure, or
    // beginEditing seeds the draft with a stale `value` after an external
    // rename (undo/redo, import).
    useImperativeHandle(ref, () => ({
      beginEditing: () => {
        if (!editing && isEditable) startEditing();
      },
    }));

    function commit(raw: string) {
      if (isCancelling.current) return;
      const next = raw.trim();
      setEditing(false);
      if (next === lastCommitted.current || next === value) return;
      lastCommitted.current = next;
      onCommit(next);
    }

    function cancel() {
      isCancelling.current = true;
      setEditing(false);
    }

    if (editing) {
      // The `Input` atom handles Enter + blur internally but not Escape, so the
      // wrapper catches the bubbled keydown to cancel (mirrors EditableNodeTitle).
      return (
        <span
          className='nodrag nopan inline-flex min-w-0'
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              cancel();
            }
          }}
        >
          <Input
            ref={inputRef}
            allowOnlyNumbers={false}
            size='small'
            value={draft}
            onChange={commit}
            placeholder={placeholder}
            className={cn(
              'nodrag nopan h-auto min-w-0 border-0 bg-transparent px-1 text-[length:inherit] leading-[inherit]',
              inputClassName,
            )}
          />
        </span>
      );
    }

    return (
      <span
        className={cn(isEditable && 'nodrag nopan cursor-text', className)}
        onDoubleClick={
          isEditable
            ? (event) => {
                event.stopPropagation();
                startEditing();
              }
            : undefined
        }
      >
        {value || placeholder}
      </span>
    );
  },
);

EditableText.displayName = 'EditableText';

export { EditableText };
export type { EditableTextProps, EditableTextHandle };
