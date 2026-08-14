import { FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { describe, expect, it } from 'vitest'
import { publicClientFor } from '../lib/kit'

/**
 * Network is configuration. Every value the client is built from comes from
 * `@flarekit-dev/contracts`, so switching network rewrites no source and no
 * chain id or RPC URL is ever literal in this app.
 */
describe('publicClientFor', () => {
  it('builds each network from the registry, never from a literal', () => {
    for (const key of ['coston2', 'flare'] as const) {
      const chain = FLARE_NETWORKS[key]
      const client = publicClientFor(key)
      expect(client.chain?.id).toBe(chain.id)
      expect(client.chain?.name).toBe(chain.name)
      expect(client.chain?.rpcUrls.default.http[0]).toBe(chain.rpcUrl)
    }
  })

  it('gives the two networks different clients, so switching cannot alias', () => {
    expect(publicClientFor('coston2').chain?.id).not.toBe(publicClientFor('flare').chain?.id)
  })
})
