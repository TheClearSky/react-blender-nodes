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
  ],
  storybook.configs['flat/recommended'],
);
