import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Vendored protocol clones and the upstream docs checkout are reference
    // material. Design specimens are accepted artefacts, not source. The BMAD
    // install and its skill templates are Node tooling (they use `process`),
    // not shippable kit source, so they are excluded exactly as the vendored
    // clones are — the lint gate reflects `packages/`, the code we publish.
    ignores: [
      'sources/**',
      'developer-hub/**',
      // Sibling git worktrees are ANOTHER checkout of this same repo on another
      // branch. Linting them double-lints our own source and drags in whatever
      // build/tooling artefacts that branch happens to have on disk — a docs-branch
      // `axe-temp.js` dump was failing the gate with 7300 errors from a bundled
      // vendor file nobody edits. Same category as the entries around it.
      '.worktrees/**',
      '.thoughts/**',
      '.playwright-mcp/**',
      '_bmad/**',
      '.agents/**',
      '.claude/**',
      '**/dist/**',
      '**/.next/**',
      // fumadocs-mdx writes apps/site/.source on every build. Generated, not ours.
      '**/.source/**',
      // Pagefind emits its search bundle and index here post-build. Also generated.
      '**/public/pagefind/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Public values are constants, not environment variables (CLAUDE.md).
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Public values are exported constants in @flare-kit/contracts. Only signing keys come from the environment, and only in apps.',
        },
      ],
    },
  },
  {
    // Apps and the self-hostable reference services legitimately read a signing
    // key and their runtime config (network/port/price, each defaulting to a
    // constant) from the environment at their edge — the 12-factor pattern. They
    // are deployable processes, not published packages.
    files: ['apps/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Evidence-gathering scripts run in Node directly and read a signing key
    // from disk. brand/build.mjs regenerates the identity files from the
    // vendored faces. Both are dev tooling, run by hand, never shipped in a
    // package.
    files: ['packages/*/scripts/**/*.mjs', 'brand/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', fetch: 'readonly' },
    },
    rules: { 'no-restricted-properties': 'off' },
  },
)
