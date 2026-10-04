import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';

type PathChipsInputProps = {
  /** The path, outermost folder first. */
  value: readonly string[];
  onChange: (path: string[]) => void;
  /** Existing folder names directly under `parentPath` — offered as
   *  suggestions, and kept EXACTLY as named when picked (even with
   *  characters that typing does not allow). */
  getSuggestions?: (parentPath: readonly string[]) => string[];
  /** Label the preview starts from, e.g. "Add Node". Omit for no preview. */
  previewRoot?: string;
  /** What the preview ends with, e.g. the node group's name. */
  previewLeaf?: string;
  /** Shown in the preview when the path is empty. */
  emptyPathHint?: string;
  /** Accessible name of the text box. */
  ariaLabel?: string;
  id?: string;
  className?: string;
};

import {
  cleanTypedName as cleanTyped,
  parsePathText,
  SEPARATORS,
} from './pathText';

/**
 * A path built from chips — one chip per folder (the node-group editor's
 * "Menu Path"). Type a name and press Enter, `/` or `›` to add it; paste
 * `Group Nodes/Drums` to add both; Backspace in the empty box removes the
 * last chip; double-click a chip to rename it; drag a chip to reorder; × to
 * remove. Existing folders at the current depth are offered underneath, and
 * a one-line preview shows where the path leads.
 */
function PathChipsInput({
  value,
  onChange,
  getSuggestions,
  previewRoot,
  previewLeaf,
  emptyPathHint = 'top level',
  ariaLabel = 'Add a folder',
  id,
  className,
}: PathChipsInputProps) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{
    index: number;
    text: string;
  } | null>(null);
  const [warning, setWarning] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(warningTimer.current), []);

  const flagDropped = () => {
    setWarning(true);
    clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(false), 2000);
  };

  const add = (names: string[]) => {
    const trimmed = names
      .map((name) => name.trim())
      .filter((name) => name !== '');
    if (trimmed.length > 0) onChange([...value, ...trimmed]);
  };

  const commitDraft = () => {
    add([draft]);
    setDraft('');
  };

  const typeDraft = (text: string) => {
    // A separator typed anywhere ends the name before it.
    const { complete, rest, dropped } = parsePathText(text);
    if (dropped) flagDropped();
    add(complete);
    setDraft(rest);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!SEPARATORS.test(text)) return;
    event.preventDefault();
    const { complete, rest, dropped } = parsePathText(draft + text);
    if (dropped) flagDropped();
    add(complete);
    setDraft(rest);
  };

  const remove = (index: number) =>
    onChange(value.filter((_, at) => at !== index));

  const commitRename = () => {
    if (!renaming) return;
    const { clean } = cleanTyped(renaming.text);
    const name = clean.trim();
    const next = [...value];
    if (name === '') next.splice(renaming.index, 1);
    else next[renaming.index] = name;
    setRenaming(null);
    onChange(next);
  };

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const next = [...value];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setDragIndex(null);
    onChange(next);
  };

  const suggestions = getSuggestions?.(value) ?? [];

  return (
    <div className={cn('rbn:flex rbn:flex-col rbn:gap-1.5', className)}>
      <div
        role='list'
        aria-label='Path'
        className='rbn:flex rbn:min-h-[34px] rbn:flex-wrap rbn:items-center rbn:gap-1 rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:px-1.5 rbn:py-1 rbn:focus-within:border-primary-blue'
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((segment, index) => (
          <div
            key={`${index}-${segment}`}
            role='listitem'
            className='rbn:flex rbn:items-center rbn:gap-1'
          >
            {renaming?.index === index ? (
              <input
                autoFocus
                aria-label={`Rename ${segment}`}
                value={renaming.text}
                onChange={(event) => {
                  const { clean, dropped } = cleanTyped(event.target.value);
                  if (dropped) flagDropped();
                  setRenaming({ index, text: clean });
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') setRenaming(null);
                }}
                onBlur={commitRename}
                className='rbn:w-[10ch] rbn:rounded rbn:bg-primary-gray rbn:px-1.5 rbn:py-0.5 rbn:text-[13px] rbn:text-primary-white rbn:outline-none'
              />
            ) : (
              <span
                draggable
                title='Double-click to rename · drag to reorder'
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, index)}
                onDoubleClick={() => setRenaming({ index, text: segment })}
                className={cn(
                  'rbn:flex rbn:cursor-grab rbn:items-center rbn:gap-1 rbn:rounded rbn:bg-primary-gray rbn:py-0.5 rbn:pr-1 rbn:pl-2 rbn:text-[13px] rbn:text-primary-white',
                  dragIndex === index && 'rbn:opacity-50',
                )}
              >
                {segment}
                <button
                  type='button'
                  aria-label={`Remove ${segment}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(index);
                  }}
                  className='rbn:flex rbn:items-center rbn:rounded rbn:text-primary-white/70 rbn:hover:text-primary-white'
                >
                  <X className='rbn:h-3 rbn:w-3' />
                </button>
              </span>
            )}
            <span
              aria-hidden='true'
              className='rbn:text-[13px] rbn:text-secondary-light-gray'
            >
              ›
            </span>
          </div>
        ))}
        <input
          ref={inputRef}
          id={id}
          aria-label={ariaLabel}
          value={draft}
          placeholder={value.length === 0 ? 'Type a folder, Enter to add' : ''}
          onChange={(event) => typeDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim() !== '') commitDraft();
          }}
          className='rbn:min-w-[6ch] rbn:flex-1 rbn:bg-transparent rbn:py-0.5 rbn:text-[13px] rbn:text-primary-white rbn:outline-none rbn:placeholder:text-secondary-light-gray'
        />
      </div>

      {suggestions.length > 0 && (
        <div className='rbn:flex rbn:flex-wrap rbn:items-center rbn:gap-1 rbn:text-[12px] rbn:text-secondary-light-gray'>
          <span>Existing here:</span>
          {suggestions.map((name) => (
            <button
              key={name}
              type='button'
              onClick={() => add([name])}
              className='rbn:rounded-full rbn:border rbn:border-secondary-dark-gray rbn:px-2 rbn:py-0.5 rbn:text-primary-white rbn:hover:bg-primary-gray'
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <p
        className={cn(
          'rbn:text-[12px]',
          warning ? 'rbn:text-status-errored' : 'rbn:text-secondary-light-gray',
        )}
      >
        {warning
          ? 'Letters, numbers and spaces only'
          : 'Enter or / adds · ⌫ removes the last · double-click renames · drag reorders'}
      </p>

      {previewRoot !== undefined && (
        <div className='rbn:rounded rbn:border rbn:border-secondary-dark-gray rbn:px-2 rbn:py-1 rbn:text-[12px] rbn:text-primary-white'>
          <span className='rbn:text-secondary-light-gray'>Preview: </span>
          {[previewRoot, ...value, ...(previewLeaf ? [previewLeaf] : [])].join(
            ' ▸ ',
          )}
          {value.length === 0 && (
            <span className='rbn:text-secondary-light-gray'>
              {' '}
              ({emptyPathHint})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { PathChipsInput };
export type { PathChipsInputProps };
