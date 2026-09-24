// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'scripts/**/*.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // --- Promises & Async ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      // Ensures return await inside try/catch so errors are actually caught
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // --- Type Safety ---
      '@typescript-eslint/no-explicit-any': 'error',
      // NestJS modules/guards/pipes/interceptors are classes with only decorators
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/no-unsafe-argument': 'error',
      // Allow numbers in template literals (e.g. `User ${userId}`)
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // --- Imports ---
      // Required with isolatedModules: true; improves tree-shaking
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // --- Base ESLint ---
      eqeqeq: ['error', 'always'],
      // Use NestJS Logger instead of console
      'no-console': 'warn',

      // --- Prettier ---
      'prettier/prettier': 'error',
    },
  },
  {
    // Jest mocking patterns trip a few strict-type-checked rules with no real bug behind
    // them: `expect(mockObj.method).toHaveBeenCalledWith(...)` always flags
    // `unbound-method` (referencing a method off an object is exactly what mock
    // assertions do — there's no `this` to lose), and `jest.Mocked<...>`/`jest.fn()`
    // helpers are loosely typed enough to trigger `no-unsafe-*` at their boundaries even
    // though the values are test fixtures, not runtime `any` from real code.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
