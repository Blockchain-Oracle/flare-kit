import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only. The gallery is never built for publication: `files` in
// package.json does not include it, and there is no build script for it.
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5183 },
  plugins: [react()],
  resolve: {
    alias: [
      // The sections import the package by name so the docs site can compile
      // them against dist. In gallery dev the name maps back to live source,
      // so editing src still hot-reloads without a build. Exact match only:
      // '@flare-kit/react-ui/styles.css' must keep resolving via exports.
      {
        find: /^@flare-kit\/react-ui$/,
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
})
