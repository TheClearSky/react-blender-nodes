#!/usr/bin/env node
/**
 * check-doc-citations.ts
 *
 * CI guard for documentation source citations.
 *
 * The docs in this repo cite source code using a "migrated" citation form:
 *
 *     `<path>` › `<Symbol>`
 *
 * e.g.  `src/hooks/useDrag.ts` › `useDrag`
 *
 * where the path is wrapped in backticks, the U+203A single right-angle
 * quotation mark (›) is the separator, and the symbol is wrapped in backticks.
 *
 * This script:
 *   (a) scans all docs/**\/*.md plus README.md and CONTRIBUTING.md;
 *   (b) finds every migrated citation;
 *   (c) verifies the cited <path> exists on disk AND that the file declares
 *       (or exports) <Symbol>;
 *   (d) flags any remaining LEGACY source citations that should have been
 *       migrated, i.e. `path:NNN` line references or #L<NNN> GitHub anchors
 *       that point at a .ts / .tsx file;
 *   (e) prints a report and exits non-zero if any citation is unresolved or
 *       any legacy citation remains; otherwise prints OK and exits 0.
 *
 * Dependency-free (node:fs, node:path, node:url only). Run with:
 *
 *     node --experimental-strip-types scripts/check-doc-citations.ts
 *
 * (Node 22.6+; on Node 23.6+/22.18+ the flag is the default and may be omitted.
 * Invoke via `npm run check:docs`.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A migrated `path` › `Symbol` citation that failed to resolve. */
type UnresolvedCitation = {
  doc: string;
  line: number;
  path: string;
  symbol: string;
  reason: string;
};

/** A legacy `file.ts:NNN` / `#L` citation that should have been migrated. */
type LegacyCitation = {
  doc: string;
  line: number;
  snippet: string;
  kind: string;
};

/* -------------------------------------------------------------------------- */
/* Doc discovery                                                              */
/* -------------------------------------------------------------------------- */

/** Recursively collect every *.md file under `dir`. */
function collectMarkdown(dir: string, acc: string[]): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      acc.push(full);
  }
  return acc;
}

function discoverDocFiles(): string[] {
  const files = collectMarkdown(path.join(REPO_ROOT, 'docs'), []);
  for (const name of ['README.md', 'CONTRIBUTING.md']) {
    const full = path.join(REPO_ROOT, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) files.push(full);
  }
  // De-duplicate and sort for stable output.
  return [...new Set(files)].sort();
}

/* -------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* -------------------------------------------------------------------------- */

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compute the 1-based line number of a string offset. */
function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

const fileCache = new Map<string, string>();
/** Read a source file once, returning '' if it does not exist. */
function readSource(absPath: string): string {
  const cached = fileCache.get(absPath);
  if (cached !== undefined) return cached;
  let content = '';
  try {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      content = fs.readFileSync(absPath, 'utf8');
    }
  } catch {
    content = '';
  }
  fileCache.set(absPath, content);
  return content;
}

/* -------------------------------------------------------------------------- */
/* Symbol resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a relative module specifier (as found in an `export * from '...'`)
 * to a concrete file on disk, trying common TS/TSX extensions and index files.
 */
function resolveModule(fromFile: string, specifier: string): string | null {
  // Only relative specifiers are resolvable against the filesystem.
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    base + '.d.ts',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Does `text` contain a declaration, export, or meaningful usage of `symbol`?
 *
 * Accepts (per the spec, treating the keyword-declaration rule as the primary
 * case and adding the forms that actually occur in this codebase):
 *   - declarations:        function|const|let|var|type|interface|class|enum  Sym
 *   - default/inline exports of Sym
 *   - named re-exports:    export { ... Sym ... } from '...'  (spans newlines)
 *   - usage / member forms: Sym(   Sym<   Sym:   Sym=
 *   - quoted string literal: 'Sym' | "Sym" | `Sym`
 *       (covers switch `case 'ADD_NODE'`, `describe('...')` blocks,
 *        object-key string arrays, and css-ish hyphenated names like
 *        `@keyframes running-glow`)
 */
function symbolAppearsInText(text: string, symbol: string): boolean {
  const s = escapeRegExp(symbol);
  const patterns = [
    new RegExp(
      `\\b(?:function|const|let|var|type|interface|class|enum)\\s+${s}\\b`,
    ),
    new RegExp(
      `export\\s+default\\s+(?:async\\s+)?(?:function|class)?\\s*${s}\\b`,
    ),
    // export { ... Sym ... } from '...'  /  import { ... Sym ... } from '...'
    new RegExp(`(?:export|import)\\b[\\s\\S]*?\\b${s}\\b[\\s\\S]*?\\bfrom\\b`),
    // export <kw> ... Sym  (inline declaration export, e.g. `export const Sym =`)
    new RegExp(
      `export\\s+(?:async\\s+)?(?:function|class|const|let|var|type|interface|enum)\\b[\\s\\S]{0,60}?\\b${s}\\b`,
    ),
    // usage forms: Sym(  Sym<  Sym:  Sym=
    new RegExp(`\\b${s}\\s*[(<:=]`),
    // quoted string literal
    new RegExp(`["'\`]${s}["'\`]`),
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Resolve a symbol against a file, following `export * from './x'` barrel
 * re-exports so that citations of a barrel `index.ts` resolve to the sibling
 * module that actually declares the symbol. A visited set guards cycles.
 */
function fileDeclaresSymbol(
  absFile: string,
  symbol: string,
  visited: Set<string> = new Set(),
): boolean {
  if (visited.has(absFile)) return false;
  visited.add(absFile);

  const text = readSource(absFile);
  if (!text) return false;

  // Statement-like "symbol" (e.g. the literal `export * from './hooks'`): the
  // citation quotes a whole statement rather than an identifier.
  if (/^\s*(?:export|import)\b/.test(symbol)) {
    return text.includes(symbol.trim());
  }

  // Member citation `Owner.member` -> verify the owner is present in the file.
  const ownerSymbol = symbol.includes('.')
    ? symbol.split('.')[0].trim()
    : symbol;

  if (symbolAppearsInText(text, ownerSymbol)) return true;

  // Follow `export * from './sibling'` barrels.
  const reExportStar = /export\s+\*\s+(?:as\s+\w+\s+)?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = reExportStar.exec(text)) !== null) {
    const target = resolveModule(absFile, match[1]);
    if (target && fileDeclaresSymbol(target, ownerSymbol, visited)) return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Citation extraction                                                        */
/* -------------------------------------------------------------------------- */

// Migrated form:  `<path>` › `<Symbol>`   (› is U+203A)
const MIGRATED_RE = /`([^`\n]+?)`\s*›\s*`([^`\n]+?)`/g;

// Legacy forms that should have been migrated:
//   - `path/to/file.ts:123`  or  `path/to/file.tsx:123-130`  (backtick line ref)
//   - any  .ts / .tsx  followed by a GitHub  #L<NNN>  anchor (in links or text)
const LEGACY_LINE_RE = /`([^`\n]*?\.tsx?):(\d+)(?:-\d+)?`/g;
const LEGACY_ANCHOR_RE = /([^\s`)\]]+\.tsx?)#L(\d+)(?:-L?\d+)?/g;

