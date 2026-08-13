import { describe, expect, it } from 'vitest'
import { OPERATION_STATES, isTerminal } from '../src/operation.js'
import { MOCK_SCENARIOS, createMockKit } from '../src/mock.js'

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

describe('the mock is explicit and offline', () => {
  // CLAUDE.md: mock mode is explicit, labelled, and never a fallback triggered
  // by a failure.
  it('labels itself, so no surface can present it as live', () => {
    expect(createMockKit().isMock).toBe(true)
    expect(createMockKit().label).toMatch(/mock/i)
  })

  it('needs no wallet, no key and no network', async () => {
    // If the mock ever reached the network this would throw.
    const realFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('the mock kit must never perform network I/O')
    }) as typeof fetch
    try {
      const kit = createMockKit()
      const op = kit.runToCompletion(kit.start(INTENT))
      expect(op.state).toBe('succeeded')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('names an FAsset symbol that is clearly not a real network’s', () => {
    // Better an obviously fake symbol than one a screenshot could pass off as
    // Coston2 or mainnet.
    expect(createMockKit().protocolState.fAssetSymbol).toMatch(/mock/i)
  })
})

describe('determinism', () => {
  it('produces identical operations for identical input', () => {
    const a = createMockKit({ seed: 'demo' }).start(INTENT)
    const b = createMockKit({ seed: 'demo' }).start(INTENT)
    expect(a.id).toBe(b.id)
    expect(a.createdAt).toBe(b.createdAt)
  })

  it('produces different ids for different seeds', () => {
    expect(createMockKit({ seed: 'a' }).start(INTENT).id).not.toBe(
      createMockKit({ seed: 'b' }).start(INTENT).id,
    )
  })

  it('gives every operation from one kit a distinct id', () => {
    const kit = createMockKit({ seed: 'demo' })
    expect(kit.start(INTENT).id).not.toBe(kit.start(INTENT).id)
  })
})

describe('AC1 — the whole mint completes in seconds against the mock', () => {
  it('reaches succeeded', () => {
    const kit = createMockKit()
    expect(kit.runToCompletion(kit.start(INTENT)).state).toBe('succeeded')
  })

  it('takes no real time, because the clock is simulated', () => {
    const started = Date.now()
    const kit = createMockKit()
    kit.runToCompletion(kit.start(INTENT))
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('passes through the real lifecycle rather than jumping to the end', () => {
    const kit = createMockKit()
    const seen = kit.trace(kit.start(INTENT)).map((r) => r.state)
    expect(seen).toContain('submitted')
    expect(seen).toContain('confirming')
    expect(seen).toContain('awaiting_external')
    expect(seen).toContain('action_required')
    expect(seen[seen.length - 1]).toBe('succeeded')
  })

  it('only ever reports canonical states', () => {
    const kit = createMockKit()
    for (const record of kit.trace(kit.start(INTENT))) {
      expect(OPERATION_STATES).toContain(record.state)
    }
  })

  it('accumulates evidence as it goes, never losing any', () => {
    const kit = createMockKit()
    const trace = kit.trace(kit.start(INTENT))
    for (let i = 1; i < trace.length; i += 1) {
      const before = trace[i - 1]?.evidence.length ?? 0
      expect(trace[i]?.evidence.length).toBeGreaterThanOrEqual(before)
    }
    expect(trace[trace.length - 1]?.evidence.some((e) => e.kind === 'xrpl_tx')).toBe(true)
  })
})

describe('configurable timings', () => {
  it('reaches the same outcome whatever the timings', () => {
    const slow = createMockKit({ timings: { xrplFinalityMs: 600_000, fdcProofMs: 900_000 } })
    expect(slow.runToCompletion(slow.start(INTENT)).state).toBe('succeeded')
  })

  it('lets a caller hold the operation at a chosen stage', () => {
    const kit = createMockKit({ timings: { xrplFinalityMs: 10_000 } })
    const paid = kit.pay(kit.start(INTENT))
    expect(kit.reconcileAt(paid, 1_000).state).toBe('confirming')
    expect(kit.reconcileAt(paid, 20_000).state).not.toBe('confirming')
  })
})

describe('scenarios reach the states the surfaces must render', () => {
  it('offers every scenario the required-state lists need', () => {
    expect([...MOCK_SCENARIOS]).toEqual([
      'happy',
      'large-delayed',
      'executor-late',
      'proof-slow',
      'protocol-unavailable',
    ])
  })

  it('large-delayed waits on Flare and states an allowed-at', () => {
    const kit = createMockKit({ scenario: 'large-delayed' })
    const record = kit.trace(kit.start(INTENT)).find((r) => r.awaiting?.actor === 'flare')
    expect(record?.state).toBe('awaiting_external')
    expect(record?.awaiting?.availableAt).toBeGreaterThan(0)
  })

  it('executor-late waits on the executor, then hands the user a safe action', () => {
    // AC3 then AC4: delayed rather than failed, then a retry that reuses the
    // payment and proof already made.
    const kit = createMockKit({ scenario: 'executor-late' })
    const trace = kit.trace(kit.start(INTENT))
    const waiting = trace.find((r) => r.awaiting?.actor === 'executor')
    expect(waiting?.state).toBe('awaiting_external')
    expect(waiting?.recovery ?? []).toEqual([])

    const acting = trace.find((r) => r.state === 'action_required')
    expect(acting?.recovery?.[0]?.id).toBe('execute-direct-minting')
    expect(acting?.recovery?.[0]?.movesNewValue).toBe(false)
  })

  it('protocol-unavailable names an operator, and never claims failure', () => {
    const kit = createMockKit({ scenario: 'protocol-unavailable' })
    const final = kit.runToCompletion(kit.start(INTENT))
    expect(final.state).not.toBe('failed')
    expect(final.awaiting?.actor).toBe('operator')
  })

  it('never reaches failed on any scenario, because none of them is a failure', () => {
    for (const scenario of MOCK_SCENARIOS) {
      const kit = createMockKit({ scenario })
      for (const record of kit.trace(kit.start(INTENT))) {
        expect(record.state).not.toBe('failed')
      }
    }
  })

  it('settles every scenario that can settle', () => {
    for (const scenario of ['happy', 'large-delayed', 'executor-late', 'proof-slow'] as const) {
      const kit = createMockKit({ scenario })
      expect(isTerminal(kit.runToCompletion(kit.start(INTENT)).state)).toBe(true)
    }
  })
})

describe('the below-minimum guard holds in the mock too', () => {
  it('refuses to start, with the same message a live kit gives (AC7)', () => {
    const kit = createMockKit()
    expect(() => kit.start({ ...INTENT, amountXrp: '0.4' })).toThrow(/mints nothing|minimum/i)
  })

  it('still quotes it, so the widget can explain why', () => {
    const quote = createMockKit().quote({ ...INTENT, amountXrp: '0.4' })
    expect(quote.canProceed).toBe(false)
    expect(quote.belowMinimum).toBe(true)
  })
})
