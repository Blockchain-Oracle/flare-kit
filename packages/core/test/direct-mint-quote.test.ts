import { describe, expect, it } from 'vitest'
import { formatExact } from '../src/amounts.js'
import { quoteDirectMint } from '../src/fassets/direct-mint-quote.js'
import type { DirectMintProtocolState } from '../src/fassets/direct-mint-quote.js'

const NOW = 1_780_000_000_000

// Coston2 shapes: the FAsset is FTestXRP, and XRP is six-decimal.
const STATE: DirectMintProtocolState = {
  fAssetSymbol: 'FTestXRP',
  fAssetDecimals: 6,
  xrplDestination: 'rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV',
  feeSettings: {
    mintingFeeBIPS: 20n,
    minimumMintingFeeUBA: 1_000_000n,
    executorFeeUBA: 500_000n,
  },
  largeMintingThresholdUBA: 1_000_000_000n, // 1000 XRP
  largeMintingDelaySeconds: 3_600n,
  othersCanExecuteAfterSeconds: 600n,
  mintingPaused: false,
  emergencyPaused: false,
}

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

describe('quoteDirectMint', () => {
  it('states every exact value the payer commits to', () => {
    const quote = quoteDirectMint(STATE, INTENT, NOW)
    expect(formatExact(quote.input)).toBe('250.000000 XRP')
    expect(formatExact(quote.mintingFee)).toBe('1.000000 FTestXRP')
    expect(formatExact(quote.executorFee)).toBe('0.500000 FTestXRP')
    expect(formatExact(quote.mintedEstimate)).toBe('248.500000 FTestXRP')
  })

  it('renders the symbol the chain deploys, not the one we wish it used', () => {
    // Coston2 deploys FTestXRP. Calling it FXRP would be faking protocol reality.
    expect(quoteDirectMint(STATE, INTENT, NOW).fAssetSymbol).toBe('FTestXRP')
    const mainnet = { ...STATE, fAssetSymbol: 'FXRP' }
    expect(quoteDirectMint(mainnet, INTENT, NOW).fAssetSymbol).toBe('FXRP')
  })

  it('never lets the parts drift from the amount paid', () => {
    const q = quoteDirectMint(STATE, INTENT, NOW)
    expect(q.mintedEstimate.value + q.mintingFee.value + q.executorFee.value).toBe(q.input.value)
  })

  it('names the core vault as the XRPL destination', () => {
    expect(quoteDirectMint(STATE, INTENT, NOW).xrplDestination).toBe(STATE.xrplDestination)
  })

  it('is a frozen snapshot, so approved terms cannot be rewritten', () => {
    // R-OP-005: quotes are immutable; re-quoting creates a revision.
    expect(Object.isFrozen(quoteDirectMint(STATE, INTENT, NOW))).toBe(true)
  })

  it('expires, so stale terms are never silently signed', () => {
    const quote = quoteDirectMint(STATE, INTENT, NOW)
    expect(quote.expiresAt).toBeGreaterThan(NOW)
    expect(quote.quotedAt).toBe(NOW)
  })
})

describe('AC7 — a below-minimum amount can never be sent', () => {
  // The protocol converts a below-minimum payment entirely into fee and mints
  // nothing. The loss is total and unrecoverable, so this is a hard block.
  const tiny = { ...INTENT, amountXrp: '0.4' }

  it('refuses to proceed', () => {
    const quote = quoteDirectMint(STATE, tiny, NOW)
    expect(quote.canProceed).toBe(false)
    expect(quote.belowMinimum).toBe(true)
  })

  it('states the exact minimum rather than a vague "too small"', () => {
    const quote = quoteDirectMint(STATE, tiny, NOW)
    expect(formatExact(quote.minimumPayment)).toBe('1.500000 XRP')
    expect(quote.blockedReason).toMatch(/1\.500000 XRP/)
  })

  it('says plainly that the whole payment would be lost', () => {
    expect(quoteDirectMint(STATE, tiny, NOW).blockedReason).toMatch(/nothing|lost|entire/i)
  })

  it('blocks anything under the minimum fee plus the executor fee', () => {
    // Below fee+executor the payer receives zero, which is not a mint.
    expect(quoteDirectMint(STATE, { ...INTENT, amountXrp: '1.4' }, NOW).canProceed).toBe(false)
    expect(quoteDirectMint(STATE, { ...INTENT, amountXrp: '1.5' }, NOW).canProceed).toBe(true)
  })

  it('still reports the fee breakdown, so the widget can show why', () => {
    const quote = quoteDirectMint(STATE, tiny, NOW)
    expect(formatExact(quote.mintedEstimate)).toBe('0.000000 FTestXRP')
    expect(formatExact(quote.mintingFee)).toBe('0.400000 FTestXRP')
  })
})

describe('availability', () => {
  it('refuses while minting is paused, naming the reason', () => {
    const quote = quoteDirectMint({ ...STATE, mintingPaused: true }, INTENT, NOW)
    expect(quote.canProceed).toBe(false)
    expect(quote.blockedReason).toMatch(/paused/i)
  })

  it('refuses under an emergency pause', () => {
    const quote = quoteDirectMint({ ...STATE, emergencyPaused: true }, INTENT, NOW)
    expect(quote.canProceed).toBe(false)
    expect(quote.blockedReason).toMatch(/paused/i)
  })

  it('proceeds when nothing blocks it', () => {
    expect(quoteDirectMint(STATE, INTENT, NOW).canProceed).toBe(true)
    expect(quoteDirectMint(STATE, INTENT, NOW).blockedReason).toBeUndefined()
  })
})

describe('expected duration', () => {
  it('states the ordinary wait as a range, never a single number', () => {
    // DESIGN.md: long waits state stage, expected range, awaited actor, action.
    const { expectedDuration } = quoteDirectMint(STATE, INTENT, NOW)
    expect(expectedDuration.minMs).toBeGreaterThan(0)
    expect(expectedDuration.maxMs).toBeGreaterThan(expectedDuration.minMs)
  })

  it('warns up front when the amount will trigger the large-minting delay', () => {
    // 1000 XRP hits the threshold, so this mint is delayed by an hour before it
    // can execute. Saying so at quote time is the difference between a designed
    // wait and a mint that appears to hang.
    const large = quoteDirectMint(STATE, { ...INTENT, amountXrp: '1000' }, NOW)
    expect(large.willBeDelayed).toBe(true)
    expect(large.expectedDuration.maxMs).toBeGreaterThanOrEqual(3_600_000)
    expect(large.canProceed).toBe(true)
  })

  it('does not claim a delay for an ordinary amount', () => {
    expect(quoteDirectMint(STATE, INTENT, NOW).willBeDelayed).toBe(false)
  })
})

describe('input validation', () => {
  it('rejects precision XRP cannot hold rather than rounding it away', () => {
    expect(() => quoteDirectMint(STATE, { ...INTENT, amountXrp: '0.0000001' }, NOW)).toThrow(
      /precision/i,
    )
  })

  it('rejects a malformed recipient before any payment can be built', () => {
    expect(() => quoteDirectMint(STATE, { ...INTENT, recipient: '0x123' }, NOW)).toThrow()
  })
})
