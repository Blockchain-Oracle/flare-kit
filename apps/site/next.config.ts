import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // The kit is consumed from workspace source until it is published, so its TSX
  // and CSS must go through this app's compiler. cdr-kit does not need this — it
  // consumes published tarballs via the `npm:` alias.
  // See .thoughts/decisions/2026-08-13-docs-site-framework.md (R-SITE-009).
  transpilePackages: ['@flarekit-dev/react-ui', '@flarekit-dev/react', '@flarekit-dev/core'],
}

const withMDX = createMDX()

export default withMDX(config)
