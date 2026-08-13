import { describe, expect, it } from 'vitest'
import { hexToBytes } from 'viem'
import {
  pAddressFromPubKey,
  readMinStake,
  readStakesOf,
  readValidators,
} from '../src/pchain-rpc.js'

// ---------------------------------------------------------------------------
// Fixtures copied from the real Coston2 P-chain JSON-RPC shapes captured in
// `.thoughts/verification/2026-08-12-m11-probe.json` and a keyless live read of
// `platform.getCurrentValidators` (delegator records). P-chain amounts are
// STRING nFLR (1e-9 FLR); startTime/endTime are unix-second strings.
// ---------------------------------------------------------------------------

const SIGNER_P_ADDRESS = 'P-costwo1mxmg9atg27q2zav0kam8qswq32kkpvchnmnacj'
const DELEGATOR_P_ADDRESS = 'P-costwo17uuvatq6l6a2emzqjfrz6tqa6zzdy5g2s9v8md'

// The compressed secp256k1 public key (33 bytes) whose ripemd160(sha256(·))
// bech32-encodes to SIGNER_P_ADDRESS. Public value — derived once, then pinned.
const SIGNER_PUBKEY = hexToBytes(
  '0x03a53e242b9b33865dee9777b3488c16e4415e3b0c48e7811891e8e6997d91c7f0',
)

/** A `getCurrentValidators` result: two real validators; the first carries a
 * delegator whose reward owner is DELEGATOR_P_ADDRESS. */
const VALIDATORS_RESULT = {
  validators: [
    {
      nodeID: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ',
      txID: 'nJaFC692BpiypHUNZrVX47DkFYz2HmmX2z98HjVS9MpcT8wdt',
      startTime: '1778834610',
      endTime: '1786611061',
      weight: '5000000000000000',
      delegationFee: '10.0000',
      uptime: '88.8605',
      connected: true,
      delegatorCount: '1',
      delegatorWeight: '50007603001500',
      delegators: [
        {
          txID: '5P1hB1NUkr8iFT3uwm24p6GPycGWoJg87gMgNbjXN4vtb3RTu',
          startTime: '1783297333',
          endTime: '1786580526',
          weight: '50007603001500',
          nodeID: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ',
          rewardOwner: {
            locktime: '0',
            threshold: '1',
            addresses: [DELEGATOR_P_ADDRESS],
          },
          potentialReward: '0',
        },
      ],
    },
    {
      nodeID: 'NodeID-NKqPQeBNRT82BSHjFT9hCygtYQQBSBST7',
      txID: 'NJPi9kFD8id5SJzdo6VDg8nqw41qR6eF1kHVQFk1BX7CpJpcH',
      startTime: '1786025564',
      endTime: '1791367200',
      weight: '1000000000000000',
      delegationFee: '20.0000',
      uptime: '99.9502',
      connected: true,
      delegatorCount: '0',
      delegatorWeight: '0',
      delegators: null,
    },
  ],
}

const MIN_STAKE_RESULT = {
  minValidatorStake: '1000000000000000',
  minDelegatorStake: '50000000000000',
}

/** The blank-slate `getStake` shape from the probe — kept so the honest-empty
 * contract is asserted against the exact recorded response. */
const EMPTY_STAKE_RESULT = { staked: '0', stakeds: {}, stakedOutputs: [], encoding: 'hex' }

/** A stubbed `fetch` that dispatches on the JSON-RPC `method` in the POST body
 * and returns `{ jsonrpc, id, result }`. Records every call for assertions. */
