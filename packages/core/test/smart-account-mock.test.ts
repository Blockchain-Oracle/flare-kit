import { describe, expect, it } from 'vitest'
import {
  OBSERVED_ACCOUNT_BLANK,
  OBSERVED_ACCOUNT_FUNDED,
  OBSERVED_ACCOUNT_LIVE,
  OBSERVED_DEPOSIT,
  OBSERVED_MAINNET_ACCOUNT,
  OBSERVED_MAINNET_SETTINGS,
  OBSERVED_SETTINGS,
  OBSERVED_TRANSFER,
  SMART_ACCOUNT_MOCK_EPOCH,
  mockInstructionCatalogue,
  mockObservation,
  mockPlan,
} from '../src/mock-smart-accounts.js'
import { smartAccountsFor } from '@flare-kit/contracts'
import { smartAccountPosition } from '../src/portfolio.js'
import { buildInstructionCatalogue } from '../src/smart-accounts/catalogue.js'
import { encodePaymentReference } from '../src/smart-accounts/payment-reference.js'
import { planInstruction } from '../src/smart-accounts/plan.js'
import { reconcileInstruction } from '../src/smart-accounts/states.js'
import { submittedInstructionRecord } from './smart-account-fixtures.js'

/**
 * The mock copies the live runs and refuses everything else.
 *
 * The load-bearing test in this file is the FIRST one: the mock's recorded references are
 * re-derived by the real encoder, so a codec change that broke the encoding would fail here
 * against bytes the Coston2 controller actually accepted. That is what makes this a record
 * of reality rather than a second copy of our own assumptions.
 */

describe('the mock records what the chain accepted', () => {
  it.each([
    ['transfer', OBSERVED_TRANSFER],
    ['deposit', OBSERVED_DEPOSIT],
  ])('re-derives the %s reference the controller dispatched', (_name, run) => {
    // These exact bytes travelled as `standardPaymentReference` in a proof the live
    // controller accepted. If the encoder ever disagrees with them, the encoder is wrong.
    expect(encodePaymentReference(run.intent)).toBe(run.reference)
  })

  it('keeps the deposit marked as NOT dispatched by this kit', () => {
    // The instruction executed and the effect is real, but the operator's backend submitted
    // the proof first. Flipping this to `true` would claim a leg the run did not prove.
    expect(OBSERVED_TRANSFER.dispatchedByUs).toBe(true)
    expect(OBSERVED_DEPOSIT.dispatchedByUs).toBe(false)
    // The submitter is an ADDRESS and it is not ours. The previous line here compared it to
    // a transaction HASH — two different kinds of value that can never be equal, so the
    // assertion was unconditionally true (found by the 2026-08-14 test review).
    expect(OBSERVED_DEPOSIT.dispatchedBy).toMatch(/^0x[0-9a-f]{40}$/)
    expect(OBSERVED_DEPOSIT.dispatchedBy.toLowerCase()).not.toBe(
      '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
    )
  })

  it('carries the CONTROLLER vault the deposit actually landed in', () => {
    // Vault id 1 on this controller is `0xC90D…0361`, which is not one of the kit's own
    // Coston2 vaults. The namespaces genuinely differ and the mock records the real one.
    const vault = OBSERVED_SETTINGS.vaults?.find((v) => v.vaultId === OBSERVED_DEPOSIT.intent.vaultId)
    expect(vault?.address).toBe('0xC90D6847747b85d1fa2E07859869fb9fB72c0361')
    expect(vault?.vaultType).toBe('firelight')
  })
})

