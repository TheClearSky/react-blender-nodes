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
