#!/usr/bin/env node
/**
 * check-dist-loads.ts
 *
 * Build gate: EXECUTE the shipped artifacts the way consumers load them, so a
 * bundle that crashes at import time (or a manifest that names a file the
 * build never emits) fails the build instead of the consumer's first install.
 *
 * Why the rest of the build does NOT catch this:
 *   - `tsc -b` + `vite build` prove the bundles EMIT, not that they LOAD —
 *     the 0.0.x line shipped with `main` naming `react-blender-nodes.umd.cjs`
 *     while the build emitted `.umd.js` (C5/IN-01: `require()` unresolvable),
 *     and BOTH bundles threw `ReferenceError: Cannot access 'X' before
 *     initialization` at import time from a circular barrel import (IN-41).
 *     Every gate stayed green through both.
 *   - `check-dist-types` proves the .d.ts surface, which says nothing about
 *     runtime module evaluation.
 *
 * What this gate does, in order (all steps run; failures aggregate):
 *   1. Preflight — peer deps must be installed or the probes would false-fail.
 *   2. Existence — every file the manifest points at exists in dist/.
 *   3. Coherence — `main`/`module` agree with `exports["."]` (divergence to
 *      two different existing files would otherwise pass silently).
 *   4. Execution probes — one CHILD PROCESS per entry (root CJS, root ES,
 *      contract CJS, contract ES): no shared module cache, no cross-probe
 *      global residue, one broken bundle cannot mask another. A TDZ
 *      regression names its symbol in the probe's error output.
 *   5. Sentinels — root exports callable `FullGraph` + `useFullGraph`;
 *      contract exports exactly the 6 documented runtime values.
 *
 * Run: node --experimental-strip-types scripts/check-dist-loads.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// tsconfig.node.json has no `resolveJsonModule` and enforces
// `erasableSyntaxOnly`, so the manifest is read manually and typed narrowly
// (an import-attribute JSON import would fail `tsc -b`).
type PackageManifest = {
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, string | Record<string, string>>;
};

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest;

const failures: string[] = [];
function pass(label: string, detail: string): void {
  process.stdout.write(`[check-dist-loads] PASS ${label} — ${detail}\n`);
}
function fail(label: string, detail: string): void {
  failures.push(label);
  process.stderr.write(`[check-dist-loads] FAIL ${label} — ${detail}\n`);
}

// ─── 1. Preflight: peer deps present (environment, not a dist defect) ───
try {
  createRequire(import.meta.url).resolve('react');
} catch {
  process.stderr.write(
    '[check-dist-loads] environment: peer deps not installed (run `npm ci`) — NOT a dist defect. Aborting before probes that would all false-fail.\n',
  );
  process.exit(1);
}

// ─── 2. Existence: every manifest file target exists in dist/ ───────────
/** Collect every string leaf under main/module/types/exports (condition
 *  objects AND direct string leaves like "./style.css"). */
function collectManifestTargets(m: PackageManifest): Map<string, string> {
  const targets = new Map<string, string>();
  if (m.main) targets.set('main', m.main);
  if (m.module) targets.set('module', m.module);
  if (m.types) targets.set('types', m.types);
  for (const [entry, value] of Object.entries(m.exports ?? {})) {
    if (typeof value === 'string') {
      targets.set(`exports["${entry}"]`, value);
    } else {
      for (const [condition, target] of Object.entries(value)) {
        targets.set(`exports["${entry}"].${condition}`, target);
      }
    }
  }
  return targets;
}

const manifestTargets = collectManifestTargets(manifest);
for (const [label, relativePath] of manifestTargets) {
  const absolutePath = fileURLToPath(
    new URL(`../${relativePath}`, import.meta.url),
  );
  if (existsSync(absolutePath)) {
    pass(`exists ${label}`, relativePath);
  } else {
    fail(
      `exists ${label}`,
      `${relativePath} is named by the manifest but was not emitted to dist/ (the C5/IN-01 class of breakage)`,
    );
  }
}

// ─── 3. Coherence: main/module agree with exports["."] ──────────────────
const rootExport = manifest.exports?.['.'];
if (rootExport === undefined || typeof rootExport === 'string') {
  fail('coherence', 'exports["."] must be a conditions object');
} else {
  if (manifest.main === rootExport.require) {
    pass('coherence main', `main === exports["."].require (${manifest.main})`);
  } else {
    fail(
      'coherence main',
      `main (${manifest.main}) !== exports["."].require (${rootExport.require})`,
    );
  }
  if (manifest.module === rootExport.import) {
    pass(
      'coherence module',
      `module === exports["."].import (${manifest.module})`,
    );
  } else {
    fail(
      'coherence module',
      `module (${manifest.module}) !== exports["."].import (${rootExport.import})`,
    );
  }
}

// ─── 4 + 5. Execution probes (child process each) + sentinels ───────────
type ProbeVerdict = {
  ok: boolean;
  exportNames?: string[];
  sentinelTypes?: Record<string, string>;
  error?: string;
};

