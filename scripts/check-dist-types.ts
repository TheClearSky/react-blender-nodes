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

const bundlePath = fileURLToPath(
  new URL('../dist/index.d.ts', import.meta.url),
);
const normalizedBundlePath = bundlePath.replace(/\\/g, '/');

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

const program = ts.createProgram([bundlePath], compilerOptions);

// Only diagnostics whose file IS the bundle matter; errors inside third-party
// node_modules declarations (now visited because skipLibCheck is off) are not
// this gate's concern and are dropped.
const bundleDiagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter(
    (diagnostic) =>
      diagnostic.file !== undefined &&
      diagnostic.file.fileName.replace(/\\/g, '/') === normalizedBundlePath,
  );

if (bundleDiagnostics.length > 0) {
  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };
  process.stderr.write(
    '[check-dist-types] dist/index.d.ts does not type-check as a standalone published bundle:\n\n',
  );
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(bundleDiagnostics, formatHost) +
      '\n',
  );
  process.stderr.write(
    '[check-dist-types] A TS2307 here means an inferred public type pulled a module path into the rollup that resolves OUTSIDE the package — consumers see `any` under skipLibCheck. Fix: give the exported declaration an explicit type the file imports (see useFullGraph / standardDataTypes).\n',
  );
  process.exit(1);
}

// Encapsulation guard: the source-emission analysis wire types (`SourceEmissionPlan`,
// `EmittedFunction`) are INTERNAL — `emitJs` keeps them off the public `EmitJsOptions`
// via the `EmitJsOptionsInternal` split (review H-1). They must never reach the
// published bundle; re-adding `sourceEmission?` to the PUBLIC type would re-pull them
// and STILL type-check clean (they resolve — they're just re-exposed), so type-checking
// alone can't catch the regression. Guard the surface text explicitly.
const bundleText = ts.sys.readFile(bundlePath) ?? '';
const leakedInternalTypes = ['SourceEmissionPlan', 'EmittedFunction'].filter(
  (name) => bundleText.includes(name),
);
if (leakedInternalTypes.length > 0) {
  process.stderr.write(
    `[check-dist-types] internal codegen analysis type(s) leaked into the published bundle: ${leakedInternalTypes.join(', ')}. These belong to analyze/sourceEmit.ts and must stay OFF the public EmitJsOptions (use EmitJsOptionsInternal) — see the H-1 split.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  '[check-dist-types] OK — dist/index.d.ts type-checks as a standalone bundle (no escaping imports).\n',
);
