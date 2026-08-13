import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  // React and the hooks package are peers. Bundling @flarekit-dev/react would give
  // the widgets a second React context instance, and they would never see the
  // host's provider.
  external: ['react', 'react-dom', '@flarekit-dev/react'],
})