describe('the mock drives the real code, not a second copy of it', () => {
  it('produces a plan through the real planner', () => {
    // Planned against the account as it stood BEFORE the transfer — funded, undeployed.
    // The post-run account holds 500000 and correctly cannot cover a 1000000 transfer.
    const result = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.reference).toBe(OBSERVED_TRANSFER.reference)
    expect(result.plan.destination).toBe('rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq')
    expect(result.plan.feeDrops).toBe(1000n)
    // The first instruction is what deploys the account, and the plan says so.
    expect(result.plan.warnings.map((w) => w.code)).toContain('account_undeployed')
  })

  it('refuses a re-run of the transfer against the account the runs left behind', () => {
    // Not a quirk of the fixture — the real post-run balance genuinely cannot cover it, and
    // the mock does not paper over that to keep a composer looking active.
    const result = mockPlan(OBSERVED_TRANSFER.intent)
    expect(!result.ok && result.refusal.code).toBe('recipient_unfunded')
  })

  it('is subject to the real planner’s refusals, not exempt from them', () => {
    // A blank account holds nothing, so the real balance gate must refuse — the mock does
    // not get to bypass an invariant just because the run later succeeded.
    const result = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_BLANK)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.refusal.code).toBe('recipient_unfunded')
  })

  it('reaches succeeded only by walking the real reconciler', () => {
    const clock = { now: SMART_ACCOUNT_MOCK_EPOCH, proofWindowSeconds: 86_400n }
    let record = submittedInstructionRecord(OBSERVED_TRANSFER.intent)
    for (const leg of ['paid', 'proved', 'submitted'] as const) {
      record = reconcileInstruction(record, mockObservation(OBSERVED_TRANSFER, leg), clock)
      expect(record.state).toBe('awaiting_external')
    }
    record = reconcileInstruction(record, mockObservation(OBSERVED_TRANSFER, 'settled'), clock)
    expect(record.state).toBe('succeeded')
    expect(record.steps.every((step) => step.state === 'done')).toBe(true)
  })

  it('exposes the deposit as settled too, because the chain says it executed', () => {
    // Who sent the transaction is `dispatchedByUs`, not the operation's state. An operation
    // whose instruction a third party dispatched still succeeded — the effect is real.
    const clock = { now: SMART_ACCOUNT_MOCK_EPOCH, proofWindowSeconds: 86_400n }
    const record = reconcileInstruction(
      submittedInstructionRecord(OBSERVED_DEPOSIT.intent),
      mockObservation(OBSERVED_DEPOSIT, 'settled'),
      clock,
    )
    expect(record.state).toBe('succeeded')
  })
})

describe('the mock refuses what the runs never observed', () => {
  it('refuses an XRPL owner it never saw', () => {
    expect(() =>
      mockPlan({ ...OBSERVED_TRANSFER.intent, xrplOwner: 'rSOMEONEELSEzzzzzzzzzzzzzzzzzzzz' }),
    ).toThrow(/never observed/)
  })

  it('refuses an instruction that was never driven, rather than answering plausibly', () => {
    // Nine of the eleven built-ins were never dispatched. The live evidence says nothing
    // about them, so neither does the mock.
    expect(() => mockPlan({ ...OBSERVED_TRANSFER.intent, instructionId: 0x02 })).toThrow(
      /instruction 0x02 was never observed/,
    )
    expect(() => mockPlan({ ...OBSERVED_TRANSFER.intent, instructionId: 0x21 })).toThrow(
      /never observed/,
    )
  })

  it('still catalogues every instruction, because the catalogue is a read not a claim', () => {
    // Refusing to PLAN an undriven instruction is different from pretending the protocol
    // has no such instruction.
    expect(mockInstructionCatalogue()).toHaveLength(11)
  })
})

