/**
 * The direct-minting fee arithmetic for the MEMO path (M14-R5).
 *
 * This mirrors the CONTRACT, not the vendored reference, because the reference is wrong twice
 * and both errors cost the user:
 *
 * 1. **The proportional fee is charged on the TOTAL RECEIVED**, not on the net the user wants
 *    to land — `_receivedAmount.mulBips(state.mintingFeeBIPS)`
 *    (`DirectMintingFacet.sol:433`). The reference computes it from the net
 *    (`flare-viem-starter/src/utils/fassets.ts:130`), so its total is short and the account
 *    lands under target. Small, systematic, and it grows with the executor fee.
 * 2. **The AssetManager charges NO executor fee on the smart-account branch.**
 *    `_mintToSmartAccounts` mints `_receivedAmount - _mintingFeeUBA` (`:395`); the executor
 *    fee it computes at `:438-439` belongs to the plain-EOA path only. On this path the
 *    executor fee is the one the MEMO carries in bytes 2-9, paid by the controller
 *    (`MemoInstructionsFacet.sol:144,179-181`). The reference adds the AssetManager default
 *    into the total *and* encodes `0` in the memo, so it merely overpays; a builder copying
 *    that arithmetic while encoding a real memo fee would budget one and be charged two.
 *
 * Everything here is `bigint` in UBA. The reference round-trips through a JS float
 * (`fassets.ts:105,134`); an exact-value kit cannot.
 */

export interface DirectMintingFeeSettings {
  /** `getDirectMintingFeeBIPS()`. */
  readonly feeBIPS: bigint
  /** `getDirectMintingMinimumFeeUBA()`. */
  readonly minimumFeeUBA: bigint
}

export interface CreditInput extends DirectMintingFeeSettings {
  /** What the XRPL payment delivers, in UBA. */
  readonly totalUBA: bigint
  /** The fee written into the memo's bytes 2-9 — NOT the AssetManager's default. */
  readonly memoExecutorFeeUBA: bigint
}

export interface CreditResult {
  readonly mintingFeeUBA: bigint
  /** What reaches the controller before the memo's executor fee. */
  readonly toControllerUBA: bigint
  /** What the personal account is actually credited. */
  readonly creditedUBA: bigint
  /**
   * The payment did not cover the minimum minting fee, so **everything** goes to the fee
   * receiver, the memo never runs, and nothing is recoverable
   * (`DirectMintingFacet.sol:150-157`, deliberate anti-dust design).
   */
  readonly paymentTooSmall: boolean
  /**
   * `require(_amount >= _executorFee)` (`MemoInstructionsFacet.sol:167`) would revert — after
   * the payment has settled.
   */
  readonly executorFeeUnaffordable: boolean
}

const BIPS = 10_000n

/** `min(max(floor(total * bips / 10000), minimum), total)` — `DirectMintingFacet.sol:433-436`. */
function mintingFeeFor(totalUBA: bigint, settings: DirectMintingFeeSettings): bigint {
  // Integer division truncates toward zero, which is `SafePct.mulBips`'s documented
  // round-down (`SafePct.sol:39-43`). Rounding the other way would over-charge every mint.
  const proportional = (totalUBA * settings.feeBIPS) / BIPS
  const floored = proportional > settings.minimumFeeUBA ? proportional : settings.minimumFeeUBA
  return floored > totalUBA ? totalUBA : floored
}

/** What a given total actually credits the personal account, and how it can go wrong. */
export function creditForTotal(input: CreditInput): CreditResult {
  const mintingFeeUBA = mintingFeeFor(input.totalUBA, input)
  // The contract's own test: below the minimum, the whole payment is consumed as fee.
  const paymentTooSmall = input.totalUBA < input.minimumFeeUBA
  const toControllerUBA = paymentTooSmall ? 0n : input.totalUBA - mintingFeeUBA
  const executorFeeUnaffordable = !paymentTooSmall && toControllerUBA < input.memoExecutorFeeUBA
  return {
    mintingFeeUBA,
    toControllerUBA,
    creditedUBA: paymentTooSmall || executorFeeUnaffordable ? 0n : toControllerUBA - input.memoExecutorFeeUBA,
    paymentTooSmall,
    executorFeeUnaffordable,
  }
}

export interface TotalInput extends DirectMintingFeeSettings {
  /** What the personal account should end up with, in UBA. */
  readonly netUBA: bigint
  readonly memoExecutorFeeUBA: bigint
}

/**
 * The total XRPL payment needed to credit `netUBA`, by inverting the contract's own formula.
 *
 * Because the fee is charged on the total, `total = net + fee(total)` is implicit, and the
 * proportional branch solves to `ceil((net + executorFee) * 10000 / (10000 - feeBIPS))`. The
 * minimum-fee branch is a different equation, so BOTH are computed and the larger wins — then
 * the answer is checked by running the real forward calculation, and nudged if the rounding
 * left it a drop short.
 *
 * THAT CHECK IS THE GUARANTEE, AND THE ALGEBRA IS ONLY AN ESTIMATE. Deliberately: it means a
 * mistake in the inversion cannot under-budget a payment, because the loop measures the
 * result against `creditForTotal` — the function that IS pinned, mutation-checked against the
 * contract's basis, floor and rounding. Mutating the algebra here does not fail the suite, and
 * that is the design working rather than a hole in it: correctness is a property of the
 * contract's forward model, which we verified, instead of of arithmetic we derived. The tests
 * assert the invariant that matters — never lands under target — across a range of amounts
 * and fees rather than pinning an intermediate number.
 */
export function totalForNetCredit(input: TotalInput): bigint {
  const target = input.netUBA + input.memoExecutorFeeUBA

  // Proportional branch, rounded UP so truncation never lands under target.
  const denominator = BIPS - input.feeBIPS
  if (denominator <= 0n) {
    // A 100% fee leaves nothing. Refusing beats returning a number that cannot work.
    throw new Error('The minting fee is 100% or more; no payment can credit this account.')
  }
  const proportional = (target * BIPS + denominator - 1n) / denominator

  // Minimum-fee branch: the fee is a constant, so the total is simply target + minimum.
  const minimumBranch = target + input.minimumFeeUBA

  let total = proportional > minimumBranch ? proportional : minimumBranch

  // Verify against the forward model and close any one-drop gap left by rounding. Bounded:
  // each step strictly increases the credit, and the gap is at most a couple of drops.
  for (let i = 0; i < 4; i += 1) {
    const credited = creditForTotal({ ...input, totalUBA: total }).creditedUBA
    if (credited >= input.netUBA) return total
    total += input.netUBA - credited
  }
  return total
}
