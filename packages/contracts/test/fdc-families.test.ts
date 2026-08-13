import { describe, expect, it } from 'vitest'
import {
  ATTESTATION_FAMILIES,
  ATTESTATION_TYPES,
  apiDocJsonUrl,
  attestationName,
  claimedStatus,
  familyFor,
  prepareRequestUrl,
  proofByRequestRoundUrl,
  registryFor,
  sourceFor,
} from '../src/index.js'

/**
 * The family table is a claim about a live system, so most of what is worth
 * asserting about it is internal consistency — the catalogue is what checks it
 * against the deployment at runtime, and `fdc-catalogue.test.ts` covers that
 * comparison. What is pinned here is everything that would silently produce a
 * wrong request: a group that does not match the source, a status that
 * overstates support, and the two route facts the vendored documentation gets
 * wrong.
 *
 * Derived from two live probes on 2026-08-04 that agreed exactly: each verifier
 * group's OpenAPI `paths`, and `getRequestFee` on both networks.
 */

const COSTON2 = 114

describe('the family table', () => {
  it('carries the nine live families and the one withdrawn one', () => {
    expect(ATTESTATION_FAMILIES).toHaveLength(10)
    const live = ATTESTATION_FAMILIES.filter((f) => !f.deprecationNote)
    expect(live).toHaveLength(9)
    expect(ATTESTATION_FAMILIES.filter((f) => f.deprecationNote).map((f) => f.name)).toEqual([
      'JsonApi',
    ])
  })

  it('ships builders for exactly the four families M3 declares', () => {
    // The other five are catalogued and marked planned. M3-R4: planned is never
    // rendered as supported, so the two sets must not drift.
    expect(ATTESTATION_FAMILIES.filter((f) => f.hasBuilder).map((f) => f.name).sort()).toEqual([
      'EVMTransaction',
      'Web2Json',
      'XRPPayment',
      'XRPPaymentNonexistence',
    ])
  })

  it('states what consumes every family’s proof, including when nothing does', () => {
    // "No deployed consumer" is a claim this project makes out loud. A blank
    // here would let a surface imply consumption exists.
    for (const family of ATTESTATION_FAMILIES) {
      expect(family.consumer.length, family.name).toBeGreaterThan(0)
    }
  })
})

describe('status', () => {
  it('never reports a family the deployment does not serve as supported', () => {
    // Web2Json is the live case: mainnet's verifier serves the route, but
    // mainnet's fee configuration reverts on Web2Json ‖ PublicWeb2, so no
    // request can be priced. Probed 2026-08-04.
    const web2Json = familyFor('Web2Json')
    expect(web2Json).toBeDefined()
    expect(web2Json?.hasBuilder).toBe(true)
    expect(claimedStatus(web2Json!, 'coston2')).toBe('supported')
    expect(claimedStatus(web2Json!, 'flare')).toBe('unavailable')
  })

  it('reports a withdrawn family as deprecated on every network', () => {
    const jsonApi = familyFor('JsonApi')!
    expect(claimedStatus(jsonApi, 'coston2')).toBe('deprecated')
    expect(claimedStatus(jsonApi, 'flare')).toBe('deprecated')
  })

  it('reports a served family with no builder as planned, never as supported', () => {
    const payment = familyFor('Payment')!
    expect(claimedStatus(payment, 'coston2')).toBe('planned')
  })
})

describe('verifier groups', () => {
  it('addresses Coston2 EVM attestations as flr/testFLR, never as eth', () => {
    // M3-AC3. The developer hub instructs /verifier/eth/ at
    // docs/fdc/guides/hardhat/02-evm-transaction.mdx:187. A real Coston2
    // transaction returns INVALID there and VALID on flr.
    const evm = familyFor('EVMTransaction')!
    const coston2 = evm.sources.coston2
    expect(coston2[0]?.group).toBe('flr')
    expect(coston2[0]?.sourceId).toBe('testFLR')
    expect(sourceFor(evm, 'coston2', 'coston2')).toBeUndefined()

    const url = prepareRequestUrl(
      registryFor(COSTON2).services.verifierBaseUrl,
      coston2[0]!.group,
      evm.name,
    )
    expect(url).toContain('/verifier/flr/EVMTransaction/prepareRequest')
    expect(url).not.toContain('/verifier/eth/')
  })

  it('uses btc_testnet4 on testnet, because /verifier/btc/ 404s there', () => {
    const payment = familyFor('Payment')!
    const groups = (net: 'coston2' | 'flare') => payment.sources[net].map((s) => s.group)
    expect(groups('coston2')).toContain('btc_testnet4')
    expect(groups('coston2')).not.toContain('btc')
    expect(groups('flare')).toContain('btc')
  })

  it('pairs every source id with a group that serves it on that network', () => {
    // A source id from the wrong network produces a request the fee
    // configuration reverts on, which reads as an outage rather than a bug.
    for (const family of ATTESTATION_FAMILIES) {
      for (const source of family.sources.coston2) {
        expect(source.sourceId, `${family.name} on coston2`).toMatch(/^(test[A-Z]|PublicWeb2)/)
      }
      for (const source of family.sources.flare) {
        expect(source.sourceId, `${family.name} on flare`).not.toMatch(/^test/)
      }
    }
  })
})

describe('urls', () => {
  it('builds the group and type into the prepare path, not just the host', () => {
    expect(prepareRequestUrl('https://v.example', 'xrp', 'XRPPayment')).toBe(
      'https://v.example/verifier/xrp/XRPPayment/prepareRequest',
    )
  })

  it('treats a base with a trailing slash as the same host', () => {
    // A doubled slash is a 404 that looks like an outage.
    expect(prepareRequestUrl('https://v.example/', 'web2', 'Web2Json')).toBe(
      prepareRequestUrl('https://v.example', 'web2', 'Web2Json'),
    )
    expect(proofByRequestRoundUrl('https://da.example/')).toBe(
      proofByRequestRoundUrl('https://da.example'),
    )
    expect(apiDocJsonUrl('https://v.example/', 'xrp')).toBe(apiDocJsonUrl('https://v.example', 'xrp'))
  })

  it('points the catalogue at each group’s own OpenAPI document', () => {
    expect(apiDocJsonUrl('https://v.example', 'btc_testnet4')).toBe(
      'https://v.example/verifier/btc_testnet4/api-doc-json',
    )
  })
})

describe('attestation type ids', () => {
  it('derives every id from the family table, so a name cannot drift', () => {
    for (const family of ATTESTATION_FAMILIES) {
      expect(ATTESTATION_TYPES[family.name]).toBe(attestationName(family.name))
    }
    expect(Object.keys(ATTESTATION_TYPES)).toHaveLength(ATTESTATION_FAMILIES.length)
  })

  it('keeps XRPPayment distinct from the chain-agnostic Payment type', () => {
    expect(ATTESTATION_TYPES.XRPPayment).not.toBe(ATTESTATION_TYPES.Payment)
  })
})
