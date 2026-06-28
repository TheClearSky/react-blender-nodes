// Centralized naming for codegen value slots. Maps each value-store key
// (`scopedKey`, e.g. "nodeId:handleId" or "groupId>nodeId:handleId") to a stable,
// unique, READABLE JavaScript identifier derived from the producing node + handle
// (e.g. "Bit Input" + "Out" → `bitInputOut`). Created once per emit and consulted
// by `valueRef`, so the producer (store) and every consumer (connection) resolve
// to the same name. See `.claude/plans/codegen-readable-output.md` §4.

/** Where a value comes from, used to derive a readable base name. */
type NameHint = { nodeLabel: string; handleName: string };

type NameRegistry = {
  /** The stable identifier for a scoped value key; derives + dedupes on first ask. */
  nameFor: (scopedKey: string, hint: NameHint) => string;
  /** Bind a key to a specific desired identifier (deduped if taken) — used to map
   *  a group's input-node handles to the group function's parameter names. */
  force: (scopedKey: string, desiredName: string) => string;
  /** Reserve a bare identifier so later value names avoid it, WITHOUT creating a
   *  value-store entry (it is not a `nodeId:handleId` slot — used for source-emitted
   *  function names, which must stay out of `entries()`/the hoisted-`let` list and
   *  the keyed return). Returns the reserved (deduped) name. */
  reserve: (desiredName: string) => string;
  /** The name already assigned to a key, or null if it was never registered. */
  existing: (scopedKey: string) => string | null;
  /** All registered (key → name) pairs, in first-seen (registration) order. */
  entries: () => ReadonlyArray<{ scopedKey: string; name: string }>;
};

/** Identifiers the emitted `runGraph` already uses — value names must not shadow
 *  them, nor be JS reserved words that would produce invalid declarations. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // emitted scaffolding
  'runGraph',
  'functionImplementations',
  'initialInputValues',
  'options',
  'values',
  'abortSignal',
  'out',
  'condition',
  'iteration',
  'carry',
  'i',
  'makeInput',
  'makeOutputs',
  'makeContext',
  'implementations',
  'result',
  'outputs',
  // reserved words reachable from node/handle names
  'if',
  'else',
  'for',
  'while',
  'do',
  'return',
  'const',
  'let',
  'var',
  'function',
  'await',
  'async',
  'break',
  'continue',
  'new',
  'class',
  'this',
  'default',
  'switch',
  'case',
  'typeof',
  'instanceof',
  'in',
  'of',
  'void',
  'null',
  'true',
  'false',
]);

/** Split a label into alphanumeric words ("Bit Input" → ["Bit", "Input"]). */
function words(text: string): string[] {
  return text
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Normalize one word for camel/Pascal joining. All-caps acronyms are lowercased
 *  first ("AND" → "and"/"And") so they don't mangle into "aND". */
function normalizeWord(word: string, isFirst: boolean): string {
  const isAcronym = word === word.toUpperCase() && word !== word.toLowerCase();
  const base = isAcronym ? word.toLowerCase() : word;
  return isFirst
    ? base.charAt(0).toLowerCase() + base.slice(1)
    : base.charAt(0).toUpperCase() + base.slice(1);
}

/** camelCase(nodeLabel) + PascalCase(handleName) → one identifier base. */
function deriveBase(hint: NameHint): string {
  const parts = [...words(hint.nodeLabel), ...words(hint.handleName)];
  if (parts.length === 0) return 'value';
  const joined = parts
    .map((word, index) => normalizeWord(word, index === 0))
    .join('');
  // `words` already stripped non-alphanumerics; only guard a leading digit / empty.
  if (joined === '') return 'value';
  return /^[0-9]/.test(joined) ? `v${joined}` : joined;
}

function createNameRegistry(): NameRegistry {
  const byKey = new Map<string, string>();
  const order: { scopedKey: string; name: string }[] = [];
  const used = new Set<string>(RESERVED_NAMES);

  function nameFor(scopedKey: string, hint: NameHint): string {
    const already = byKey.get(scopedKey);
    if (already !== undefined) return already;

    const base = deriveBase(hint);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    byKey.set(scopedKey, candidate);
    order.push({ scopedKey, name: candidate });
    return candidate;
  }

  function force(scopedKey: string, desiredName: string): string {
    const already = byKey.get(scopedKey);
    if (already !== undefined) return already;
    let candidate = desiredName;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${desiredName}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    byKey.set(scopedKey, candidate);
    order.push({ scopedKey, name: candidate });
    return candidate;
  }

  function reserve(desiredName: string): string {
    let candidate = desiredName;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${desiredName}${suffix}`;
      suffix += 1;
    }
    used.add(candidate); // NOT added to byKey/order — never a value-store entry
    return candidate;
  }

  return {
    nameFor,
    force,
    reserve,
    existing: (scopedKey) => byKey.get(scopedKey) ?? null,
    entries: () => order,
  };
}

export { createNameRegistry, RESERVED_NAMES };
export type { NameRegistry, NameHint };