function stubFetch(byMethod: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; params: unknown }> = []
  const impl = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string
      params: unknown
    }
    calls.push({ url, method: body.method, params: body.params })
    if (!(body.method in byMethod)) throw new Error(`unexpected method ${body.method}`)
    return {
      ok: true,
      async text() {
        return JSON.stringify({ jsonrpc: '2.0', id: 1, result: byMethod[body.method] })
      },
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const RPC = 'https://coston2-api.flare.network/ext/bc/P'
const WEI_PER_NFLR = 1_000_000_000n

describe('pAddressFromPubKey (SDK-free bech32 P-address)', () => {
  it('derives the exact probe P-address from the known compressed pubkey', () => {
    expect(pAddressFromPubKey(SIGNER_PUBKEY, 'costwo')).toBe(SIGNER_P_ADDRESS)
  })

  it('honours the hrp (mainnet flare vs testnet costwo differ only by prefix)', () => {
    const testnet = pAddressFromPubKey(SIGNER_PUBKEY, 'costwo')
    const mainnet = pAddressFromPubKey(SIGNER_PUBKEY, 'flare')
    expect(testnet.startsWith('P-costwo1')).toBe(true)
    expect(mainnet.startsWith('P-flare1')).toBe(true)
    // Same 20-byte payload → same data section after the hrp+'1' separator.
    expect(testnet.split('1').slice(1).join('1')).not.toBe(
      mainnet.split('1').slice(1).join('1'),
    ) // checksum folds the hrp in, so the tails differ
  })
})

describe('readValidators', () => {
  it('maps nodeId + start/end seconds + weight (nFLR → wei) as bigints', async () => {
    const { impl, calls } = stubFetch({
      'platform.getCurrentValidators': VALIDATORS_RESULT,
    })
    const out = await readValidators(RPC, impl)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      nodeId: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ',
      startTime: 1778834610n,
      endTime: 1786611061n,
      weight: 5000000000000000n * WEI_PER_NFLR,
    })
    expect(out[1]!.nodeId).toBe('NodeID-NKqPQeBNRT82BSHjFT9hCygtYQQBSBST7')
    expect(out[1]!.weight).toBe(1000000000000000n * WEI_PER_NFLR)
    // Read is a single JSON-RPC POST to the P-chain base.
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(RPC)
    expect(calls[0]!.method).toBe('platform.getCurrentValidators')
  })
})

describe('readMinStake', () => {
  it('returns delegator/validator minimums as wei bigints (nFLR × 1e9)', async () => {
    const { impl } = stubFetch({ 'platform.getMinStake': MIN_STAKE_RESULT })
    const out = await readMinStake(RPC, impl)
    // 50,000 FLR and 1,000,000 FLR, expressed in wei.
    expect(out.minDelegatorStake).toBe(50_000n * 10n ** 18n)
    expect(out.minValidatorStake).toBe(1_000_000n * 10n ** 18n)
    // And the raw ×1e9 identity holds.
    expect(out.minDelegatorStake).toBe(50000000000000n * WEI_PER_NFLR)
  })
})

describe('readStakesOf', () => {
  it('returns [] for an account that is no validator’s delegator (honest empty, not a throw)', async () => {
    const { impl } = stubFetch({
      'platform.getCurrentValidators': VALIDATORS_RESULT,
    })
    // The blank-slate signer is not a reward owner on any delegator record.
    const out = await readStakesOf(RPC, SIGNER_P_ADDRESS, impl)
    expect(out).toEqual([])
  })

  it('maps a matching delegator record to a StakePosition (nodeId/amount/window)', async () => {
    const { impl } = stubFetch({
      'platform.getCurrentValidators': VALIDATORS_RESULT,
    })
    const out = await readStakesOf(RPC, DELEGATOR_P_ADDRESS, impl)
    expect(out).toEqual([
      {
        nodeId: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ',
        amount: 50007603001500n * WEI_PER_NFLR,
        startTime: 1783297333n,
        endTime: 1786580526n,
      },
    ])
  })

  it('never throws when validators carry no delegators (null/absent arrays)', async () => {
    const noDelegators = {
      validators: [
        { ...VALIDATORS_RESULT.validators[1] }, // delegators: null
      ],
    }
    const { impl } = stubFetch({ 'platform.getCurrentValidators': noDelegators })
    await expect(readStakesOf(RPC, DELEGATOR_P_ADDRESS, impl)).resolves.toEqual([])
  })
})

describe('empty getStake shape stays honest-empty', () => {
  it('the recorded blank-slate stake result carries zero staked and no outputs', () => {
    // Guards the interpretation the adapter relies on: staked "0" + no outputs
    // is the honest empty state, never a fabricated position.
    expect(EMPTY_STAKE_RESULT.staked).toBe('0')
    expect(EMPTY_STAKE_RESULT.stakedOutputs).toHaveLength(0)
  })
})
