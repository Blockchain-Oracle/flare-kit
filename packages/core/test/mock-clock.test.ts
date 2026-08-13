import { describe, expect, it } from 'vitest'
import { createMockKit } from '../src/mock.js'

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

/**
 * `reconcile()` is the interface a React hook or an app calls on a timer. It
 * needs its own clock, because unlike `reconcileAt` there is no caller to
 * supply one. The mock maps real elapsed time onto simulated time so a
 * fifteen-minute mint plays out in seconds — which is what makes a docs
 * preview show the real waits rather than skipping them.
 */

describe('reconcile', () => {
  it('advances from a real clock, without the caller supplying a time', async () => {
    const kit = createMockKit({ seed: 'clock', speed: 100_000 })
    const op = kit.start(INTENT)
    const first = await kit.reconcile(op)
    // At 100_000x, the twelve-second XRPL finality is long past.
    expect(first.state).not.toBe('ready')
  })

  it('replays the whole mint in seconds at demo speed', async () => {
    const kit = createMockKit({ seed: 'clock', speed: 1_000_000 })
    let op = kit.start(INTENT)
    for (let i = 0; i < 8; i += 1) op = await kit.reconcile(op)
    expect(op.state).toBe('succeeded')
  })

  it('moves through the honest intermediate states, not straight to the end', async () => {
    const kit = createMockKit({ seed: 'clock', speed: 20_000 })
    const seen = new Set<string>()
    let op = kit.start(INTENT)
    for (let i = 0; i < 40; i += 1) {
      op = await kit.reconcile(op)
      seen.add(op.state)
      if (op.state === 'succeeded') break
    }
    expect(seen.has('succeeded')).toBe(true)
    expect(seen.size).toBeGreaterThan(1)
  })

  it('is safe to call after settlement', async () => {
    const kit = createMockKit({ seed: 'clock', speed: 1_000_000 })
    const settled = kit.runToCompletion(kit.start(INTENT))
    expect((await kit.reconcile(settled)).state).toBe('succeeded')
  })

  it('leaves the deterministic helpers untouched', () => {
    // reconcileAt and trace stay clock-free, so tests and docs never flake.
    const a = createMockKit({ seed: 'same' })
    const b = createMockKit({ seed: 'same' })
    expect(a.trace(a.start(INTENT)).map((r) => r.state)).toEqual(
      b.trace(b.start(INTENT)).map((r) => r.state),
    )
  })
})
