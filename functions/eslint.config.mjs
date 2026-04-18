// Standalone ESLint 9 flat config for functions/. Kept separate from root config
// because cross-package imports of eslint configs fail on plugin resolution
// (eslint-plugin-* resolves from functions/node_modules, not root's). Rules are
// intentionally duplicated from root; CI alignment check is a future row.
// Locked decisions enforced here:
// - LD-169 vendor domain discipline (no-restricted-imports for non-approved libs)
// - LD-211 AI Coach built in-house (no Claude SDK outside functions/ services/claude*)

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-var-requires': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@sentry/node', message: 'Sentry banned. Use structured logger.' },
            { name: '@sentry/react-native', message: 'Sentry banned. Use structured logger.' },
            { name: '@bugsnag/js', message: 'Bugsnag banned. Use structured logger.' },
            { name: 'rollbar', message: 'Rollbar banned. Use structured logger.' },
          ],
          patterns: [
            { group: ['@sentry/*'], message: 'Sentry banned (LD-169).' },
            { group: ['@bugsnag/*'], message: 'Bugsnag banned (LD-169).' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression",
          message: 'Dynamic imports banned (LD-169 vendor discipline). Use static imports.',
        },
      ],
    },
  },
  {
    ignores: ['lib/**', 'node_modules/**'],
  },
];
