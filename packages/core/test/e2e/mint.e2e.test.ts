import { describe, expect, it } from 'vitest'
import { createMockKit } from '../../src/mock.js'
import { createMemoryStore, decodeRecord, encodeRecord } from '../../src/storage.js'
import { isTerminal } from '../../src/states.js'
import type { DirectMintOperation } from '../../src/fassets/direct-mint.js'

/**
 * The acceptance criteria, driven end to end against the mock kit. This is what
 * `pnpm --filter @flarekit-dev/core test:e2e:mock` runs.
 *
 * Nothing here stubs the lifecycle: the mock supplies observed chain state and
 * the real state machine runs, so a pass means the shipped code behaves this
 * way, not that a test double does.
 */

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

describe('AC1 — with no wallet and no network, the full mint completes', () => {
  it('reaches succeeded, in well under a second of real time', () => {
    const started = Date.now()
    const kit = createMockKit({ seed: 'ac1' })
    const final = kit.runToCompletion(kit.start(INTENT))

    expect(final.state).toBe('succeeded')
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('reaches every state the operation timeline has to render', () => {
    const kit = createMockKit({ seed: 'ac1', scenario: 'executor-late' })
    const states = new Set(kit.trace(kit.start(INTENT)).map((r) => r.state))
    for (const required of [
      'submitted',
      'confirming',
      'awaiting_external',
      'action_required',
      'succeeded',
    ]) {
      expect(states).toContain(required)
    }
  })

  it('credits an exact amount, carrying its asset and full precision', () => {
    const kit = createMockKit({ seed: 'ac1' })
    const quote = kit.quote(INTENT)
    expect(quote.mintedEstimate.value).toBe(248_500_000n)
    expect(quote.mintedEstimate.asset).toBe('FMockXRP')
  })
})

describe('AC3 — a late executor reads as delayed, not failed', () => {
  const kit = () => createMockKit({ seed: 'ac3', scenario: 'executor-late' })

  it('states the awaited actor rather than reporting a failure', () => {
    const waiting = kit()
      .trace(kit().start(INTENT))
      .find((r) => r.awaiting?.actor === 'executor')

    expect(waiting).toBeDefined()
    expect(waiting?.state).toBe('awaiting_external')
    expect(waiting?.state).not.toBe('failed')
    expect(waiting?.awaiting?.reason).toMatch(/executor/i)
  })

  it('states when the wait ends, instead of an open-ended spinner', () => {
    const waiting = kit()
      .trace(kit().start(INTENT))
      .find((r) => r.awaiting?.actor === 'executor')
    expect(waiting?.awaiting?.availableAt).toBeGreaterThan(waiting?.awaiting?.since ?? 0)
  })

  it('offers no action that could send XRP twice, at any point', () => {
    for (const record of kit().trace(kit().start(INTENT))) {
      for (const action of record.recovery ?? []) {
        expect(action.movesNewValue).toBe(false)
      }
    }
  })
})

describe('AC4 — past allowed-at, recovery reuses the payment and proof', () => {
  it('offers exactly one action, and it reuses what already exists', () => {
    const kit = createMockKit({ seed: 'ac4', scenario: 'executor-late' })
    const acting = kit.trace(kit.start(INTENT)).find((r) => r.state === 'action_required')

    expect(acting?.recovery).toHaveLength(1)
    const action = acting?.recovery?.[0]
    expect(action?.id).toBe('execute-direct-minting')
    expect(action?.movesNewValue).toBe(false)
    expect(action?.effect).toMatch(/already/i)
  })

  it('is a no-op the second time, resolved from chain evidence', () => {
    // The contract reverts on a repeat execution, so core resolves it as
    // succeeded from observed state and submits nothing.
    const kit = createMockKit({ seed: 'ac4' })
    const settled = kit.runToCompletion(kit.start(INTENT))
    expect(settled.state).toBe('succeeded')

    const again = kit.reconcileAt(settled, 10_000_000)
    expect(again.state).toBe('succeeded')
    expect(again.recovery ?? []).toEqual([])
    expect(again.attempts).toEqual(settled.attempts)
  })
})

describe('AC5 — a reload mid-operation resumes with no lost evidence', () => {
  it('survives a full encode/decode round trip and keeps advancing', async () => {
    const kit = createMockKit({ seed: 'ac5', scenario: 'proof-slow' })
    const store = createMemoryStore()

    // Partway through: paid, confirmed on XRPL, waiting on the FDC.
    const midway = kit.reconcileAt(kit.start(INTENT), 20_000)
    expect(midway.state).toBe('awaiting_external')
    await store.put(midway)

    // The process restarts. Everything comes back from storage.
    const resumed = (await store.get(midway.id)) as DirectMintOperation
    expect(resumed).toBeDefined()
    expect(resumed.id).toBe(midway.id)
    expect(resumed.state).toBe(midway.state)
    expect(resumed.evidence).toEqual(midway.evidence)
    expect(resumed.quote).toEqual(midway.quote)

    // And it continues from there rather than starting over.
    const finished = kit.runToCompletion(resumed)
    expect(finished.state).toBe('succeeded')
    expect(finished.evidence.length).toBeGreaterThanOrEqual(midway.evidence.length)
  })

  it('keeps exact bigint amounts across the restart', () => {
    const kit = createMockKit({ seed: 'ac5' })
    const midway = kit.reconcileAt(kit.start(INTENT), 20_000)
    const revived = decodeRecord(encodeRecord(midway)) as DirectMintOperation
    expect(revived.quote?.input.value).toBe(250_000_000n)
    expect(typeof revived.quote?.input.value).toBe('bigint')
  })

  it('needs no Resume button: reconciling a restored record is the only step', async () => {
    const kit = createMockKit({ seed: 'ac5' })
    const store = createMemoryStore()
    await store.put(kit.reconcileAt(kit.start(INTENT), 1_000))

    const open = await store.list({ open: true })
    expect(open).toHaveLength(1)
    const resumed = kit.runToCompletion(open[0] as DirectMintOperation)
    expect(isTerminal(resumed.state)).toBe(true)
  })
})

describe('AC7 — a below-minimum mint cannot be started', () => {
  it('refuses, and says what the minimum is', () => {
    const kit = createMockKit({ seed: 'ac7' })
    expect(() => kit.start({ ...INTENT, amountXrp: '0.4' })).toThrow(/1\.500000 XRP/)
  })
})
