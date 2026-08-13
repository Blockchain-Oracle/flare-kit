import { describe, expect, it } from 'vitest'
import { buildActivity, exportActivity } from '../src/activity.js'
import {
  createAccountContext,
  parseReadOnlyIdentity,
  supplyReadOnly,
  walletConnected,
} from '../src/account.js'
import { bindContext } from '../src/account-binding.js'
import { createMemoryStore, encodeRecord } from '../src/storage.js'
import type { OperationRecord } from '../src/operation.js'

// M2-R8 / R-WALLET-004: "No seed phrase or private key is logged, persisted or
// transported. A test asserts the storage codec and every export path reject
// them, extending the guard already in storage.ts."

const SEED = 'sprout badge lunar copper timber fabric ordeal shrine velvet pigeon anchor gossip'
const PRIVATE_KEY = '0x4c0883a69102937d6231471b5dbb6204fe512961708279e5aeb0f1c1e3ca8f2f'

function record(intent: unknown): OperationRecord {
  return {
    schemaVersion: 1,
    id: 'op_1',
    capability: 'fassets.direct-mint',
    network: 114,
    intent,
    quoteHistory: [],
    state: 'draft',
    steps: [],
    evidence: [],
    attempts: [],
    createdAt: 1_000,
    updatedAt: 1_000,
  }
}

const SECRET_SHAPES: readonly [string, unknown][] = [
  ['seed', { seed: SEED }],
  ['mnemonic', { mnemonic: SEED }],
  ['privateKey', { privateKey: PRIVATE_KEY }],
  ['private_key', { private_key: PRIVATE_KEY }],
  ['signingKey', { signingKey: PRIVATE_KEY }],
  ['passphrase', { passphrase: 'correct horse battery staple' }],
  ['apiKey', { apiKey: 'sk-live-not-a-real-key' }],
  ['nested', { recipient: '0xA4b0', wallet: { secret: SEED } }],
  ['inside an array', { signers: [{ address: '0xA4b0' }, { seed: SEED }] }],
  // Compound names. An anchored pattern matched only the exact word, so every
  // one of these — all plausible things for a caller to write — was persisted
  // and exported in full. Found by review, not by the nine shapes above.
  ['seedPhrase', { seedPhrase: SEED }],
  ['walletSeed', { walletSeed: SEED }],
  ['mnemonicPhrase', { mnemonicPhrase: SEED }],
  ['privateKeyHex', { privateKeyHex: PRIVATE_KEY }],
  ['xrplSeed', { xrplSeed: SEED }],
  ['userPassword', { userPassword: 'hunter2' }],
  ['keystoreJson', { keystoreJson: '{"crypto":{}}' }],
]

describe('the durable store rejects every secret shape', () => {
  for (const [name, intent] of SECRET_SHAPES) {
    it(`refuses to persist ${name}`, async () => {
      const store = createMemoryStore()
      await expect(store.put(record(intent))).rejects.toThrow(/SECRET|secret|never carry/)
    })
  }

  it('stores an intent that carries no secret', async () => {
    const store = createMemoryStore()
    await store.put(record({ amountXrp: '25.000000', recipient: '0xA4b0' }))
    expect((await store.get('op_1'))?.id).toBe('op_1')
  })

  it('names the path so the caller can find the field', async () => {
    const store = createMemoryStore()
    await expect(store.put(record({ wallet: { secret: SEED } }))).rejects.toThrow(
      /intent\.wallet\.secret/,
    )
  })
})

describe('the activity export rejects every secret shape', () => {
  for (const [name, intent] of SECRET_SHAPES) {
    it(`refuses to export ${name}`, () => {
      const feed = buildActivity({ records: [record(intent)], at: 2_000 })
      expect(() => exportActivity(feed)).toThrow(/SECRET|secret|never carry/)
    })
  }

  it('exports an operation that carries no secret', () => {
    const feed = buildActivity({ records: [record({ recipient: '0xA4b0' })], at: 2_000 })
    expect(exportActivity(feed)).toContain('0xA4b0')
  })

  it('refuses the whole export when any one entry is tainted', () => {
    // A partial export would be worse than none: it would look complete.
    const feed = buildActivity({
      records: [record({ recipient: '0xA4b0' }), record({ seed: SEED })],
      at: 2_000,
    })
    expect(() => exportActivity(feed)).toThrow()
  })
})

describe('an identity never holds a key', () => {
  const COSTON2 = { name: 'Coston2', chainId: 114 } as const
  const ADDRESS = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

  it('has no field a key could be assigned to', () => {
    const identity = walletConnected('evm', ADDRESS, COSTON2)
    expect(Object.keys(identity).join(' ')).not.toMatch(/key|secret|seed|mnemonic|passphrase/i)
  })

  it('a binding records only the address, never anything that can sign', () => {
    const binding = bindContext(
      createAccountContext({ evm: supplyReadOnly('evm', ADDRESS, COSTON2) }),
      1_000,
    )
    expect(JSON.stringify(binding)).not.toContain(PRIVATE_KEY)
    expect(Object.keys(binding.evm ?? {}).join(' ')).not.toMatch(/key|secret|seed/i)
  })

  it('refuses a seed phrase pasted into the read-only address field', () => {
    // The likeliest way a secret reaches this kit at all is a person pasting
    // the wrong thing. It must not become an address, and it must not persist.
    const parsed = parseReadOnlyIdentity('xrpl', SEED, { name: 'XRPL Testnet' })
    expect(parsed.status).toBe('invalid-identity')
    expect(parsed.address).toBeUndefined()
    expect(JSON.stringify(parsed)).not.toContain(SEED)
  })

  it('refuses a private key pasted into the read-only address field', () => {
    const parsed = parseReadOnlyIdentity('evm', PRIVATE_KEY, COSTON2)
    expect(parsed.status).toBe('invalid-identity')
    expect(JSON.stringify(parsed)).not.toContain(PRIVATE_KEY)
  })
})

describe('the record codec', () => {
  it('leaves the guard to the store rather than duplicating it', async () => {
    // encodeRecord is reachable directly and deliberately does not re-check:
    // the store is the one boundary. This pins that the boundary still holds
    // for the same input the codec would happily serialize.
    expect(encodeRecord(record({ seed: SEED }))).toContain(SEED)
    await expect(createMemoryStore().put(record({ seed: SEED }))).rejects.toThrow()
  })
})
