# Build, Tooling & Dependencies — Paranoid Review

## Domain summary

This is a published React component library (`@theclearsky/react-blender-nodes`,
v0.0.11) built with Vite library mode (`tsc -b && vite build`), TypeScript
project references, `vite-plugin-dts` (`rollupTypes: true`), ESLint flat config,
Prettier, Husky + lint-staged, Storybook 9, Vitest, and Playwright. TypeScript
config is genuinely strict (`strict`, `noUnusedLocals/Parameters`,
`noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`,
`verbatimModuleSyntax`, `isolatedModules`). The lockfile (`package-lock.json`)
is committed and CI uses `npm ci`, so installs are reproducible. The most
serious problems are in the _gating_ and _dependency declaration_ layers, not
the compiler config: (1) the published package imports `@xyflow/system` (a
runtime enum + types) without declaring it, and the rolled-up `dist/index.d.ts`
leaks that undeclared module — a real consumer-facing break under strict
installs; (2) dev-only tooling (`husky`, `lint-staged`, `prettier`) sits in
`dependencies`, shipping to every consumer; (3) `npm run lint` is effectively
non-functional (it crawls the generated `storybook-static/` artifact and fails
on vendored code) AND is not wired into CI or the pre-commit hook, so 36 real
source lint errors — including 2 `react-hooks/rules-of-hooks` violations — have
landed unblocked. `tsc -b` does run in CI and currently passes, so type errors
are still caught.

---

## HIGH

### BD-1 — `@xyflow/system` is a phantom (undeclared) dependency, imported as a runtime value AND leaked into the published `.d.ts`

- **Severity:** HIGH **Confidence:** high **Category:** Undeclared dependency /
  packaging
- **Files:**
  - `src/components/atoms/NodeResizerWithMoreControls/NodeResizerWithMoreControls.tsx:1-4,116`
  - `dist/index.d.ts:24,52` (generated output, present on disk)
  - `package.json:68-86` (`dependencies` — `@xyflow/system` absent),
    `package.json:64-67` (`peerDependencies` — absent)