function relativeToRepo(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

function main(): void {
  const docFiles = discoverDocFiles();

  let citationCount = 0;
  const unresolved: UnresolvedCitation[] = []; // migrated citations that don't resolve
  const legacy: LegacyCitation[] = []; // legacy citations still present

  for (const docFile of docFiles) {
    const docRel = relativeToRepo(docFile);
    const text = fs.readFileSync(docFile, 'utf8');

    // (b)+(c) migrated citations
    MIGRATED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MIGRATED_RE.exec(text)) !== null) {
      citationCount++;
      const citedPath = m[1].trim();
      const citedSymbol = m[2].trim();
      const line = lineNumberAt(text, m.index);

      const absSource = path.resolve(REPO_ROOT, citedPath);
      const exists =
        fs.existsSync(absSource) && fs.statSync(absSource).isFile();

      if (!exists) {
        unresolved.push({
          doc: docRel,
          line,
          path: citedPath,
          symbol: citedSymbol,
          reason: 'file not found on disk',
        });
        continue;
      }
      if (!fileDeclaresSymbol(absSource, citedSymbol)) {
        unresolved.push({
          doc: docRel,
          line,
          path: citedPath,
          symbol: citedSymbol,
          reason: `symbol '${citedSymbol}' not declared/exported in file`,
        });
      }
    }

    // (d) legacy citations
    LEGACY_LINE_RE.lastIndex = 0;
    while ((m = LEGACY_LINE_RE.exec(text)) !== null) {
      legacy.push({
        doc: docRel,
        line: lineNumberAt(text, m.index),
        snippet: m[0],
        kind: 'line-number reference (`file.ts:NNN`)',
      });
    }
    LEGACY_ANCHOR_RE.lastIndex = 0;
    while ((m = LEGACY_ANCHOR_RE.exec(text)) !== null) {
      legacy.push({
        doc: docRel,
        line: lineNumberAt(text, m.index),
        snippet: m[0],
        kind: 'GitHub #L anchor',
      });
    }
  }

  /* ---- report ---------------------------------------------------------- */

  const bar = '─'.repeat(72);
  console.log(bar);
  console.log('Documentation citation check');
  console.log(bar);
  console.log(`Docs scanned        : ${docFiles.length}`);
  console.log(`Migrated citations  : ${citationCount}`);
  console.log(`Unresolved citations: ${unresolved.length}`);
  console.log(`Legacy citations    : ${legacy.length}`);
  console.log(bar);

  if (unresolved.length > 0) {
    console.log('\nUNRESOLVED MIGRATED CITATIONS (`path` › `Symbol`):\n');
    for (const u of unresolved) {
      console.log(`  ${u.doc}:${u.line}`);
      console.log(`      \`${u.path}\` › \`${u.symbol}\``);
      console.log(`      -> ${u.reason}`);
    }
  }

  if (legacy.length > 0) {
    console.log('\nLEGACY CITATIONS THAT MUST BE MIGRATED:\n');
    for (const l of legacy) {
      console.log(`  ${l.doc}:${l.line}`);
      console.log(`      ${l.snippet}`);
      console.log(`      -> ${l.kind}; migrate to  \`path\` › \`Symbol\``);
    }
  }

  const failures = unresolved.length + legacy.length;
  if (failures > 0) {
    console.log(`\nFAIL: ${failures} citation issue(s) found.`);
    process.exit(1);
  }

  console.log(
    '\nOK: all doc citations resolve and no legacy citations remain.',
  );
  process.exit(0);
}

main();
