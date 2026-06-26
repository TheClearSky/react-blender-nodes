// Lazy, memoized loader for the TypeScript Compiler API.
//
// Codegen v2 builds its module as a TypeScript AST (`ts.factory`) and prints it
// with `ts.createPrinter`. `typescript` is a real runtime dependency but ~8MB,
// so it is loaded ONLY on first codegen use, via a dynamic `import()` — this
// keeps it out of the editor's main chunk (it is also externalized from the
// library bundle; see `vite.config.ts`). Mirrors the lazy-prettier pattern in
// `formatSource.ts`.

type TsModule = typeof import('typescript');

let cachedTs: Promise<TsModule> | null = null;

/**
 * Resolve the TypeScript Compiler API module, importing it at most once.
 *
 * @returns The `typescript` module namespace (`ts.factory`, `ts.createPrinter`, …).
 */
function loadTs(): Promise<TsModule> {
  if (!cachedTs) {
    // The default export shape differs across bundlers/CJS interop; normalize so
    // callers always get the namespace with `factory`/`createPrinter` on it.
    cachedTs = import('typescript').then(
      (mod) => (mod as { default?: TsModule }).default ?? mod,
    );
  }
  return cachedTs;
}

export { loadTs };
export type { TsModule };
