import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@flarekit-dev/react-ui', '@flarekit-dev/react', '@flarekit-dev/core'],
}

export default config
