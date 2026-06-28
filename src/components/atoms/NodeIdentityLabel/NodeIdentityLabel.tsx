import { cn } from '@/utils/cnHelper';

type NodeIdentityLabelProps = {
  /** The node's type (actual) name — always shown. */
  typeName: string;
  /** Optional user custom name; when present, shown before the dimmed type name. */
  customName?: string;
  /**
   * Which name survives when the row is too narrow for both:
   * - `'type'` (default) protects the type name and ellipsizes the custom name
   *   first — for the canvas header and wide runner surfaces, where the type is the
   *   stable identity.
   * - `'custom'` protects the custom name and ellipsizes the type first — for a
   *   hard-capped surface like a tiny timeline block, where the user's name is the
   *   disambiguator worth keeping.
   */
  protect?: 'type' | 'custom';
  /** Extra classes merged onto the root (e.g. a canvas theme slot, or a runner text
   *  size). */
  className?: string;
};

/**
 * Presentational node identity: the type name alone, or `Custom : Type` (with the
 * type name dimmed) when a custom name is set. Overflow priority is a flex-shrink
 * differential controlled by `protect` — the protected span keeps the default
 * `shrink` (shown in full until the other collapses), and the sacrificial span gets
 * `shrink-[9999]` so it ellipsizes FIRST. Pure — no context, no theme slot baked in
 * (callers pass their own `className`).
 *
 * Shared by the canvas header (`EditableNodeTitle`) and the runner surfaces — the
 * timeline block, the block tooltip, and the step inspector's header + connection
 * line. The timeline block passes `protect='custom'`; everywhere else defaults to
 * `protect='type'`.
 */
function NodeIdentityLabel({
  typeName,
  customName,
  protect = 'type',
  className,
}: NodeIdentityLabelProps) {
  if (!customName) {
    return (
      <span className={cn('truncate', className)} data-slot='node-identity'>
        {typeName}
      </span>
    );
  }
  // Never add `shrink-*` to the protected span manually — the differential below is
  // what makes "one name shown full, the other ellipsizes first" deterministic.
  const customShrink = protect === 'type' ? 'shrink-[9999]' : '';
  const typeShrink = protect === 'custom' ? 'shrink-[9999]' : '';
  return (
    <span
      className={cn('flex min-w-0 items-baseline', className)}
      data-slot='node-identity'
    >
      <span className={cn('min-w-0 truncate', customShrink)}>{customName}</span>
      <span className={cn('min-w-0 truncate pl-1.5 opacity-75', typeShrink)}>
        {`: ${typeName}`}
      </span>
    </span>
  );
}

export { NodeIdentityLabel };
export type { NodeIdentityLabelProps };
