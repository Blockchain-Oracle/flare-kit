import { describe, expect, it, vi } from 'vitest'
import { evidence } from '../src/evidence.js'
import { readDirectMintChainState } from '../src/fassets/read-chain-state.js'
import type { DirectMintOperation } from '../src/fassets/direct-mint.js'

/**
 * The live producer of `DirectMintChainState` — the input the whole recovery
 * matrix reasons about. Until this existed, `planRecovery` was reachable only
 * from the mock.
 *
 * Every branch here answers one question honestly, and the hardest one is
 * "has this already been executed?" A third party may execute at any time, and
 * the contract offers no getter — only a revert.
 */

const TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'
const NOW = 1_780_000_000_000

function operation(items: Parameters<typeof evidence>[0][] = []): DirectMintOperation {
  return {
    schemaVersion: 1,
    id: 'op_test',
    capability: 'fassets.directMint',
    network: 114,
    intent: {},
    quoteHistory: [],
    state: 'submitted',
    steps: [],
    evidence: items.map(evidence),
    attempts: [],
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as DirectMintOperation
}

const paid = () =>
  operation([{ kind: 'xrpl_tx', label: 'XRPL payment', value: TX, observedAt: NOW }])

/**
 * Paid, and the attestation request recorded. A proof can only be looked up by
 * (requestBytes, votingRoundId), so an operation that never recorded its
 * request has nothing to fetch — which is why `paid()` alone finds no proof.
 */
const requested = () =>
  operation([
    { kind: 'xrpl_tx', label: 'XRPL payment', value: TX, observedAt: NOW },
    { kind: 'fdc_request', label: 'FDC request', value: '0xdead', observedAt: NOW },
    { kind: 'fdc_round', label: 'FDC round', value: '1415484', observedAt: NOW },
  ])

/** A viem-shaped reader. `directMintingDelayState` returns [state, allowedAt, startedAt]. */
function reader(overrides: Record<string, unknown> = {}) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      const answers: Record<string, unknown> = {
        directMintingDelayState: [0, 0n, 0n],
        mintingPaused: false,
        emergencyPaused: false,
        getDirectMintingOthersCanExecuteAfterSeconds: 7_200n,
        ...overrides,
      }
      if (functionName in answers) return answers[functionName]
      throw new Error(`unexpected read: ${functionName}`)
    }),
    simulateContract: vi.fn(async () => ({ request: {} })),
  }
}

const xrplFinal = {
  getTransaction: vi.fn(async () => ({
    found: true,
    validated: true,
    succeeded: true,
    ledgerIndex: 100,
  })),
  getCurrentLedgerIndex: vi.fn(async () => 110),
  getAccountInfo: vi.fn(),
}

const noProof = {
  prepareRequest: vi.fn(async () => '0xdead'),
  retrieveProof: vi.fn(async () => {
    throw Object.assign(new Error('not yet'), { code: 'FDC_PROOF_NOT_AVAILABLE' })
  }),
}

const base = { chainId: 114, now: NOW }

describe('before a payment exists', () => {
  it('reports nothing final and no proof, without calling the chain', async () => {
    const client = reader()
    const state = await readDirectMintChainState({
      ...base,
      client,
      xrpl: xrplFinal,
      fdc: noProof,
      operation: operation(),
    })
    expect(state.xrplTxId).toBe('')
    expect(state.xrplFinal).toBe(false)
    expect(state.alreadySettled).toBe(false)
  })
})

describe('XRPL finality', () => {
  it('requires three confirmations, not merely validation', async () => {
    const xrpl = {
      ...xrplFinal,
      getTransaction: vi.fn(async () => ({
        found: true, validated: true, succeeded: true, ledgerIndex: 100,
      })),
      getCurrentLedgerIndex: vi.fn(async () => 102),
    }
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl, fdc: noProof, operation: paid(),
    })
    expect(state.xrplFinal).toBe(false)
  })

  it('is final at three confirmations', async () => {
    const xrpl = {
      ...xrplFinal,
      getCurrentLedgerIndex: vi.fn(async () => 103),
    }
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl, fdc: noProof, operation: paid(),
    })
    expect(state.xrplFinal).toBe(true)
  })

  it('is not final when the payment did not apply', async () => {
    const xrpl = {
      ...xrplFinal,
      getTransaction: vi.fn(async () => ({
        found: true, validated: true, succeeded: false, resultCode: 'tecUNFUNDED_PAYMENT',
        ledgerIndex: 100,
      })),
    }
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl, fdc: noProof, operation: paid(),
    })
    expect(state.xrplFinal).toBe(false)
  })
})

