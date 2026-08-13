import { describe, expect, it, vi } from 'vitest'
import { isObserved } from '../src/observation.js'
import { type FamilyRow, loadFamilyCatalogue } from '../src/fdc/catalogue.js'
import { SERVICES } from './fdc-fixtures.js'

/**
 * M3-R3 and M3-AC2. The constant table is a claim; the deployment is the fact.
 *
 * Agreement, disagreement and unreachability stay three answers. Collapsing the
 * last two is the specific bug this file exists to prevent: a flaky network
 * would render every family as unavailable, which is a negative fact about the
 * protocol invented out of an outage.
 */

const COSTON2 = 114

/** What each verifier group serves on Coston2, as measured 2026-08-04. */
const LIVE: Record<string, string[]> = {
  xrp: [
    'AddressValidity',
    'BalanceDecreasingTransaction',
    'ConfirmedBlockHeightExists',
    'Payment',
    'ReferencedPaymentNonexistence',
    'XRPPayment',
    'XRPPaymentNonexistence',
  ],
  btc_testnet4: [
    'AddressValidity',
    'BalanceDecreasingTransaction',
    'ConfirmedBlockHeightExists',
    'Payment',
    'ReferencedPaymentNonexistence',
  ],
  doge: [
    'AddressValidity',
    'BalanceDecreasingTransaction',
    'ConfirmedBlockHeightExists',
    'Payment',
    'ReferencedPaymentNonexistence',
  ],
  eth: ['EVMTransaction'],
  sgb: ['EVMTransaction'],
  flr: ['EVMTransaction'],
  web2: ['Web2Json'],
}

const groupOf = (url: string) => /\/verifier\/([^/]+)\/api-doc-json/.exec(url)?.[1] ?? ''

/** A verifier whose OpenAPI is `served`, or which fails when `served` is absent. */
function fakeVerifier(served: Record<string, string[] | undefined>) {
  return vi.fn(async (url: string) => {
    const types = served[groupOf(url)]
    if (!types) return { ok: false, status: 503, json: async () => ({}) } as Response
    return {
      ok: true,
      status: 200,
      json: async () => ({
        paths: Object.fromEntries(
          types.map((type) => [`/verifier/${groupOf(url)}/${type}/prepareRequest`, {}]),
        ),
      }),
    } as Response
  }) as unknown as typeof globalThis.fetch
}

const load = (fetchImpl: typeof globalThis.fetch) =>
  loadFamilyCatalogue({ services: SERVICES, chainId: COSTON2, fetch: fetchImpl, now: 1_780_000_000 })

const rowFor = (rows: readonly FamilyRow[], name: string) =>
  rows.find((row) => row.family.name === name)!

describe('when the verifier agrees with the table', () => {
  it('reports all nine live families, with JsonApi deprecated and no others', async () => {
    // M3-AC1.
    const observation = await load(fakeVerifier(LIVE))
    expect(isObserved(observation)).toBe(true)
    if (!isObserved(observation)) return
    const rows = observation.value

    expect(rows).toHaveLength(10)
    expect(rows.every((row) => row.agreement === 'agrees')).toBe(true)
    expect(rowFor(rows, 'JsonApi').status).toBe('deprecated')

    const supported = rows.filter((r) => r.status === 'supported').map((r) => r.family.name).sort()
    expect(supported).toEqual([
      'EVMTransaction',
      'Web2Json',
      'XRPPayment',
      'XRPPaymentNonexistence',
    ])
    expect(rows.filter((r) => r.status === 'planned')).toHaveLength(5)
  })

  it('carries the provenance of the answer, not just the answer', async () => {
    // M3-R12: every M3 value that reaches a surface travels as an Observation.
    const observation = await load(fakeVerifier(LIVE))
    expect(observation.source).toMatchObject({
      class: 'provider',
      provider: SERVICES.verifierBaseUrl,
      chainId: COSTON2,
    })
    expect(observation.observedAt).toBe(1_780_000_000)
  })
})

describe('when the table claims more than the verifier serves', () => {
  it('names the specific family and does not let the table win', async () => {
    // M3-AC2. Web2Json disappears from the deployment; the table still lists it.
    const observation = await load(fakeVerifier({ ...LIVE, web2: [] }))
    if (!isObserved(observation)) throw new Error('expected an observation')
    const row = rowFor(observation.value, 'Web2Json')

    expect(row.agreement).toBe('table_claims_more')
    expect(row.claimed).toBe('supported')
    expect(row.status).toBe('unavailable')
    expect(row.note).toContain('Web2Json')
    expect(row.note).toContain('web2')
  })

  it('leaves every other family untouched by one family’s disagreement', async () => {
    const observation = await load(fakeVerifier({ ...LIVE, web2: [] }))
    if (!isObserved(observation)) throw new Error('expected an observation')
    const others = observation.value.filter((row) => row.family.name !== 'Web2Json')
    expect(others.every((row) => row.agreement === 'agrees')).toBe(true)
  })
})

describe('when the verifier serves more than the table claims', () => {
  it('reports the family as planned and says the table is out of date', async () => {
    // A family we ship no builder for appearing on a group we do not list. It
    // exists — so it is planned, never invented as supported.
    const observation = await load(fakeVerifier({ ...LIVE, doge: [...LIVE.doge!, 'Web2Json'] }))
    if (!isObserved(observation)) throw new Error('expected an observation')
    const row = rowFor(observation.value, 'Web2Json')

    expect(row.agreement).toBe('verifier_serves_more')
    expect(row.status).toBe('planned')
    expect(row.servedBy).toContain('doge')
    expect(row.note).toContain('out of date')
  })
})

describe('when a verifier group cannot be reached', () => {
  it('says unreachable rather than reporting the family as unavailable', async () => {
    // The distinction the whole comparison turns on. "We could not ask" is not
    // "the protocol does not support it".
    const observation = await load(fakeVerifier({ ...LIVE, web2: undefined }))
    if (!isObserved(observation)) throw new Error('expected an observation')
    const row = rowFor(observation.value, 'Web2Json')

    expect(row.agreement).toBe('unreachable')
    expect(row.status).not.toBe('unavailable')
    expect(row.status).toBe(row.claimed)
    expect(row.note).toContain('has not been checked')
  })

  it('reports the whole catalogue unavailable when no group answers at all', async () => {
    // Not an empty list of families, and not the built-in table presented as
    // fact: an unavailable observation carrying why.
    const observation = await load(fakeVerifier({}))
    expect(isObserved(observation)).toBe(false)
    if (isObserved(observation)) return
    expect(observation.reason).toContain('No verifier group')
    expect(observation.source.provider).toBe(SERVICES.verifierBaseUrl)
  })

  it('reports unavailable when the transport throws, not just when it 503s', async () => {
    const throwing = vi.fn().mockRejectedValue(new Error('ENOTFOUND'))
    const observation = await load(throwing as unknown as typeof globalThis.fetch)
    expect(isObserved(observation)).toBe(false)
  })
})
