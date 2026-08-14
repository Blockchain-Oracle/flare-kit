import { smartAccountsFor } from '@flare-kit/contracts'
import { describe, expect, it } from 'vitest'
import type { PersonalAccountState } from '../src/smart-accounts/personal-account.js'
import { planMemoInstruction } from '../src/smart-accounts/memo-plan.js'

/**
 * The memo plan gate.
 *
 * On this flow EVERY revert lands after the XRPL payment has settled — the dispatch is
 * unguarded, so an opcode revert unwinds the mint while the payment stays gone
 * (`MemoInstructionsFacet.sol:82-99`). So each refusal here is a payment a user would
 * otherwise have lost, and the tests are written as that question.
 */

const VERIFIED = { ...smartAccountsFor('coston2'), smartAccountsVerified: true }
const UNVERIFIED = { ...smartAccountsFor('flare'), smartAccountsVerified: false }

const ACCOUNT: PersonalAccountState = {
  xrplOwner: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
  address: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
  deployed: true,
  nonce: 4n,
  pinnedExecutor: '0x0000000000000000000000000000000000000000',
  nativeBalance: 0n,
  fassetBalance: 0n,
}

const FEES = { feeBIPS: 100n, minimumFeeUBA: 100n, assetManagerExecutorFeeUBA: 1_000n }
const TARGET = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'
const call = (value = 0n) => ({ target: TARGET, value, data: '0x12345678' as const })

const plan = (over: Partial<Parameters<typeof planMemoInstruction>[0]> = {}) =>
  planMemoInstruction({
    deployment: VERIFIED,
    personalAccount: ACCOUNT,
    fees: FEES,
    intent: { calls: [call()], netUBA: 1_000_000n, nonce: 4n },
    replayed: false,
    ...over,
  })

describe('the plan carries the whole chain before an irreversible payment', () => {
  it('produces a memo, a total and the value the relay must attach', () => {
    const result = plan()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.memo.startsWith('0x')).toBe(true)
    expect(result.plan.totalUBA).toBeGreaterThan(1_000_000n)
    expect(result.plan.attachValueWei).toBe(0n)
  })

  it('picks 0xFE when the batch will not fit a 0xFF memo', () => {
    // Three calls exceed the ledger's 1024-byte ceiling inline, and 0xFE is 42 bytes
    // whatever the batch size. The plan MEASURES rather than consulting a size table.
    const result = plan({ intent: { calls: [call(), call(), call()], netUBA: 1_000_000n, nonce: 4n } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.opcode).toBe(0xfe)
    expect((result.plan.memo.length - 2) / 2).toBe(42)
    // 0xFE commits to a hash, so the executor must be handed the bytes themselves.
    expect(result.plan.executorData).toBeDefined()
  })

  it('uses 0xFF inline when the batch fits, so no executor data is needed', () => {
    const result = plan()
    expect(result.ok && result.plan.opcode).toBe(0xff)
    expect(result.ok && result.plan.executorData).toBeUndefined()
  })
})

