import { describe, expect, it } from 'vitest'
import {
  creditForTotal,
  totalForNetCredit,
} from '../src/smart-accounts/direct-mint-fees.js'

/**
 * The direct-minting fee arithmetic on the MEMO path.
 *
 * The vendored reference gets this wrong twice, so these tests pin the CONTRACT's model, not
 * the reference's:
 *
 *  mintingFee   = min(max(floor(total * feeBIPS / 10000), minimumFeeUBA), total)
 *  toController = total - mintingFee
 *  account gets = toController - memoExecutorFee
 *
 * The fee basis is the TOTAL received, not the net the user wants to land
 * (`DirectMintingFacet.sol:433`), and the AssetManager charges NO executor fee on the
 * smart-account branch — the only executor fee is the one in the memo's own bytes 2-9.
 */

/**
 * 1%, with a minimum FAR below the proportional fee at the amounts used here.
 *
 * The separation is deliberate and was found by mutation: an earlier fixture used
 * `minimumFeeUBA: 1_000n` against a 100_000 total, where 1% is *exactly* 1_000 — the two
 * branches coincided, so a mutant that computed the fee on the wrong basis produced the same
 * number and every test still passed. A fixture whose branches agree cannot tell them apart.
 */
const SETTINGS = { feeBIPS: 100n, minimumFeeUBA: 100n } // 1%, floor 100

describe('creditForTotal — what the account actually receives', () => {
  it('charges the proportional fee on the TOTAL, not on any reduced basis', () => {
    // 1% of 1_000_000 is exactly 10_000, and the 100 floor is nowhere near it — so this
    // number can only be produced by charging on the total. Charging on (total - fee), or on
    // the net the user wanted, yields 9_900 or 9_901 and fails here.
    const result = creditForTotal({ totalUBA: 1_000_000n, memoExecutorFeeUBA: 0n, ...SETTINGS })
    expect(result.mintingFeeUBA).toBe(10_000n)
    expect(result.creditedUBA).toBe(990_000n)
  })

  it('applies the minimum fee when the proportional one is smaller', () => {
    // 1% of 5_000 is 50, below the 100 floor, so the floor wins.
    const result = creditForTotal({ totalUBA: 5_000n, memoExecutorFeeUBA: 0n, ...SETTINGS })
    expect(result.mintingFeeUBA).toBe(100n)
    expect(result.creditedUBA).toBe(4_900n)
  })

  it('rounds the proportional fee DOWN, as SafePct.mulBips does', () => {
    // 1% of 1_000_099 is 10_000.99 -> 10_000. Rounding up over-charges every mint by a drop,
    // and the amount is chosen so the floor cannot mask the result.
    expect(
      creditForTotal({ totalUBA: 1_000_099n, memoExecutorFeeUBA: 0n, ...SETTINGS }).mintingFeeUBA,
    ).toBe(10_000n)
  })

  it('deducts the MEMO executor fee, and only that one', () => {
    // The AssetManager deducts no executor fee on this branch; the memo's own field is what
    // the controller pays out. Budgeting the AssetManager default as well double-counts.
    const result = creditForTotal({ totalUBA: 1_000_000n, memoExecutorFeeUBA: 500n, ...SETTINGS })
    expect(result.creditedUBA).toBe(989_500n)
  })

  it('reports a payment too small to cover the minimum fee as a TOTAL LOSS', () => {
    // Below the minimum, everything goes to the fee receiver, the memo never runs, and there
    // is no recovery path (`DirectMintingFacet.sol:150-157`).
    const result = creditForTotal({ totalUBA: 99n, memoExecutorFeeUBA: 0n, ...SETTINGS })
    expect(result.paymentTooSmall).toBe(true)
    expect(result.creditedUBA).toBe(0n)
  })

  it('reports a credit that cannot cover the memo executor fee', () => {
    // `require(_amount >= _executorFee)` reverts AFTER settlement, so the plan must see it.
    const result = creditForTotal({ totalUBA: 1_000_000n, memoExecutorFeeUBA: 999_999n, ...SETTINGS })
    expect(result.executorFeeUnaffordable).toBe(true)
  })
})

describe('totalForNetCredit — inverting the contract to land an exact amount', () => {
  it('lands exactly the requested net when the proportional fee applies', () => {
    // The property that matters: whatever this returns, feeding it back through
    // creditForTotal must credit the account at least the target. The reference's formula
    // (fee computed from the net) under-budgets and lands short.
    const target = 1_000_000n
    const total = totalForNetCredit({ netUBA: target, memoExecutorFeeUBA: 0n, ...SETTINGS })
    expect(creditForTotal({ totalUBA: total, memoExecutorFeeUBA: 0n, ...SETTINGS }).creditedUBA).toBeGreaterThanOrEqual(
      target,
    )
  })

  it('covers the memo executor fee on top of the net', () => {
    const target = 1_000_000n
    const fee = 5_000n
    const total = totalForNetCredit({ netUBA: target, memoExecutorFeeUBA: fee, ...SETTINGS })
    const result = creditForTotal({ totalUBA: total, memoExecutorFeeUBA: fee, ...SETTINGS })
    expect(result.creditedUBA).toBeGreaterThanOrEqual(target)
    expect(result.executorFeeUnaffordable).toBe(false)
  })

  it('lands the net when the MINIMUM fee branch is the one that applies', () => {
    // A small mint where the floor dominates. Inverting only the proportional formula would
    // under-budget here.
    const target = 2_000n
    const total = totalForNetCredit({ netUBA: target, memoExecutorFeeUBA: 0n, ...SETTINGS })
    expect(creditForTotal({ totalUBA: total, memoExecutorFeeUBA: 0n, ...SETTINGS }).creditedUBA).toBeGreaterThanOrEqual(
      target,
    )
  })

  it('never under-budgets across a range of targets', () => {
    // The reference's error is a systematic shortfall, so a range is the honest check.
    for (const target of [1_500n, 9_999n, 100_000n, 3_333_333n]) {
      for (const fee of [0n, 1n, 7_777n]) {
        const total = totalForNetCredit({ netUBA: target, memoExecutorFeeUBA: fee, ...SETTINGS })
        const credited = creditForTotal({ totalUBA: total, memoExecutorFeeUBA: fee, ...SETTINGS }).creditedUBA
        expect(credited, `target ${target} fee ${fee}`).toBeGreaterThanOrEqual(target)
      }
    }
  })
})
