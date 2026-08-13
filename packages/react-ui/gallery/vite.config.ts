import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only. The gallery is never built for publication: `files` in
// package.json does not include it, and there is no build script for it.
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5183 },
  plugins: [react()],
})
