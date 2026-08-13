import { describe, expect, it } from 'vitest'
import { computeDirectMintFees, isBelowMinimum } from '../src/fassets/fees.js'

/**
 * Mirrors `DirectMintingFacet._computeFees` exactly:
 *
 *   relativeFeeUBA  = receivedAmount * mintingFeeBIPS / 10000
 *   minimumFeeUBA   = minimumMintingFeeUBA
 *   paymentTooSmall = receivedAmount < minimumFeeUBA
 *   mintingFeeUBA   = min(max(relative, minimum), receivedAmount)
 *   executorFeeUBA  = min(executorFeeUBA, receivedAmount - mintingFeeUBA)
 *   mintedAmountUBA = receivedAmount - mintingFeeUBA - executorFeeUBA
 *
 * Verified in .thoughts/research/2026-08-04-direct-minting-execution.md
 */

// Representative Coston2-shaped settings, in UBA (XRP drops).
const SETTINGS = {
  mintingFeeBIPS: 20n, // 0.20%
  minimumMintingFeeUBA: 1_000_000n, // 1 XRP
  executorFeeUBA: 500_000n, // 0.5 XRP
}

describe('computeDirectMintFees', () => {
  it('takes the relative fee when it exceeds the minimum', () => {
    // 250 XRP * 0.20% = 0.5 XRP, which is below the 1 XRP minimum, so scale up.
    const fees = computeDirectMintFees(1_000_000_000n, SETTINGS) // 1000 XRP
    expect(fees.mintingFeeUBA).toBe(2_000_000n) // 1000 * 0.002 = 2 XRP
    expect(fees.executorFeeUBA).toBe(500_000n)
    expect(fees.mintedAmountUBA).toBe(1_000_000_000n - 2_000_000n - 500_000n)
    expect(fees.belowMinimum).toBe(false)
  })

  it('floors to the minimum fee when the relative fee is smaller', () => {
    // 250 XRP * 0.20% = 0.5 XRP < 1 XRP minimum.
    const fees = computeDirectMintFees(250_000_000n, SETTINGS)
    expect(fees.mintingFeeUBA).toBe(1_000_000n)
    expect(fees.executorFeeUBA).toBe(500_000n)
    expect(fees.mintedAmountUBA).toBe(248_500_000n)
    expect(fees.belowMinimum).toBe(false)
  })

  it('never lets the three parts drift from the amount actually received', () => {
    for (const received of [1_500_001n, 250_000_000n, 3_333_333n, 10_000_000_000n]) {
      const f = computeDirectMintFees(received, SETTINGS)
      expect(f.mintingFeeUBA + f.executorFeeUBA + f.mintedAmountUBA).toBe(received)
    }
  })

  it('squeezes the executor fee rather than overdrawing the payment', () => {
    // Just above the minimum: 1.2 XRP. Fee takes 1 XRP, leaving 0.2 for an
    // executor that wants 0.5 — the contract clamps rather than underflowing.
    const fees = computeDirectMintFees(1_200_000n, SETTINGS)
    expect(fees.mintingFeeUBA).toBe(1_000_000n)
    expect(fees.executorFeeUBA).toBe(200_000n)
    expect(fees.mintedAmountUBA).toBe(0n)
    expect(fees.belowMinimum).toBe(false)
  })

  it('handles a zero executor fee', () => {
    const fees = computeDirectMintFees(250_000_000n, { ...SETTINGS, executorFeeUBA: 0n })
    expect(fees.executorFeeUBA).toBe(0n)
    expect(fees.mintedAmountUBA).toBe(249_000_000n)
  })
})

describe('the below-minimum case (AC7)', () => {
  // This is the most dangerous outcome in the product. When the payment is
  // under the minimum fee, the contract clamps the fee to the WHOLE payment,
  // mints all of it to the fee receiver, and mints nothing to the payer.
  // There is no refund and no recovery.
  it('consumes the entire payment and mints nothing to the payer', () => {
    const fees = computeDirectMintFees(400_000n, SETTINGS) // 0.4 XRP, under 1 XRP
    expect(fees.belowMinimum).toBe(true)
    expect(fees.mintingFeeUBA).toBe(400_000n) // the whole payment
    expect(fees.executorFeeUBA).toBe(0n)
    expect(fees.mintedAmountUBA).toBe(0n)
  })

  it('is flagged for any amount strictly below the minimum', () => {
    expect(isBelowMinimum(999_999n, SETTINGS)).toBe(true)
    expect(isBelowMinimum(0n, SETTINGS)).toBe(true)
  })

  it('is not flagged at exactly the minimum', () => {
    // The contract's test is `receivedAmount < minimumFeeUBA`, strictly.
    expect(isBelowMinimum(1_000_000n, SETTINGS)).toBe(false)
    const fees = computeDirectMintFees(1_000_000n, SETTINGS)
    expect(fees.belowMinimum).toBe(false)
    expect(fees.mintingFeeUBA).toBe(1_000_000n)
    expect(fees.mintedAmountUBA).toBe(0n)
  })

  it('reports the shortfall so a widget can state the exact minimum', () => {
    const fees = computeDirectMintFees(400_000n, SETTINGS)
    expect(fees.minimumUBA).toBe(1_000_000n)
  })
})
