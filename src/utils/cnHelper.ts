import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind prefixes used by FIRST-PARTY packages, longest-first (the order is
 * load-bearing: `rbnt` must be tried before `rbn`).
 *
 * `cn` strips these before handing the string to `tailwind-merge` and restores
 * them afterwards. Without that, prefixed utilities are opaque to the merge and
 * conflicting ones BOTH survive, leaving the winner to be decided by which
 * stylesheet the consumer happened to import last.
 *
 * It is an explicit list rather than a `/^rbn[a-z]*:/` pattern on purpose: a
 * pattern would also swallow a consumer's own `@custom-variant rbnhover:` and
 * silently delete those styles. One line per package is the cheaper mistake.
 *
 * Exported so the class-rewriting codemod and the stylesheet gate share this
 * one definition instead of re-declaring the prefix.
 */
const FIRST_PARTY_PREFIXES = ['rbnt', 'rbn'] as const;

const PREFIX_RE = new RegExp(`^(?:${FIRST_PARTY_PREFIXES.join('|')}):`);

/** Matches tailwind-merge's own default, so the two caches evict in step. */
const CACHE_SIZE = 500;
let cache = new Map<string, string>();
let previousCache = new Map<string, string>();

function merge(raw: string): string {
  const tokens = raw.split(/\s+/).filter(Boolean);
  // `|| t` keeps a token that is EXACTLY a prefix (`'rbn:'`) rather than
  // collapsing it to the empty string.
  const stripped = tokens.map((token) => token.replace(PREFIX_RE, '') || token);

  // A MULTISET, not a Set. tailwind-merge collapses tokens it RECOGNISES
  // (`p-2 p-2` -> `p-2`) and deliberately keeps ones it does not (`group/x
  // group/x` -> both). Counting slots reproduces exactly that, so a prefixed
  // marker is never eaten by an unprefixed copy of itself — which is how the
  // first attempt at this silently deleted `rbn:group/…` and broke the
  // SliderNumberInput hover system.
  const slots = new Map<string, number>();
  for (const token of twMerge(stripped.join(' '))
    .split(/\s+/)
    .filter(Boolean)) {
    slots.set(token, (slots.get(token) ?? 0) + 1);
  }

  const out: string[] = [];
  // Right to left, so the LAST occurrence wins — matching tailwind-merge — and
  // rebuild with the ORIGINAL spelling at that index, never by value.
  for (let index = tokens.length - 1; index >= 0; index--) {
    const strippedToken = stripped[index];
    const remaining = slots.get(strippedToken) ?? 0;
    if (remaining === 0) continue;
    slots.set(strippedToken, remaining - 1);
    out.push(tokens[index]);
  }
  out.reverse();
  return out.join(' ');
}

/**
 * Utility function for combining and merging CSS classes
 *
 * This function combines clsx for conditional class handling with tailwind-merge
 * for intelligent Tailwind CSS class merging. It resolves conflicts between
 * Tailwind classes and ensures only the last conflicting class is applied.
 *
 * Because this library compiles its utilities with a Tailwind `prefix`, the
 * merge runs in the UNPREFIXED namespace (see `FIRST_PARTY_PREFIXES`) and the
 * prefix is restored on whichever classes survive. The observable result is
 * that prefixed input behaves exactly as the same input would have behaved
 * unprefixed — including when a consumer passes plain, unprefixed utilities of
 * their own, which then win conflicts as they always have.
 *
 * The whole function is memoised on the `clsx` output with the same
 * two-generation LRU shape tailwind-merge uses internally: the strip/restore
 * work sits OUTSIDE tailwind-merge's own cache, and this runs on every render
 * of every component.
 *
 * @param inputs - Variable number of class values (strings, objects, arrays, etc.)
 * @returns Merged and deduplicated class string
 *
 * @example
 * ```tsx
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500', 'text-white')
 * // Returns: "px-4 py-2 bg-blue-500 text-white"
 *
 * // Conditional classes
 * cn('base-class', isActive && 'active-class', isDisabled && 'disabled-class')
 *
 * // Tailwind class merging (conflicts resolved)
 * cn('px-4 px-6', 'py-2 py-4')
 * // Returns: "px-6 py-4" (last conflicting classes win)
 *
 * // Across first-party prefixes — the plugin's class wins, deterministically,
 * // instead of both surviving and stylesheet order deciding
 * cn('rbn:px-4', 'rbnt:px-3')
 * // Returns: "rbnt:px-3"
 *
 * // With objects
 * cn({
 *   'bg-blue-500': isPrimary,
 *   'bg-gray-500': !isPrimary,
 *   'text-white': true,
 * })
 * ```
 */
function cn(...inputs: ClassValue[]): string {
  const raw = clsx(inputs);
  let value = cache.get(raw);
  if (value !== undefined) return value;
  value = previousCache.get(raw);
  if (value === undefined) value = merge(raw);
  cache.set(raw, value);
  if (cache.size > CACHE_SIZE) {
    previousCache = cache;
    cache = new Map();
  }
  return value;
}

export { cn, FIRST_PARTY_PREFIXES };
