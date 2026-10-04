import { describe, it, expect } from 'vitest';
import { cn } from '@/utils';

/**
 * Proof that tailwind-merge resolves conflicts between this project's custom
 * color-token utilities (defined in src/index.css @theme blocks) and standard
 * Tailwind classes — the mechanism the GraphTheme system relies on when
 * appending theme slot classes LAST. If any of these fail, cnHelper.ts needs
 * an extendTailwindMerge configuration registering the token class names.
 */
describe('theme/cn token-conflict resolution', () => {
  it('theme background classes override custom token backgrounds', () => {
    expect(cn('bg-primary-dark-gray', 'bg-white')).toBe('bg-white');
    expect(cn('bg-runner-panel-bg', 'bg-zinc-100')).toBe('bg-zinc-100');
    expect(cn('bg-graph-menu-bg', 'bg-[#f5f5f5]')).toBe('bg-[#f5f5f5]');
    expect(cn('bg-graph-elevated-surface-bg', 'bg-neutral-200')).toBe(
      'bg-neutral-200',
    );
  });

  it('theme text/border classes override custom token text/borders', () => {
    expect(cn('text-primary-white', 'text-zinc-900')).toBe('text-zinc-900');
    expect(cn('border-secondary-dark-gray', 'border-zinc-300')).toBe(
      'border-zinc-300',
    );
    expect(cn('text-runner-muted-text', 'text-zinc-500')).toBe('text-zinc-500');
  });

  it('opacity-modified token classes are overridden by theme classes', () => {
    expect(cn('bg-timeline-loop-accent/60', 'bg-purple-300/60')).toBe(
      'bg-purple-300/60',
    );
  });

  it('SVG fill/stroke token classes are overridden by theme classes', () => {
    expect(cn('fill-edge-value-pill-bg', 'fill-white')).toBe('fill-white');
    expect(cn('stroke-edge-value-pill-border', 'stroke-zinc-300')).toBe(
      'stroke-zinc-300',
    );
  });

  it('arbitrary-property var overrides pass through and dedupe by property', () => {
    expect(cn('bg-white', '[--color-graph-menu-bg:#f5f5f5]')).toBe(
      'bg-white [--color-graph-menu-bg:#f5f5f5]',
    );
    expect(
      cn('[--color-graph-menu-bg:#111111]', '[--color-graph-menu-bg:#f5f5f5]'),
    ).toBe('[--color-graph-menu-bg:#f5f5f5]');
  });

  it('non-conflicting default classes survive a theme append', () => {
    expect(
      cn('rounded-md px-3 py-2 bg-graph-menu-bg', 'bg-zinc-100 text-zinc-900'),
    ).toBe('rounded-md px-3 py-2 bg-zinc-100 text-zinc-900');
  });

  it('variant-prefixed conflicts merge per modifier (light preset interactivity relies on these)', () => {
    expect(cn('hover:bg-graph-menu-item-hover-bg', 'hover:bg-zinc-200')).toBe(
      'hover:bg-zinc-200',
    );
    expect(cn('focus:border-white', 'focus:border-zinc-900')).toBe(
      'focus:border-zinc-900',
    );
    expect(
      cn(
        'placeholder:text-graph-input-placeholder',
        'placeholder:text-zinc-400',
      ),
    ).toBe('placeholder:text-zinc-400');
    expect(
      cn('in-[.selected]:border-white', 'in-[.selected]:border-zinc-900'),
    ).toBe('in-[.selected]:border-zinc-900');
    // Different modifiers never collide.
    expect(cn('hover:bg-zinc-200', 'bg-white')).toBe(
      'hover:bg-zinc-200 bg-white',
    );
  });

  it('descendant-variant text overrides pass through and distinct selectors both survive', () => {
    expect(cn('bg-zinc-50', '[&_.text-primary-white]:text-zinc-900')).toBe(
      'bg-zinc-50 [&_.text-primary-white]:text-zinc-900',
    );
    expect(
      cn(
        '[&_.text-primary-white]:text-zinc-900',
        '[&_[class*="text-primary-white/"]]:text-zinc-600',
      ),
    ).toBe(
      '[&_.text-primary-white]:text-zinc-900 [&_[class*="text-primary-white/"]]:text-zinc-600',
    );
  });
});

