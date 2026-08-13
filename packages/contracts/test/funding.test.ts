import { describe, expect, it } from 'vitest'
import { FUNDING_SERVICE, fundingBaseUrl } from '../src/funding.js'
import { FLARE_NETWORKS } from '../src/chains.js'

// The funder-held faucet service is not built and not deployed. These pin the
// decisions that were made early — the hostname and the dev port — and the one
// rule that matters until it exists: nothing may present it as reachable.

describe('the address is fixed', () => {
  it('lives on its own host under the project domain', () => {
    expect(FUNDING_SERVICE.baseUrl).toBe('https://funding.flare-kit.xyz')
  })

  it('binds a port in development that nothing else in this repo uses', () => {
    // The gallery dev server holds 5183; Vite's own default is 5173.
    expect(FUNDING_SERVICE.localPort).toBe(8787)
    expect(FUNDING_SERVICE.localBaseUrl).toBe(`http://localhost:${FUNDING_SERVICE.localPort}`)
  })

  it('is offered on testnet only, because there is no faucet for real value', () => {
    expect([...FUNDING_SERVICE.networks]).toEqual(['coston2'])
    expect(FLARE_NETWORKS.coston2.testnet).toBe(true)
  })
})

describe('it is not deployed, and says so', () => {
  it('reports itself undeployed', () => {
    // Flip this when the service actually answers, deliberately — never as a
    // side effect of some other change.
    expect(FUNDING_SERVICE.deployed).toBe(false)
  })

  it('returns no URL to call while undeployed', () => {
    // `undefined` rather than the string, so "not deployed" is a case the
    // caller has to handle instead of a link that looks live and 404s.
    expect(fundingBaseUrl()).toBeUndefined()
  })

  it('still hands back the local URL, which a developer runs themselves', () => {
    expect(fundingBaseUrl({ local: true })).toBe('http://localhost:8787')
  })
})

describe('the XRPL faucet link is a different thing and still real', () => {
  it('points at the XRP Ledger faucet, not at our unbuilt service', () => {
    // These were nearly conflated. One is an external page that works today;
    // the other is a host that has never been pointed anywhere.
    const faucet = FLARE_NETWORKS.coston2.underlying.faucetUrl
    expect(faucet).toBe('https://xrpl.org/resources/dev-tools/xrp-faucets')
    expect(faucet).not.toContain('flare-kit.xyz')
  })

  it('is absent on mainnet, where no faucet exists', () => {
    expect(FLARE_NETWORKS.flare.underlying.faucetUrl).toBeUndefined()
  })
})
