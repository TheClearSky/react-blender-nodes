// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

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
      // Codegen extraction boundary (.claude/plans/codegen-ast-rebuild.md §5.3):
      // the `codegen/` core may import editor / runner / core symbols ONLY through
      // `./contract` so the folder can later be lifted into a standalone package.
      // Sibling (`./…`) and allowed bare deps (e.g. zod) are fine; any parent (`../…`)
      // or editor/React/@xyflow import must go via the contract. `contract.ts` itself
      // is the single sanctioned crossing point and is exempt.
      files: ['src/utils/nodeRunner/runTargets/codegen/**/*.{ts,tsx}'],
      ignores: ['src/utils/nodeRunner/runTargets/codegen/contract.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../**', '@/**', '@xyflow/**', 'react', 'react-dom'],
                message:
                  'codegen/ must reach editor/runner/core symbols only through ./contract (the extraction boundary). See .claude/plans/codegen-ast-rebuild.md §5.3.',
              },
            ],
          },
        ],
      },
    },
  ],
  storybook.configs['flat/recommended'],
);
