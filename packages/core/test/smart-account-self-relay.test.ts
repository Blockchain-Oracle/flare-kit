import { keccak256 } from 'viem'
import { describe, expect, it } from 'vitest'
import type { XrpPaymentProof } from '../src/fdc/families/xrp-payment.js'
import { bindProofToRelayer, planSelfRelay } from '../src/smart-accounts/self-relay.js'

/**
 * Self-relay (M14-R10).
 *
 * The reference flow sends the XRPL payment and then watches for an event, hoping somebody
 * else's relayer finalises it. Binding `proofOwner` to our own EOA and submitting ourselves
 * means we KNOW the outcome — and the price of that knowledge is that only that EOA can ever
 * submit, so a mismatch has to be caught before gas is spent rather than as `OnlyProofOwner`
 * with the XRP already settled.
 */

const RELAYER = '0xA4B05CdB545Fa7cA12BE9F866d64e8A843A31bD9'
const STRANGER = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'
const ASSET_MANAGER = '0x9a5C9DF4Fb0FdCf42b1cC2Ac2C6E1C1F0e8b5A21' as const
const TX = '0x3f8394997fd81d36c6da3b626b4ce6d1fa594911fe97c150977b14e5b6ab6c03'

/** A `0xFF` memo: 10-byte header then the ABI-encoded operation. Content is opaque here. */
const INLINE_MEMO = `0xff000000000000000000${'11'.repeat(448)}` as const

const WITH_DATA = `0x${'ab'.repeat(736)}` as const
/** `[0xFE][walletId][fee:uint64][hash:32]` — exactly 42 bytes, or `InvalidMemoData`. */
const WITH_DATA_MEMO = `0xfe00${'00'.repeat(8)}${keccak256(WITH_DATA).slice(2)}` as const

function proof(overrides: Partial<XrpPaymentProof['data']['responseBody']> = {}, proofOwner = RELAYER) {
  return {
    merkleProof: [`0x${'a1'.repeat(32)}`],
    data: {
      attestationType: `0x${'00'.repeat(32)}`,
      sourceId: `0x${'00'.repeat(32)}`,
      votingRound: 1415859n,
      lowestUsedTimestamp: 1785823590n,
      requestBody: { transactionId: TX, proofOwner },
      responseBody: {
        blockNumber: 19619920n,
        blockTimestamp: 1785823590n,
        sourceAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
        sourceAddressHash: `0x${'a9'.repeat(32)}`,
        receivingAddressHash: `0x${'cf'.repeat(32)}`,
        intendedReceivingAddressHash: `0x${'cf'.repeat(32)}`,
        spentAmount: 25000012n,
        intendedSpentAmount: 25000012n,
        receivedAmount: 25000000n,
        intendedReceivedAmount: 25000000n,
        hasMemoData: true,
        firstMemoData: INLINE_MEMO,
        hasDestinationTag: false,
        destinationTag: 0n,
        status: 0n,
        ...overrides,
      },
    },
  } as XrpPaymentProof
}

const plan = (input: Partial<Parameters<typeof planSelfRelay>[0]> = {}) =>
  planSelfRelay({
    assetManager: ASSET_MANAGER,
    proof: proof(),
    relayer: RELAYER,
    memo: INLINE_MEMO,
    valueWei: 0n,
    ...input,
  })

describe('binding the proof to our own EOA', () => {
  it('sets proofOwner to the relayer, lower-cased to match what the verifier attests', () => {
    const bound = bindProofToRelayer({ transactionId: TX, relayer: RELAYER })
    expect(bound.request.proofOwner).toBe(RELAYER.toLowerCase())
    expect(bound.request.transactionId).toBe(TX)
  })

  it('refuses the zero address, which would leave the proof relayable by anyone', () => {
    // `proofOwner == address(0)` passes `verifyProofOwnership`, so this is not the contract
    // refusing — it is the kit refusing to request a proof it cannot claim as its own.
    expect(() => bindProofToRelayer({ transactionId: TX, relayer: `0x${'00'.repeat(20)}` })).toThrow()
  })

  it('states that the binding is exclusive, because that is the cost of knowing', () => {
    const bound = bindProofToRelayer({ transactionId: TX, relayer: RELAYER })
    expect(bound.notes.join(' ')).toMatch(/only/i)
  })
})

