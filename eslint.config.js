// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

// ── IN-41 barrel-cycle guard ────────────────────────────────────────────
//
// A module importing a BARREL that re-exports it forms a cycle, which shipped
// as an import-time TDZ `ReferenceError` in BOTH dist bundles for the whole
// 0.0.x line. `scripts/check-dist-loads.ts` backstops it by EXECUTING the
// bundles; these rules stop it being written in the first place.
//
// The alternation is deliberately permissive about SPELLING: `@/x`, `@/x/`,
// `@/x/index`, `@/x/index.ts` and `@/x.ts` all resolve to the same barrel
// (`allowImportingTsExtensions` is on), and a guard whose value is being
// un-bypassable-by-accident must cover every one of them.
const barrelSourceRegex = (barrel) =>
  `^@\\u002F${barrel}(\\u002Findex)?(\\.tsx?)?\\u002F?$`;

const barrelPattern = (barrel) => ({
  regex: barrelSourceRegex(barrel),
  message: `Importing the @/${barrel} barrel from a module it re-exports creates a cycle (IN-41: import-time TDZ in the built bundles). Deep-import the specific module instead.`,
  // `import type { … } from` is fully erased and cannot cycle. The INLINE
  // form `import { type X } from` is NOT — see the value-import selector
  // below, which is what actually closes that hole.
  allowTypeImports: true,
});

const barrelSyntaxRules = (barrel) => [
  {
    // THE `verbatimModuleSyntax` HOLE. With that flag on (tsconfig.app.json),
    // `import { type X } from '@/x'` is rewritten to `import {} from '@/x'` —
    // the module edge SURVIVES erasure — yet `allowTypeImports` treats an
    // all-type-specifier import as type-only and exempts it. Matching on the
    // DECLARATION's `importKind` catches it: a real `import type { … }`
    // declaration is `importKind: 'type'` and stays allowed.
    selector: `ImportDeclaration[importKind="value"][source.value=/${barrelSourceRegex(barrel)}/]`,
    message: `Importing the @/${barrel} barrel from a module it re-exports creates a cycle (IN-41). Note \`import { type X } from\` does NOT erase the import under verbatimModuleSyntax — write \`import type { X } from\`, or deep-import the specific module.`,
  },
  {
    // `const { X } = await import('@/x')` — invisible to no-restricted-imports.
    selector: `ImportExpression > Literal[value=/${barrelSourceRegex(barrel)}/]`,
    message: `Dynamically importing the @/${barrel} barrel re-creates the IN-41 cycle at runtime. Deep-import the specific module instead.`,
  },
  {
    // `export { X } from '@/x'` / `export * from '@/x'` — also invisible to it.
    selector: `ExportNamedDeclaration[source.value=/${barrelSourceRegex(barrel)}/], ExportAllDeclaration[source.value=/${barrelSourceRegex(barrel)}/]`,
    message: `Re-exporting through the @/${barrel} barrel re-creates the IN-41 cycle. Re-export from the specific module instead.`,
  },
];

export default tseslint.config(
  [
    globalIgnores([
      'dist',
      'storybook-static',
      'coverage',
      'playwright-report',
      'test-results',
    ]),
    {
      files: ['**/*.{ts,tsx}'],
      extends: [
        js.configs.recommended,
        tseslint.configs.recommended,
        reactHooks.configs['recommended-latest'],
        reactRefresh.configs.vite,
      ],
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
      },
      rules: {
        // Honour the repo-wide `_`-prefix convention for intentionally-unused
        // bindings (signature params required for arity, placeholder destructures).
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            // The repo strips fields via `const { dropped, ...rest } = obj` (e.g.
            // stripComplexSchema); the dropped sibling is intentionally unused.
            ignoreRestSiblings: true,
          },
        ],
        // Library files legitimately export a co-located constant (cva variants,
        // shape maps) next to their component; that's a constant, not an HMR hazard.
        'react-refresh/only-export-components': [
          'error',
          { allowConstantExport: true },
        ],
      },
    },
    {
      // Scope: the ROOT barrel (`src/index.ts`) re-exports everything under
      // `src/`, so importing it from anywhere in `src/` is a cycle. (See the
      // helper definitions at the top of this file for the full rationale.)
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          { patterns: [barrelPattern('index')] },
        ],
        'no-restricted-syntax': ['error', ...barrelSyntaxRules('index')],
      },
    },
    {
      // `@/components` re-exports every component, so only files UNDER
      // `src/components/` can cycle through it. Banning it repo-wide would
      // flag legitimate imports from `src/hooks`, `src/utils`, …
      files: ['src/components/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          { patterns: [barrelPattern('components'), barrelPattern('index')] },
        ],
        'no-restricted-syntax': [
          'error',
          ...barrelSyntaxRules('components'),
          ...barrelSyntaxRules('index'),
        ],
      },
    },
    {
      // Same reasoning for `@/utils`, which re-exports `./nodeStateManagement`
      // and therefore transitively reaches most of `src/utils/`.
      files: ['src/utils/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          { patterns: [barrelPattern('utils'), barrelPattern('index')] },
        ],
        'no-restricted-syntax': [
          'error',
          ...barrelSyntaxRules('utils'),
          ...barrelSyntaxRules('index'),
        ],
      },
    },
  ],
  storybook.configs['flat/recommended'],
);