// The child scripts receive their target/sentinels via env vars — no argv
// quoting concerns on any platform. Each prints a single JSON verdict.
const cjsChildScript = `
  try {
    const loaded = require(process.env.DIST_PROBE_TARGET);
    const sentinelTypes = {};
    for (const name of (process.env.DIST_PROBE_SENTINELS || '').split(',').filter(Boolean)) {
      sentinelTypes[name] = typeof loaded[name];
    }
    console.log(JSON.stringify({
      ok: true,
      exportNames: Object.keys(loaded).filter((k) => k !== '__esModule'),
      sentinelTypes,
    }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: String(error && error.stack || error) }));
  }
`;
const esChildScript = `
  import { pathToFileURL } from 'node:url';
  try {
    const loaded = await import(pathToFileURL(process.env.DIST_PROBE_TARGET).href);
    const sentinelTypes = {};
    for (const name of (process.env.DIST_PROBE_SENTINELS || '').split(',').filter(Boolean)) {
      sentinelTypes[name] = typeof loaded[name];
    }
    console.log(JSON.stringify({
      ok: true,
      exportNames: Object.keys(loaded).filter((k) => k !== '__esModule'),
      sentinelTypes,
    }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: String(error && error.stack || error) }));
  }
`;

function runProbe(
  relativePath: string,
  kind: 'cjs' | 'es',
  sentinels: string[],
): ProbeVerdict {
  const absolutePath = fileURLToPath(
    new URL(`../${relativePath}`, import.meta.url),
  );
  const nodeArguments =
    kind === 'cjs'
      ? ['-e', cjsChildScript]
      : ['--input-type=module', '-e', esChildScript];
  const child = spawnSync(process.execPath, nodeArguments, {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DIST_PROBE_TARGET: absolutePath,
      DIST_PROBE_SENTINELS: sentinels.join(','),
    },
    timeout: 60_000,
  });
  if (child.error) {
    return { ok: false, error: String(child.error) };
  }
  const lastLine = child.stdout.trim().split('\n').at(-1) ?? '';
  try {
    return JSON.parse(lastLine) as ProbeVerdict;
  } catch {
    return {
      ok: false,
      error: `child produced no JSON verdict.\nstdout: ${child.stdout}\nstderr: ${child.stderr}`,
    };
  }
}

/** The complete documented runtime surface of the /contract subpath. */
const CONTRACT_EXPECTED_EXPORTS = [
  'downloadTextArtifact',
  'findConditionInputId',
  'flattenInputs',
  'getDataHandleIds',
  'qualifiedId',
  'readInput',
] as const;

const probes: Array<{
  label: string;
  relativePath: string | undefined;
  kind: 'cjs' | 'es';
  checkSentinels: (verdict: ProbeVerdict) => void;
}> = [
  {
    label: 'load root require',
    relativePath:
      typeof rootExport === 'object' ? rootExport?.require : undefined,
    kind: 'cjs',
    checkSentinels: checkRootSentinels,
  },
  {
    label: 'load root import',
    relativePath:
      typeof rootExport === 'object' ? rootExport?.import : undefined,
    kind: 'es',
    checkSentinels: checkRootSentinels,
  },
  {
    label: 'load contract require',
    relativePath: contractTarget('require'),
    kind: 'cjs',
    checkSentinels: checkContractSentinels,
  },
  {
    label: 'load contract import',
    relativePath: contractTarget('import'),
    kind: 'es',
    checkSentinels: checkContractSentinels,
  },
];

function contractTarget(condition: 'require' | 'import'): string | undefined {
  const contractExport = manifest.exports?.['./contract'];
  if (contractExport === undefined || typeof contractExport === 'string') {
    return undefined;
  }
  return contractExport[condition];
}

function checkRootSentinels(verdict: ProbeVerdict): void {
  for (const sentinel of ['FullGraph', 'useFullGraph']) {
    const sentinelType = verdict.sentinelTypes?.[sentinel];
    if (sentinelType === 'function') {
      pass(`sentinel ${sentinel}`, 'exported and callable');
    } else {
      fail(
        `sentinel ${sentinel}`,
        `expected a callable export, got typeof === '${sentinelType}'`,
      );
    }
  }
}

function checkContractSentinels(verdict: ProbeVerdict): void {
  const actual = [...(verdict.exportNames ?? [])].sort();
  const expected = [...CONTRACT_EXPECTED_EXPORTS].sort();
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass('sentinel contract surface', `exactly [${expected.join(', ')}]`);
  } else {
    fail(
      'sentinel contract surface',
      `expected exactly [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
}

// Aggregate — every probe runs even after a failure (a broken root bundle
// must not hide a broken contract bundle).
for (const probe of probes) {
  if (probe.relativePath === undefined) {
    fail(probe.label, 'manifest exports entry missing or malformed');
    continue;
  }
  const verdict = runProbe(
    probe.relativePath,
    probe.kind,
    probe.label.startsWith('load root') ? ['FullGraph', 'useFullGraph'] : [],
  );
  if (verdict.ok) {
    pass(
      probe.label,
      `${probe.relativePath} evaluated (${verdict.exportNames?.length ?? 0} exports)`,
    );
    probe.checkSentinels(verdict);
  } else {
    fail(
      probe.label,
      `${probe.relativePath} threw during module evaluation:\n${verdict.error}\n(A "Cannot access 'X' before initialization" here is the IN-41 circular-import TDZ class — trace X's declaration vs first use.)`,
    );
  }
}

// ─── Verdict ────────────────────────────────────────────────────────────
if (failures.length > 0) {
  process.stderr.write(
    `[check-dist-loads] ${failures.length} check(s) failed: ${failures.join('; ')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  '[check-dist-loads] OK — manifest targets exist, main/module cohere with exports, all four bundles evaluate, sentinels intact.\n',
);
