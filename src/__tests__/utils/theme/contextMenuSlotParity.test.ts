import { describe, it, expect } from 'vitest';
import type { ContextMenuClassNames } from '@/components/molecules/ContextMenu/ContextMenu';
import type { GraphThemeContextMenuSlots } from '@/utils/theme';

/**
 * FullGraphContextMenu passes `theme?.contextMenu` straight into ContextMenu's
 * `classNames` prop. The two types are declared in different layers (theme map
 * vs generic molecule), so this build-time check pins them together: if either
 * side gains or loses a part, one of these identity functions stops compiling.
 * (Vitest does not type-check — `npm run build`/`tsc -b` is the gate here.)
 */
describe('theme/contextMenu slot parity', () => {
  it('GraphThemeContextMenuSlots and ContextMenuClassNames stay mutually assignable', () => {
    const slotsAsClassNames = (
      slots: Required<GraphThemeContextMenuSlots>,
    ): Required<ContextMenuClassNames> => slots;
    const classNamesAsSlots = (
      classNames: Required<ContextMenuClassNames>,
    ): Required<GraphThemeContextMenuSlots> => classNames;

    expect(slotsAsClassNames).toBeTypeOf('function');
    expect(classNamesAsSlots).toBeTypeOf('function');
  });
});