describe('the pre-flight gate, before any gas is spent', () => {
  it('accepts a proof bound to the submitting account', () => {
    const result = plan()
    expect(result.ok).toBe(true)
  })

  it('refuses a proof bound to somebody else rather than reverting OnlyProofOwner', () => {
    const result = plan({ proof: proof({}, STRANGER) })
    expect(!result.ok && result.refusal.code).toBe('proof_owner_mismatch')
  })

  it('accepts an unbound proof but warns the mint is racing anyone who holds it', () => {
    const result = plan({ proof: proof({}, `0x${'00'.repeat(20)}`) })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.notes.join(' ')).toMatch(/anyone/i)
  })

  it('matches the relayer case-insensitively — an address is not a string', () => {
    const result = plan({ relayer: RELAYER.toLowerCase() })
    expect(result.ok).toBe(true)
  })
})

describe('the destination tag, refused a second time on submission', () => {
  it('refuses a tagged payment even though the contract would accept it', () => {
    // The AssetManager only forbids the core-vault donation tag. Any OTHER registered tag
    // redirects the mint to the tag holder and discards the memo entirely — so submitting
    // this proof spends the payment and runs no instruction.
    const result = plan({ proof: proof({ hasDestinationTag: true, destinationTag: 7n }) })
    expect(!result.ok && result.refusal.code).toBe('destination_tag')
  })

  it('names the tag, so the refusal can be acted on', () => {
    const result = plan({ proof: proof({ hasDestinationTag: true, destinationTag: 7n }) })
    expect(!result.ok && result.refusal.message).toMatch(/7/)
  })
})

describe('what the proof itself must show', () => {
  it('refuses a failed XRPL payment (status is not PAYMENT_SUCCESS)', () => {
    const result = plan({ proof: proof({ status: 1n }) })
    expect(!result.ok && result.refusal.code).toBe('payment_failed')
  })

  it('refuses a non-positive received amount', () => {
    const result = plan({ proof: proof({ receivedAmount: 0n }) })
    expect(!result.ok && result.refusal.code).toBe('amount_not_positive')
  })

  it('refuses a proof carrying no memo data at all', () => {
    const result = plan({ proof: proof({ hasMemoData: false, firstMemoData: '0x' }) })
    expect(!result.ok && result.refusal.code).toBe('no_memo_data')
  })

  it('refuses when the attested memo is not the memo we planned', () => {
    // Relaying this would execute somebody else's instruction under our own gas and
    // proof ownership.
    const result = plan({ proof: proof({ firstMemoData: `0xff${'22'.repeat(457)}` }) })
    expect(!result.ok && result.refusal.code).toBe('memo_mismatch')
  })
})

describe('which function to call is decided by the opcode, never by the caller', () => {
  it('sends a 0xFF memo through executeDirectMinting', () => {
    const result = plan()
    expect(result.ok && result.plan.call.functionName).toBe('executeDirectMinting')
    expect(result.ok && result.plan.call.args.length).toBe(1)
  })

  it('refuses executor data alongside a 0xFF memo, which the contract would ignore', () => {
    const result = plan({ executorData: WITH_DATA })
    expect(!result.ok && result.refusal.code).toBe('data_unexpected')
  })

  it('sends a 0xFE memo through executeDirectMintingWithData', () => {
    const result = plan({
      memo: WITH_DATA_MEMO,
      proof: proof({ firstMemoData: WITH_DATA_MEMO }),
      executorData: WITH_DATA,
    })
    expect(result.ok && result.plan.call.functionName).toBe('executeDirectMintingWithData')
    expect(result.ok && result.plan.call.args[1]).toBe(WITH_DATA)
  })

  it('refuses a 0xFE memo with no executor data to supply', () => {
    const result = plan({ memo: WITH_DATA_MEMO, proof: proof({ firstMemoData: WITH_DATA_MEMO }) })
    expect(!result.ok && result.refusal.code).toBe('data_missing')
  })

  it('refuses data whose hash does not match the memo commitment', () => {
    // `keccak256(_data)` is checked BEFORE the decode, so this reverts with a named error
    // rather than a panic — but it reverts after the payment has settled, so it is checked
    // here where the check is free.
    const result = plan({
      memo: WITH_DATA_MEMO,
      proof: proof({ firstMemoData: WITH_DATA_MEMO }),
      executorData: `0x${'cd'.repeat(736)}`,
    })
    expect(!result.ok && result.refusal.code).toBe('data_hash_mismatch')
  })
})

describe('the call it builds', () => {
  it('carries the value the batch needs, arriving as one lump', () => {
    const result = plan({ valueWei: 1_500_000_000_000_000n })
    expect(result.ok && result.plan.call.value).toBe(1_500_000_000_000_000n)
  })

  it('targets the AssetManager, because the kit never calls the controller on this path', () => {
    const result = plan()
    expect(result.ok && result.plan.call.address).toBe(ASSET_MANAGER)
  })

  it('says out loud that a mined receipt is not yet a mint', () => {
    const result = plan()
    expect(result.ok && result.plan.notes.join(' ')).toMatch(/mined|rate.?limit|delay/i)
  })
})