describe('the portfolio position', () => {
  it('distinguishes not-deployed from unavailable — they are different facts', () => {
    // A personal account is a CREATE2 address that answers before the contract exists, so
    // "derived but never deployed" is what every XRPL address has until its first
    // instruction. It is not an absent read.
    expect(smartAccountPosition(OBSERVED_ACCOUNT_BLANK, true)).toEqual({
      status: 'not-deployed',
      address: OBSERVED_ACCOUNT_BLANK.address,
      xrplOwner: OBSERVED_ACCOUNT_BLANK.xrplOwner,
    })
    expect(smartAccountPosition(undefined, true).status).toBe('unavailable')
  })

  it('observes the account the live runs left behind', () => {
    const view = smartAccountPosition(OBSERVED_ACCOUNT_LIVE, true)
    expect(view.status).toBe('observed')
    expect(view.status === 'observed' && view.fassetBalance).toBe(500_000n)
  })

  it('never claims not-deployed when the code read FAILED', () => {
    // `deployed: undefined` is "we could not look". Claiming the account does not exist
    // there would be the unread-value-as-a-confident-answer mistake again.
    const view = smartAccountPosition({ ...OBSERVED_ACCOUNT_LIVE, deployed: undefined }, true)
    expect(view.status).not.toBe('not-deployed')
    expect(view.status).toBe('observed')
    // …and `observed` does not flatten the two ways it is reached. A consumer can still tell
    // "the contract is there" from "the code read failed" — otherwise the third value the
    // card keeps would be lost at this seam.
    expect(view.status === 'observed' && view.deployed).toBeUndefined()
    const seen = smartAccountPosition(OBSERVED_ACCOUNT_LIVE, true)
    expect(seen.status === 'observed' && seen.deployed).toBe(true)
  })

  it('is UNBUILT — not unavailable — on a network whose round trip is unverified', () => {
    // Flare mainnet. The position must not be read off a path no live run confirmed, and the
    // reason must not be dressed as a failed read: `unavailable` means "we could not look",
    // which would blame the network for a gap in what this kit has proven.
    expect(smartAccountPosition(OBSERVED_ACCOUNT_LIVE, false).status).toBe('unbuilt')
    expect(smartAccountPosition(undefined, true).status).toBe('unavailable')
  })
})

/**
 * The mainnet READ LENS. Its values are probed, not verified — the distinction this whole
 * milestone runs on — so they may be shown and must never be planned against.
 */
describe('the mainnet read lens', () => {
  it('derives the SAME personal account as Coston2, from two separate reads', () => {
    // The property SmartAccountCard exists to show. Recorded as two independently-read
    // values that agree, so a future deployment that broke it would fail here rather than
    // be discovered in a screenshot.
    expect(OBSERVED_MAINNET_ACCOUNT.address).toBe(OBSERVED_ACCOUNT_BLANK.address)
    expect(OBSERVED_MAINNET_ACCOUNT.deployed).toBe(false)
  })

  it('charges 950000 for five ids against a 500000 default', () => {
    // The fact the no-fallback rule rests on. If these ever equalled the default, the test
    // that proves substituting the default is wrong would pass vacuously.
    expect(OBSERVED_MAINNET_SETTINGS.defaultInstructionFee).toBe(500_000n)
    for (const id of [0x00, 0x02, 0x10, 0x20]) {
      expect(OBSERVED_MAINNET_SETTINGS.instructionFees[id], `fee 0x${id.toString(16)}`).toBe(950_000n)
    }
    for (const id of [0x01, 0x11, 0x12, 0x13, 0x21, 0x22, 0x23]) {
      expect(OBSERVED_MAINNET_SETTINGS.instructionFees[id], `fee 0x${id.toString(16)}`).toBe(500_000n)
    }
  })

  it('refuses to plan on mainnet even with every read in hand', () => {
    // The verified gate runs FIRST, so a fully-readable deployment still yields no plan.
    // Nothing about this milestone writes to mainnet.
    const result = planInstruction({
      deployment: smartAccountsFor('flare'),
      settings: OBSERVED_MAINNET_SETTINGS,
      catalogue: buildInstructionCatalogue(OBSERVED_MAINNET_SETTINGS),
      personalAccount: OBSERVED_MAINNET_ACCOUNT,
      intent: OBSERVED_TRANSFER.intent,
      replayed: false,
      balanceRequested: true,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.refusal.code).toBe('unverified')
  })
})