/**
 * The prefix-aware half of `cn`.
 *
 * This library compiles its utilities with a Tailwind `prefix`, which makes
 * them opaque to tailwind-merge: `twMerge('rbn:px-4 rbn:px-3')` recognises
 * NEITHER token and keeps both, so the winner would be decided by stylesheet
 * order rather than by the merge. `cn` therefore strips first-party prefixes,
 * merges, and restores them.
 */
describe('theme/cn first-party prefix handling', () => {
  /**
   * The acceptance criterion: prefixed input must behave exactly as the same
   * input would have behaved unprefixed. If this holds, every existing
   * expectation in this file holds for the prefixed world too.
   */
  it('makes the prefixed world byte-identical to the unprefixed world', () => {
    const cases: string[][] = [
      ['bg-primary-dark-gray', 'bg-white'],
      ['px-4 py-2 rounded-md', 'px-6'],
      ['text-primary-white', 'text-zinc-900'],
      ['border border-b-0', 'bg-zinc-50'],
      ['flex items-center gap-2', 'inline-flex gap-4'],
      ['hover:bg-zinc-200', 'bg-white'],
      ['bg-timeline-loop-accent/60', 'bg-purple-300/60'],
    ];
    for (const parts of cases) {
      const prefixed = parts.map((part) =>
        part
          .split(' ')
          .map((token) => `rbn:${token}`)
          .join(' '),
      );
      const strippedBack = cn(...prefixed).replaceAll('rbn:', '');
      expect(strippedBack).toBe(cn(...parts));
    }
  });

  it('resolves a conflict WITHIN one prefix (the single-package case)', () => {
    expect(cn('rbn:px-4', 'rbn:px-3')).toBe('rbn:px-3');
  });

  it('resolves a conflict ACROSS two first-party prefixes', () => {
    // The plugin passing its own utility into a host component: the host's
    // default must be deleted, not left for stylesheet order to arbitrate.
    expect(cn('rbn:px-4', 'rbnt:px-3')).toBe('rbnt:px-3');
    expect(cn('rbn:text-[27px]', 'rbnt:text-[13px]')).toBe('rbnt:text-[13px]');
  });

  it('lets a consumer unprefixed class win over a prefixed one', () => {
    expect(cn('rbn:bg-primary-gray', 'bg-red-500')).toBe('bg-red-500');
  });

  /**
   * tailwind-merge deliberately does NOT deduplicate tokens it does not
   * recognise, so both copies must survive. Keying the restore map by the
   * stripped VALUE instead of counting slots dropped the prefixed copy here,
   * which would have silently unhooked the SliderNumberInput hover system.
   */
  it('keeps a prefixed marker alongside an unprefixed copy of itself', () => {
    expect(cn('rbn:group/x rbn:flex', 'group/x')).toBe(
      'rbn:group/x rbn:flex group/x',
    );
    expect(cn('rbn:no-scrollbar', 'no-scrollbar')).toBe(
      'rbn:no-scrollbar no-scrollbar',
    );
    expect(cn('rbn:group/x', 'rbnt:group/x')).toBe('rbn:group/x rbnt:group/x');
  });

  it('does not strip a lookalike prefix that is not first-party', () => {
    // A consumer `@custom-variant rbnhover:` must survive untouched — this is
    // why the prefix set is an explicit list and not a `/^rbn[a-z]*:/` pattern.
    expect(cn('rbnhover:bg-red-500', 'bg-blue-500')).toBe(
      'rbnhover:bg-red-500 bg-blue-500',
    );
  });

  it('leaves non-conflicting prefixed utilities alone', () => {
    expect(cn('rbn:border rbn:border-b-0')).toBe('rbn:border rbn:border-b-0');
    expect(cn('rbn:flex rbn:hover:hidden')).toBe('rbn:flex rbn:hover:hidden');
  });
});