describe('refusals — each one is a payment that would have been lost', () => {
  it('refuses an unverified network before anything else', () => {
    const result = plan({ deployment: UNVERIFIED })
    expect(!result.ok && result.refusal.code).toBe('unverified')
  })

  it('refuses ANY destination tag, with no override', () => {
    // Tag 0 is claimable — `nextAvailableTag` initialises to zero and tags are reservable
    // permissionlessly. A tagged payment redirects the mint to the tag owner AND discards
    // the memo entirely. A wallet defaulting the tag to 0 pays a stranger.
    for (const destinationTag of [0, 1, 12345]) {
      const result = plan({ destinationTag })
      expect(!result.ok && result.refusal.code, `tag ${destinationTag}`).toBe('destination_tag')
    }
  })

  it('refuses a nonce that is not the account’s current one', () => {
    // Two payments built from one nonce read: the first to execute wins and the second
    // reverts InvalidNonce with its XRP already spent.
    const result = plan({ intent: { calls: [call()], netUBA: 1_000_000n, nonce: 3n } })
    expect(!result.ok && result.refusal.code).toBe('nonce_mismatch')
  })

  it('refuses when the account’s nonce could not be read, rather than guessing', () => {
    const result = plan({ personalAccount: { ...ACCOUNT, nonce: undefined } })
    expect(!result.ok && result.refusal.code).toBe('nonce_unreadable')
  })

  it('makes the total-loss burn STRUCTURALLY unreachable, rather than refusing it', () => {
    // The burn happens when a payment lands under the minimum minting fee: everything goes to
    // the fee receiver, nothing is minted, the memo never runs, and there is no recovery.
    //
    // On the NET framing the plan computes the total itself, so it always clears the minimum
    // — even for an absurdly small net. That is a stronger protection than a refusal, and
    // this test pins it as a property.
    //
    // The refusal is no longer merely defensive: the payer framing (`totalUBA`) reaches it,
    // and the two tests below exercise it. Both framings ship because they answer different
    // questions — "credit me this much" cannot express "this is the payment I am signing",
    // and AC7 is about the second.
    const result = plan({ intent: { calls: [call()], netUBA: 1n, nonce: 4n } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.totalUBA).toBeGreaterThan(FEES.minimumFeeUBA)
    expect(result.plan.creditedUBA).toBeGreaterThanOrEqual(1n)
  })

  it('refuses a payer-named total below the minimum minting fee (AC7)', () => {
    // The payer's own framing: "this is the payment I am about to sign." Below the minimum
    // the protocol converts ALL of it into fee and mints nothing to them — the loss is total
    // and no recovery opcode reaches it, so this is a hard block rather than a warning.
    const result = plan({ intent: { calls: [call()], totalUBA: FEES.minimumFeeUBA - 1n, nonce: 4n } })
    expect(!result.ok && result.refusal.code).toBe('payment_too_small')
  })

  it('states the exact minimum in the refusal, so it can be acted on', () => {
    const result = plan({ intent: { calls: [call()], totalUBA: 1n, nonce: 4n } })
    expect(!result.ok && result.refusal.message).toContain(String(FEES.minimumFeeUBA))
  })

  it('uses a payer-named total exactly as given, never nudged up to clear the minimum', () => {
    // Raising it silently would spend more of their money than they said AND erase the one
    // condition the check exists to catch.
    const total = FEES.minimumFeeUBA * 10_000n
    const result = plan({ intent: { calls: [call()], totalUBA: total, nonce: 4n } })
    expect(result.ok && result.plan.totalUBA).toBe(total)
  })

  it('refuses a memo executor fee above the AssetManager’s own default', () => {
    // The memo's fee field is an open bounty: the only on-chain check is
    // `_amount >= _executorFee`, so a memo may legally assign the entire mint to whoever
    // relays. Clamped against the deployment's own number.
    const result = plan({ intent: { calls: [call()], netUBA: 1_000_000n, nonce: 4n, executorFeeUBA: 50_000n } })
    expect(!result.ok && result.refusal.code).toBe('executor_fee_excessive')
  })

  it('refuses a payment whose transaction id has already dispatched', () => {
    const result = plan({ replayed: true })
    expect(!result.ok && result.refusal.code).toBe('already_dispatched')
  })

  it('refuses when a simulation of the inner call reverted', () => {
    // The whole point of simulating: this revert would otherwise arrive after settlement,
    // as CallFailed, with the payment gone.
    const result = plan({ simulation: { ok: false, reason: 'ERC20: transfer amount exceeds balance' } })
    expect(!result.ok && result.refusal.code).toBe('simulation_reverted')
    expect(!result.ok && result.refusal.message).toMatch(/exceeds balance/)
  })
})

describe('warnings — what the plan could not establish, said rather than hidden', () => {
  it('warns when the replay state could not be read, instead of assuming', () => {
    const result = plan({ replayed: undefined })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('replay_unknown')
  })

  it('warns when no simulation was performed', () => {
    // Silence would imply the inner call had been checked.
    const result = plan({ simulation: undefined })
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('not_simulated')
  })

  it('warns that a 0xFF payload is public on the XRP Ledger', () => {
    const result = plan()
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('payload_public')
  })

  it('warns that a pinned executor blocks even plain mints', () => {
    // Read literally, the bypass requires a non-empty memo, so a pin applies to a bare
    // no-memo mint too — the account is locked out until a 0xD1 clears it.
    const result = plan({ personalAccount: { ...ACCOUNT, pinnedExecutor: TARGET } })
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('executor_pinned')
  })
})

describe('the value the relay attaches', () => {
  it('is the SUM of the batch’s call values, because it arrives as one lump', () => {
    const result = plan({ intent: { calls: [call(5n), call(7n)], netUBA: 1_000_000n, nonce: 4n } })
    expect(result.ok && result.plan.attachValueWei).toBe(12n)
  })
})
