#!/usr/bin/env node
/**
 * check-dist-types.ts
 *
 * Build gate: type-check the rolled-up declaration bundle (dist/index.d.ts) the
 * way a CONSUMER compiles against it, so any import specifier that escapes the
 * published package surfaces as a hard error instead of silently degrading an
 * exported type to `any`.
 *
 * Why the normal build does NOT catch this:
 *   - `tsc -b` type-checks src/ with `noEmit`; it never inspects the rolled-up
 *     dist bundle (that artifact is produced by vite-plugin-dts / API Extractor).
 *   - the dts-rollup EMITS an escaping relative specifier without failing — the
 *     path still "resolves" at build time inside the repo tree.
 *   - the breakage is consumer-only and SILENT under `skipLibCheck: true` (the
 *     imported type degrades to `any`; e.g. the `dispatch: any` regression where
 *     an inferred `Action` leaked `from '../../../utils'` into the bundle).
 *
 * This gate re-runs the TypeScript compiler over the emitted bundle with
 * `skipLibCheck: false` (so errors INSIDE the .d.ts are reported) and fails on
 * any diagnostic that originates in the bundle itself. Third-party node_modules
 * .d.ts noise — surfaced only because skipLibCheck is off — is filtered out by
 * file. A clean API-Extractor rollup is fully self-contained (only bare external
 * imports remain), so a correct bundle yields ZERO bundle-local diagnostics; an
 * escaping relative specifier yields TS2307 "Cannot find module".
 *
 * Run: node --experimental-strip-types scripts/check-dist-types.ts
 */
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Consumer-like compilation. `skipLibCheck: false` is the crux: it makes the
// compiler report unresolved imports that live INSIDE a .d.ts (which a normal
// consumer build silences into `any`).
const compilerOptions: ts.CompilerOptions = {
  noEmit: true,
  skipLibCheck: false,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: false,
  types: [],
};

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};

/**
 * Type-check one rolled `.d.ts` bundle the way a consumer compiles against it and
 * report only the diagnostics that originate IN that bundle (third-party
 * node_modules `.d.ts` noise, now visited because `skipLibCheck` is off, is
 * dropped). Returns true when the bundle is a clean, self-contained surface.
 */
function checkBundleSelfContained(relativePath: string): boolean {
  const bundlePath = fileURLToPath(
    new URL(`../${relativePath}`, import.meta.url),
  );
  const normalized = bundlePath.replace(/\\/g, '/');
  const program = ts.createProgram([bundlePath], compilerOptions);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.file !== undefined &&
        diagnostic.file.fileName.replace(/\\/g, '/') === normalized,
    );
  if (diagnostics.length > 0) {
    process.stderr.write(
      `[check-dist-types] ${relativePath} does not type-check as a standalone published bundle:\n\n`,
    );
    process.stderr.write(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost) + '\n',
    );
    process.stderr.write(
      '[check-dist-types] A TS2307 here means an inferred public type pulled a module path into the rollup that resolves OUTSIDE the package — consumers see `any` under skipLibCheck. Fix: give the exported declaration an explicit type the file imports (see useFullGraph / standardDataTypes).\n',
    );
    return false;
  }
  return true;
}

// Both published bundles must be self-contained: the root entry (`dist/index.d.ts`)
// and the React-free codegen contract subpath (`dist/contract.d.ts`, exposed as
// `@theclearsky/react-blender-nodes/contract`).
const bundlesOk = ['dist/index.d.ts', 'dist/contract.d.ts']
  .map(checkBundleSelfContained)
  .every(Boolean);
if (!bundlesOk) process.exit(1);

// NOTE: the codegen source-emission encapsulation guard (the `SourceEmissionPlan` /
// `EmittedFunction` internal-leak tripwire, review H-1) moved WITH the codegen
// surface into the `@theclearsky/react-blender-nodes-codegen` plugin — those types
// no longer exist in this library, so there is nothing here to guard.

process.stdout.write(
  '[check-dist-types] OK — dist/index.d.ts + dist/contract.d.ts type-check as standalone bundles (no escaping imports).\n',
);
