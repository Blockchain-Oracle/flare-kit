import { smartAccountsFor } from '@flarekit-dev/contracts'
import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { scanInstructionHistory } from '../src/smart-accounts/watch.js'

/**
 * The `InstructionExecuted` backfill scan.
 *
 * The invariant under test is the one the M12 review gate caught elsewhere: an INCOMPLETE
 * scan must return `undefined`, never `[]`. An empty array is a claim about the chain —
 * "this account has done nothing in this window" — and returning it after a failed read
 * fabricates that claim while fabricating no data.
 */

const DEPLOYMENT = smartAccountsFor('coston2')
const ACCOUNT = '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb'

/** The reference for a real FXRP transfer, so the decoded action is a true one. */
const TRANSFER_REFERENCE =
  '0x0100000000000000000f4240dddf991858311597bfd3d125cb342a0d4b56ea0a'

function log(overrides: Record<string, unknown> = {}) {
  // `args` is pulled out of the spread deliberately: leaving it in would let the trailing
  // `...rest` replace the merged args wholesale, dropping personalAccount and
  // transactionId and making the scan skip the log for the wrong reason.
  const { args, ...rest } = overrides
  return {
    args: {
      personalAccount: ACCOUNT,
      transactionId: `0x${'ab'.repeat(32)}`,
      paymentReference: TRANSFER_REFERENCE,
      instructionId: 1n,
      ...(args as Record<string, unknown> | undefined),
    },
    blockNumber: 100n,
    transactionHash: `0x${'cd'.repeat(32)}`,
    ...rest,
  }
}

interface FakeOptions {
  readonly logs?: unknown[]
  readonly blockNumberThrows?: boolean
  readonly getLogsThrowsOnCall?: number
  readonly tip?: bigint
}

/** Every getLogs call, so the filter and the chunk ranges can be asserted rather than
 *  assumed. A fake that discards its arguments cannot catch a scan that drops the account
 *  filter or asks for a range the node would refuse. */
interface Recorded {
  readonly address: string
  readonly args: { personalAccount?: string } | undefined
  readonly fromBlock: bigint
  readonly toBlock: bigint
}

function fakeClient(options: FakeOptions = {}): { client: PublicClient; calls: Recorded[] } {
  const calls: Recorded[] = []
  return {
    calls,
    client: {
      async getBlockNumber() {
        if (options.blockNumberThrows) throw new Error('RPC refused getBlockNumber')
        return options.tip ?? 110n
      },
      async getLogs(request: Recorded) {
        calls.push(request)
        if (options.getLogsThrowsOnCall === calls.length) throw new Error('RPC refused getLogs')
        return calls.length === 1 ? (options.logs ?? []) : []
      },
    } as unknown as PublicClient,
  }
}

const scan = (
  fake: { client: PublicClient; calls: Recorded[] },
  extra: Record<string, unknown> = {},
) =>
  scanInstructionHistory({
    client: fake.client,
    deployment: DEPLOYMENT,
    personalAccount: ACCOUNT,
    fromBlock: 100n,
    ...extra,
  })

describe('a completed scan', () => {
  it('returns the dispatches it found, decoded', async () => {
    const found = await scan(fakeClient({ logs: [log()] }))
    expect(found).toHaveLength(1)
    expect(found?.[0]?.action).toBe('transfer')
    expect(found?.[0]?.instructionId).toBe(1)
    expect(found?.[0]?.blockNumber).toBe(100n)
  })

  it('returns an EMPTY ARRAY when the account genuinely did nothing', async () => {
    // This is the claim `undefined` must never be confused with: the reads succeeded and
    // the chain has none.
    const found = await scan(fakeClient({ logs: [] }))
    expect(found).toEqual([])
    expect(found).not.toBeUndefined()
  })

  it('keeps a dispatch whose reference the codec cannot parse', async () => {
    // A malformed reference is still a real dispatch that happened. Dropping the row would
    // silently shorten the account's history.
    const found = await scan(
      fakeClient({ logs: [log({ args: { paymentReference: '0xdeadbeef' } })] }),
    )
    expect(found).toHaveLength(1)
    expect(found?.[0]?.action).toBeUndefined()
  })

  it('never fabricates an instruction id, block or hash for a pending log', async () => {
    // `0` is a REAL built-in instruction (collateralReservation), not a null, so defaulting
    // to it would invent a dispatch that never happened.
    const found = await scan(
      fakeClient({
        logs: [log({ args: { instructionId: undefined }, blockNumber: null, transactionHash: null })],
      }),
    )
    expect(found?.[0]?.instructionId).toBeUndefined()
    expect(found?.[0]?.blockNumber).toBeUndefined()
    expect(found?.[0]?.transactionHash).toBeUndefined()
  })
})

describe('an incomplete scan is undefined, never an empty array', () => {
  it('when the chain tip cannot be read', async () => {
    expect(await scan(fakeClient({ blockNumberThrows: true }))).toBeUndefined()
  })

  it('when a chunk read fails partway through', async () => {
    // The first chunk succeeded and found nothing. Returning `[]` here would report a
    // partial history as the whole history.
    const found = await scan(fakeClient({ tip: 200n, getLogsThrowsOnCall: 2 }))
    expect(found).toBeUndefined()
  })

  it('when the scan would exceed its chunk budget', async () => {
    // A bound so a slow node degrades to `unavailable` rather than hanging — but a
    // truncated scan is not a completed one.
    const found = await scan(fakeClient({ tip: 10_000n }), { maxChunks: 2 })
    expect(found).toBeUndefined()
  })

  it('does not truncate silently when the budget is sufficient', async () => {
    const found = await scan(fakeClient({ tip: 149n, logs: [log()] }), { maxChunks: 2 })
    expect(found).toHaveLength(1)
  })
})

describe('what the scan actually asks the node for', () => {
  it('filters on the personal account, and on the controller', async () => {
    // Without asserting the filter, dropping `args: { personalAccount }` passes every test
    // in this file while returning EVERY account's dispatches for every account — one
    // user's history rendered as another's.
    const fake = fakeClient({ logs: [log()] })
    await scan(fake)
    expect(fake.calls[0]?.args?.personalAccount).toBe(ACCOUNT)
    expect(fake.calls[0]?.address).toBe(DEPLOYMENT.masterAccountController)
  })

  it('pages in ranges the node will actually serve', async () => {
    // Coston2 caps eth_getLogs at roughly 30 blocks. A chunk size of 250 satisfies every
    // other test here and is refused by the live node — the cap this file exists for.
    const fake = fakeClient({ tip: 149n })
    await scan(fake)
    expect(fake.calls.map((call) => [call.fromBlock, call.toBlock])).toEqual([
      [100n, 124n],
      [125n, 149n],
    ])
    for (const call of fake.calls) {
      expect(call.toBlock - call.fromBlock).toBeLessThan(30n)
    }
  })
})