- **Current vs expected:** `NodeResizerWithMoreControls.tsx` does
  `import { ResizeControlVariant, type ResizeControlDirection } from '@xyflow/system'`
  and uses `ResizeControlVariant.Line` as a **runtime value** (it's an enum).
  `@xyflow/system` is not in `dependencies`, `devDependencies`, or
  `peerDependencies`; it is only present transitively (`@xyflow/system@0.0.68`,
  a dep of `@xyflow/react`). Additionally, the rolled-up declaration file ships
  `import { EdgePosition } from '@xyflow/system'` (line 24) and
  `import { ResizeControlDirection } from '@xyflow/system'` (line 52). Expected:
  any package referenced by published JS _or_ `.d.ts` must be a declared
  `dependency` (or `peerDependency`).
- **Root cause:** Direct import of a transitive package, plus `vite-plugin-dts`
  `rollupTypes: true` inlining `@xyflow/system` type imports from
  `@xyflow/react`'s public types. Vite externalizes only
  `['react','react-dom']`, so the _runtime_ enum is bundled (runtime happens to
  work today), but the **types are not** — they reference the bare module
  specifier.
- **Impact:** Consumers installing `@theclearsky/react-blender-nodes` get
  `TS2307: Cannot find module '@xyflow/system'` when they typecheck, unless
  their package manager hoists the transitive copy to a resolvable location.
  Strict/isolated installs (pnpm default, Yarn PnP, npm with `node-linker`
  variations) break. Locally, correctness also depends on hoisting — a future
  `@xyflow/react` bump that changes its `@xyflow/system` range can silently
  break the author's build.
- **Reproduction:** In a strict-install consumer project,
  `import { FullGraph } from '@theclearsky/react-blender-nodes'` then `tsc` →
  unresolved `@xyflow/system`.
- **Evidence:**
  ```ts
  // NodeResizerWithMoreControls.tsx:1-4
  import { ResizeControlVariant, type ResizeControlDirection } from '@xyflow/system';
  // :116
  variant={ResizeControlVariant.Line}
  // dist/index.d.ts:24
  import { EdgePosition } from '@xyflow/system';
  ```
  `package.json` has no `@xyflow/system` entry; `npm ls @xyflow/system` resolves
  it only as a child of `@xyflow/react`.
- **Fix direction:** Add `@xyflow/system` to `dependencies` (matching
  `@xyflow/react`'s required range), or import these symbols from
  `@xyflow/react` if it re-exports them, or add it as a `peerDependency`.

---

## MEDIUM

### BD-2 — Dev-only tooling declared in `dependencies` (ships to every consumer)

- **Severity:** MEDIUM **Confidence:** high **Category:** Wrong dependency
  section / install bloat
- **Files:** `package.json:77` (`husky`), `package.json:79` (`lint-staged`),
  `package.json:82` (`prettier`)
- **Current vs expected:** `husky`, `lint-staged`, and `prettier` are runtime
  `dependencies`. They are pure dev tooling — zero imports anywhere in `src`
  (verified: each has 0 `import`/`from` occurrences in `src/**/*.{ts,tsx}`). For
  a published library, dev tooling belongs in `devDependencies`.
- **Root cause:** Misplacement during setup.
- **Impact:** Every downstream consumer of the package transitively installs
  Husky, lint-staged, and Prettier (and their large dependency trees). The
  package's own `prepare: husky` script won't execute on consumers (npm doesn't
  run a dependency's `prepare`), so it's "only" wasted install weight,
  dependency-resolution surface, and audit noise — but it is real and ships on
  the published artifact.
- **Evidence:**
  ```
  0  husky
  0  lint-staged
  0  prettier   (import counts across src/**/*.{ts,tsx})
  ```
  `package.json:68-86` lists them under `"dependencies"`.
- **Fix direction:** Move all three to `devDependencies`.

### BD-3 — `npm run lint` is non-functional and ungated: it lints the generated `storybook-static/` artifact and is wired into neither CI nor pre-commit

- **Severity:** MEDIUM **Confidence:** high **Category:** Tooling / CI gating
- **Files:**
  - `eslint.config.js:13` (`globalIgnores(['dist'])` only)
  - `package.json:36` (`"lint": "eslint ."`)
  - `.github/workflows/library-deploy.yml:30-31,56-57` (CI runs only
    `npm run build`)
  - `.husky/pre-commit` + `package.json:130-134` (lint-staged runs only
    `npm run pretty`)
- **Current vs expected:** Running `npm run lint` (`eslint .`) traverses
  `storybook-static/` (a build artifact that is gitignored but present after any
  Storybook build) and fails with 43 errors from _vendored bundle code_ (e.g.
  `Definition for rule 'regexp/strict' was not found`,
  `jsx-a11y/anchor-has-content`, etc.) that the project's flat config never
  defines. ESLint's flat config only ignores `dist`, not `storybook-static`,
  `coverage`, `playwright-report`, or `test-results`. Separately, even scoping
  to source (`eslint src`) yields **36 errors + 38 warnings** of genuine issues.
  Neither CI nor the pre-commit hook runs ESLint, so none of this blocks a
  commit or a publish.
- **Root cause:** (a) incomplete `globalIgnores`; (b) lint not added to CI or
  lint-staged.
- **Impact:** The lint command can't be used as a gate (it errors on artifacts),
  and because nothing runs it, real lint failures accumulate silently.
  Concretely, the unblocked source errors include **2
  `react-hooks/rules-of-hooks` violations** (`ConfigurableNode.tsx:247` and
  `ContextAwareHandle.tsx:299` — `useNodeConnections` called conditionally),
  which are genuine React-correctness bugs that a working lint gate would have
  caught.
- **Evidence:**
  ```
  # eslint . (tail): 99 problems (43 errors, 56 warnings) — all 43 errors from storybook-static/*
  # eslint src: 74 problems (36 errors, 38 warnings)
  #   17 @typescript-eslint/no-unused-vars
  #    9 react-refresh/only-export-components
  #    3 @typescript-eslint/no-explicit-any
  #    2 react-hooks/rules-of-hooks
  ```
- **Fix direction:** Add `storybook-static`, `coverage`, `playwright-report`,
  `test-results` (and `node_modules`) to `globalIgnores`; add `lint` to
  `library-deploy.yml` and/or lint-staged; fix the 36 source errors.

### BD-4 — Publish pipeline does not run tests or lint before `npm publish`

- **Severity:** MEDIUM **Confidence:** high **Category:** CI gating / release
  safety
- **Files:** `.github/workflows/library-deploy.yml:27-31,53-60`
- **Current vs expected:** The release job installs (`npm ci`) and runs only
  `npm run build`, then `npm publish --provenance --access public`. There is no
  `npm run test` / `test:unit`, no `npm run lint`, no e2e gate. A green publish
  only proves `tsc -b` + `vite build` succeeded. Expected for a public library:
  unit tests (and ideally lint) gate the release.
- **Root cause:** Minimal deploy workflow.
- **Impact:** A regression that compiles but breaks behavior (failing
  Vitest/Playwright) or a lint/style regression can be published to npm.
  `tsc -b` _does_ run, so type errors are still blocked (mitigating factor), but
  logic regressions are not.
- **Evidence:**
  ```yaml
  - name: Build Library
    run: npm run build
  - name: Deploy to NPM
    run: unset NODE_AUTH_TOKEN && npm publish --provenance --access public
  ```
  No `test`/`lint` step in either `build-library` or `deploy-library`.
- **Fix direction:** Add `npm run test:unit` (and optionally `npm run lint`) as
  a required step before `npm publish`.

---

## LOW

### BD-5 — Whole-`lodash` default import bundled for a single `cloneDeep` call

- **Severity:** LOW **Confidence:** high **Category:** Bundle size
- **Files:** `src/utils/nodeStateManagement/edges/typeInference.ts:9,67`
- **Current vs expected:** `import _ from 'lodash'` (the entire CJS library) is
  used only for `_.cloneDeep(...)`. This module is reachable from the public
  bundle (`src/index.ts` → `./utils`), and Vite externalizes only
  `react`/`react-dom`, so all of `lodash` is bundled into the ESM/UMD output.
  Expected: `import cloneDeep from 'lodash/cloneDeep'`, `lodash-es`, or
  `structuredClone`/immer's clone to keep the bundle lean and tree-shakeable.
- **Root cause:** Default whole-library import for one helper.
- **Impact:** Tens of KB of unnecessary code shipped to consumers; the CJS
  default import also hampers ESM tree-shaking.
- **Evidence:** `import _ from 'lodash';` (line 9); only use is
  `const updateValues = _.cloneDeep({` (line 67).

### BD-6 — Redundant `radix-ui` umbrella alongside individual `@radix-ui/react-*` packages (version-skew risk)

- **Severity:** LOW **Confidence:** medium **Category:** Dependency hygiene
- **Files:** `package.json:71,72,83` (`@radix-ui/react-checkbox`,
  `@radix-ui/react-slot`, and the `radix-ui` umbrella)
- **Current vs expected:** The project depends on both the `radix-ui` umbrella
  (`1.4.3`) and standalone `@radix-ui/react-checkbox`/`@radix-ui/react-slot` —
  and `radix-ui` itself bundles those same primitives. Source imports both
  styles (`radix-ui` in `Modal.tsx`/`Accordion.tsx`; `@radix-ui/react-checkbox`
  in the Checkbox component). Currently `npm ls` shows everything deduped to
  `@radix-ui/react-slot@1.2.3`, so there is no _active_ breakage. Under
  independent caret ranges across these two declaration styles, a future update
  can desync the standalone vs umbrella primitive versions.
- **Root cause:** Mixed adoption of the umbrella and individual packages.
- **Impact:** Latent risk of duplicate/incompatible Radix primitive instances
  (context-mismatch bugs) and duplicated code in the bundle. No current
  breakage.
- **Evidence:** `npm ls @radix-ui/react-slot radix-ui` shows `radix-ui@1.4.3`
  re-providing `@radix-ui/react-checkbox` and `@radix-ui/react-slot` that are
  also top-level deps; all `deduped` today.

### BD-7 — lint-staged formats the entire repo on every commit instead of staged files

- **Severity:** LOW **Confidence:** high **Category:** Tooling correctness
- **Files:** `package.json:130-134`
  (`"lint-staged": { "*": ["npm run pretty"] }`); `package.json:39`
  (`"pretty": "prettier --write ."`)
- **Current vs expected:** lint-staged passes the matched staged file paths as
  arguments, but the command `npm run pretty` resolves to `prettier --write .` —
  it ignores the passed file list and reformats the whole working tree on every
  commit. Files modified by Prettier outside the staged set are **not**
  re-staged by lint-staged (it only re-adds the files it passed), so writes to
  unstaged files can silently diverge from the commit. Expected:
  `prettier --write` operating on the staged filenames lint-staged provides.
- **Root cause:** Wiring lint-staged to a fixed whole-repo script rather than a
  per-file command.
- **Impact:** Slow commits on large trees; possible confusing/unstaged
  formatting changes. No build breakage.
- **Evidence:** `"*": ["npm run pretty"]` → `prettier --write .` (the trailing
  `.` overrides any per-file args).

### BD-8 — Library ships `target: "ESNext"` with no `build.target`/transpile floor

- **Severity:** LOW **Confidence:** medium **Category:** Output compatibility /
  reproducibility
- **Files:** `tsconfig.app.json:4` (`"target": "ESNext"`),
  `vite.config.ts:29-54` (no `build.target`, no `browserslist`)
- **Current vs expected:** The published entry is built from `tsconfig.app.json`
  with `target: "ESNext"`, and `vite.config.ts` sets no `build.target` or
  browserslist. esbuild therefore emits whatever the floating "ESNext" baseline
  is at build time, so the _exact_ syntax level of the published artifact
  depends on the toolchain version present when CI runs — a mild
  reproducibility/compat smell for a consumer-facing library (older
  bundlers/runtimes may choke on freshly-stabilized syntax).
- **Root cause:** No explicit output target pinned for library mode.
- **Impact:** Possible consumer-side parse/runtime issues on older targets;
  build output not pinned to a fixed syntax level.
- **Evidence:** `tsconfig.app.json` `"target": "ESNext"`; `vite.config.ts`
  `build` block contains `lib`, `rollupOptions`, `sourcemap`, `emptyOutDir` but
  no `target`.

---

## Items explicitly checked and found OK (to bound the paranoia)

- **Lockfile / reproducibility:** `package-lock.json` is committed
  (`git ls-files` confirms) and CI uses `npm ci` — installs are reproducible.
- **Dependency tree health:** `npm ls --all` shows no UNMET _required_ deps, no
  `invalid`, no `extraneous`; only UNMET _optional_ peers of vite/vitest
  (expected).
- **`tsc` strictness:** `strict`, `noUnusedLocals/Parameters`,
  `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`,
  `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly` all on.
  `skipLibCheck: true` is present but is standard for app builds and does not
  mask first-party source errors.
- **Type-check gate:** `npm run build` runs `tsc -b` before `vite build` and CI
  runs `npm run build`, so type errors block publishing.
  `npx tsc --noEmit -p tsconfig.app.json` currently passes clean.
- **`sonner`, `@storybook/react-vite`, `storybook/*`, `vitest`:** imported only
  in `.stories.tsx` / test files — correctly in `devDependencies`.
- **`@xyflow/react` v12, `culori` + `@types/culori`, `immer` v10, `zod` v4:**
  declared and resolvable; no version mismatch detected in the installed tree.
