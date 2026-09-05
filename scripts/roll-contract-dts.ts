#!/usr/bin/env node
/**
 * roll-contract-dts.ts
 *
 * Rolls the per-file `.d.ts` that the contract build emits into
 * `dist/.dts-staging/` into a SINGLE self-contained `dist/contract.d.ts` (bare
 * external imports only), using API Extractor — the same roller vite-plugin-dts
 * wraps, but invoked directly so we can target the `/contract` entry WITHOUT
 * disturbing the root build's rolled `dist/index.d.ts`. (vite-plugin-dts's
 * `rollupTypes` only rolls the single package-`types` entry.)
 *
 * Chained after the contract Vite build in the `build:contract` npm script.
 * Run: node --experimental-strip-types scripts/roll-contract-dts.ts
 */
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
} from '@microsoft/api-extractor';

const rootFolder = fileURLToPath(new URL('..', import.meta.url));
const stagingEntry = path.join(rootFolder, 'dist/.dts-staging/contract.d.ts');
const outputFile = path.join(rootFolder, 'dist/contract.d.ts');
const stagingDir = path.join(rootFolder, 'dist/.dts-staging');

if (!existsSync(stagingEntry)) {
  process.stderr.write(
    `[roll-contract-dts] missing staged entry ${stagingEntry} — did the contract Vite build (dts → dist/.dts-staging) run first?\n`,
  );
  process.exit(1);
}

const extractorConfig = ExtractorConfig.prepare({
  configObjectFullPath: undefined,
  packageJsonFullPath: path.join(rootFolder, 'package.json'),
  configObject: {
    projectFolder: rootFolder,
    mainEntryPointFilePath: stagingEntry,
    compiler: { tsconfigFilePath: path.join(rootFolder, 'tsconfig.app.json') },
    dtsRollup: {
      enabled: true,
      untrimmedFilePath: '',
      publicTrimmedFilePath: outputFile,
    },
    apiReport: { enabled: false },
    docModel: { enabled: false },
    tsdocMetadata: { enabled: false },
    // The contract surface intentionally re-exports editor types (State, etc.);
    // don't fail on API Extractor's advisory "forgotten export" / release-tag
    // warnings — self-containment is verified separately by check-dist-types.
    messages: {
      extractorMessageReporting: {
        default: { logLevel: ExtractorLogLevel.None },
      },
      compilerMessageReporting: {
        default: { logLevel: ExtractorLogLevel.None },
      },
    },
  },
});

const result = Extractor.invoke(extractorConfig, {
  localBuild: true,
  showVerboseMessages: false,
});

// Clean up the staging tree regardless of outcome.
rmSync(stagingDir, { recursive: true, force: true });

if (!result.succeeded || !existsSync(outputFile)) {
  process.stderr.write(
    `[roll-contract-dts] API Extractor failed (errors=${result.errorCount}, warnings=${result.warningCount}); dist/contract.d.ts not produced.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `[roll-contract-dts] OK — rolled dist/contract.d.ts (self-contained).\n`,
);
