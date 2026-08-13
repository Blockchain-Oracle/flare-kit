import { describe, expect, it } from 'vitest'
import { FLARE_NETWORKS, chainFor, explorerTxUrl, underlyingExplorerTxUrl } from '../src/chains.js'
import { fassetFor, registryFor } from '../src/addresses.js'

// R2: one address registry. No address is hardcoded anywhere else.
// CLAUDE.md: "Network is configuration. Testnet first, mainnet-capable, with no
// source rewrite to switch." And: "Never fake protocol reality."

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO = '0x0000000000000000000000000000000000000000'

describe('networks', () => {
  it('covers Coston2 as the testnet and Flare as the mainnet peer', () => {
    expect(chainFor(114).key).toBe('coston2')
    expect(chainFor(114).testnet).toBe(true)
    expect(chainFor(14).key).toBe('flare')
    expect(chainFor(14).testnet).toBe(false)
  })

  it('names an unsupported chain rather than falling back to a default', () => {
    expect(() => chainFor(1)).toThrow(/1/)
  })

  it('carries a real RPC and explorer for every network it claims to support', () => {
    for (const chain of Object.values(FLARE_NETWORKS)) {
      expect(chain.rpcUrl).toMatch(/^https:\/\//)
      expect(chain.explorerUrl).toMatch(/^https:\/\//)
      expect(chain.nativeCurrency.decimals).toBe(18)
    }
  })

  it('builds explorer links from the registry, not from a template in a component', () => {
    expect(explorerTxUrl(114, '0xabc')).toBe('https://coston2-explorer.flare.network/tx/0xabc')
    expect(underlyingExplorerTxUrl(114, 'E3FE')).toBe(
      'https://testnet.xrpl.org/transactions/E3FE',
    )
    expect(underlyingExplorerTxUrl(14, 'E3FE')).toBe('https://livenet.xrpl.org/transactions/E3FE')
  })

  it('pairs each Flare network with its own XRPL network, at six decimals', () => {
    expect(chainFor(114).underlying.testnet).toBe(true)
    expect(chainFor(14).underlying.testnet).toBe(false)
    for (const chain of Object.values(FLARE_NETWORKS)) {
      expect(chain.underlying.decimals).toBe(6)
      expect(chain.underlying.symbol).toBe('XRP')
    }
  })
})

describe('registry', () => {
  it('exposes the Coston2 protocol contracts as checksummed addresses', () => {
    const coston2 = registryFor(114)
    for (const address of [
      coston2.contractRegistry,
      coston2.assetManagerController,
      coston2.fdcHub,
      coston2.fdcVerification,
      coston2.relay,
    ]) {
      expect(address).toMatch(EVM_ADDRESS)
      expect(address).not.toBe(ZERO)
    }
  })

  it('carries the FDC service endpoints and the header their API key uses', () => {
    const services = registryFor(114).services
    expect(services.verifierBaseUrl).toMatch(/^https:\/\/fdc-verifiers-testnet\./)
    expect(services.dataAvailabilityBaseUrl).toMatch(/^https:\/\//)
    expect(services.apiKeyHeader).toBe('X-API-KEY')
  })
})

describe('fassets', () => {
  it('reports the symbol Coston2 actually deploys, which is not FXRP', () => {
    // The testnet asset is literally FTestXRP. Rendering it as "FXRP" would be
    // faking protocol reality, so the symbol comes from here and every surface
    // renders whatever this says.
    const asset = fassetFor(114, 'XRP')
    expect(asset.symbol).toBe('FTestXRP')
    expect(asset.underlyingSymbol).toBe('XRP')
    expect(asset.assetManager).toBe('0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA')
    expect(asset.token).toBe('0x0b6A3645c240605887a5532109323A3E12273dc7')
  })

  it('reports FXRP on Flare mainnet, from the same call shape', () => {
    // Mainnet-capable with no source rewrite: only the chain id changes.
    const asset = fassetFor(14, 'XRP')
    expect(asset.symbol).toBe('FXRP')
    expect(asset.assetManager).toBe('0x2a3Fe068cD92178554cabcf7c95ADf49B4B0B6A8')
  })

  it('states whether direct minting is actually deployed, per network', () => {
    // Verified against deployment/deploys/*.json in the FAssets repo:
    // DirectMintingFacet is deployed on coston2, flare and songbird — and is
    // absent from coston. A kit that offered direct mint on coston would be
    // offering an operation the chain cannot perform.
    expect(fassetFor(114, 'XRP').supportsDirectMinting).toBe(true)
    expect(fassetFor(14, 'XRP').supportsDirectMinting).toBe(true)
  })

  it('names an unknown underlying asset rather than returning a guess', () => {
    expect(() => fassetFor(114, 'DOGE')).toThrow(/DOGE/)
  })

  it('holds a core vault manager, because direct minting pays the core vault', () => {
    expect(fassetFor(114, 'XRP').coreVaultManager).toMatch(EVM_ADDRESS)
  })
})