describe('the protocol delay', () => {
  it('reads NotDelayed as the default', async () => {
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.delayState).toBe('NotDelayed')
    expect(state.allowedAt).toBeUndefined()
  })

  it('reads Delayed with its allowed-at, in milliseconds', async () => {
    // The contract reports seconds; the operation record works in milliseconds.
    const client = reader({ directMintingDelayState: [1, 1_780_003_600n, 1_780_000_000n] })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.delayState).toBe('Delayed')
    expect(state.allowedAt).toBe(1_780_003_600_000)
  })

  it('reads Released', async () => {
    const client = reader({ directMintingDelayState: [2, 1_779_000_000n, 1_779_000_000n] })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.delayState).toBe('Released')
  })
})

describe('availability', () => {
  it('reports a paused manager as unavailable rather than as user error', async () => {
    const client = reader({ mintingPaused: true })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.unavailableReason).toMatch(/paused/i)
  })

  it('reports an emergency pause', async () => {
    const client = reader({ emergencyPaused: true })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.unavailableReason).toMatch(/paused/i)
  })

  it('is clear when nothing blocks', async () => {
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl: xrplFinal, fdc: noProof, operation: paid(),
    })
    expect(state.unavailableReason).toBeUndefined()
  })
})

describe('already settled — the question with no getter', () => {
  const withProof = {
    prepareRequest: vi.fn(async () => '0xdead'),
    retrieveProof: vi.fn(async () => ({
      merkleProof: ['0xaaa'],
      data: {
        attestationType: '0x11', sourceId: '0x22', votingRound: 1n, lowestUsedTimestamp: 2n,
        requestBody: { transactionId: `0x${TX}`, proofOwner: '0xabc' },
        responseBody: {
          blockNumber: 1n, blockTimestamp: 2n, sourceAddress: 'r1', sourceAddressHash: '0x1',
          receivingAddressHash: '0x2', intendedReceivingAddressHash: '0x2', spentAmount: 1n,
          intendedSpentAmount: 1n, receivedAmount: 1n, intendedReceivedAmount: 1n,
          hasMemoData: true, firstMemoData: '0x00', hasDestinationTag: false,
          destinationTag: 0n, status: 0n,
        },
      },
    })),
  }

  it('finds the proof available once the round has published it', async () => {
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl: xrplFinal, fdc: withProof, operation: requested(),
    })
    expect(state.proofAvailable).toBe(true)
    expect(state.alreadySettled).toBe(false)
  })

  it('detects an already-executed mint from the revert, not from a guess', async () => {
    // Simulating is the only way to learn this: the contract exposes no getter,
    // and a third party may execute at any moment.
    const client = reader()
    client.simulateContract = vi.fn(async () => {
      throw new Error('reverted with PaymentAlreadyConfirmed()')
    })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: withProof, operation: requested(),
    })
    expect(state.alreadySettled).toBe(true)
  })

  it('does not treat an unrelated revert as settled', async () => {
    const client = reader()
    client.simulateContract = vi.fn(async () => {
      throw new Error('reverted with InvalidExecutor()')
    })
    const state = await readDirectMintChainState({
      ...base, client, xrpl: xrplFinal, fdc: withProof, operation: requested(),
    })
    expect(state.alreadySettled).toBe(false)
  })

  it('does not claim settled when there is no proof to simulate with', async () => {
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl: xrplFinal, fdc: noProof, operation: requested(),
    })
    expect(state.proofAvailable).toBe(false)
    expect(state.alreadySettled).toBe(false)
  })
})

describe('it never invents a failure', () => {
  it('survives an unreachable XRPL endpoint by reporting not-final', async () => {
    const xrpl = {
      ...xrplFinal,
      getTransaction: vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    }
    const state = await readDirectMintChainState({
      ...base, client: reader(), xrpl, fdc: noProof, operation: paid(),
    })
    // A reading we could not take is not a failed payment.
    expect(state.xrplFinal).toBe(false)
    expect(state.alreadySettled).toBe(false)
  })
})
