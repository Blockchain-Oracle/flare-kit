import type { ClaimIntent, ClaimPlanResult, DexToken, FtsoReward, RewardsClaimPlan, RewardsReads, RnatState, StakingRewardState } from '@flare-kit/core'
import { applyTransition, createOperation, reconcileClaim } from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaimCard } from '../src/ClaimCard.js'
import type { RewardsClaimOperation } from '../src/claim-card-state.js'

// M10 Task 12: ONE ClaimCard parameterised by ClaimKind — the three kinds render DISTINCTLY
// (R-REWARD-002) and are never collapsed into a generic claim. Every state is reachable from
// props via the pure `claim-card-state.ts`. The honesty renders: the FTSO proof source is the
// UNOFFICIAL mirror (official:false, never protocol truth); the rNat `withdrawAll` shows the
// 50% early-exit BURN as real value destruction BEFORE signing; FlareDrop reads concluded
// (2026-01-30) with no new-drop affordance; proof-unavailable / no-entitlement are DECLARED
// unknowns, never fabricated amounts.

const C2FLR: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }
const MIRROR = { url: 'https://gitlab.com/timivesel/ftsov2-testnet-rewards', official: false }
const RECIPIENT = '0x00000000000000000000000000000000000000D4' as `0x${string}`
const FIVE = 5_000_000_000_000_000_000n

function reads(over: Partial<RewardsReads> = {}): RewardsReads {
  return {
    currentRewardEpoch: 5930,
    claimableEpochs: [5927, 5928],
    expireNextEpoch: 5902,
    ftso: [],
    rnat: { kind: 'rnat', month: 26, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false },
    flaredrop: { kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true },
    // The 4th kind — NON-EXPIRING (T8). Default honest-empty: total === claimed → claimable 0n.
    staking: { kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false },
    ...over,
  }
}

function reward(over: Partial<FtsoReward> = {}): FtsoReward {
  return {
    kind: 'ftso-delegation',
    epoch: 5928,
    amount: 1_500_000_000_000_000_000n,
    claimType: 2,
    proof: ['0xaa'],
    expiresAtEpoch: 5902,
    source: MIRROR,
    ...over,
  }
}

const rnatFunded: RnatState = { kind: 'rnat', month: 26, wNat: 3_000_000_000_000_000_000n, rnat: FIVE, locked: 4_000_000_000_000_000_000n, hasProject: true }

// A real observed staking position: 7 earned, 2 already claimed → 5 claimable (NON-EXPIRING).
const stakingFunded: StakingRewardState = { kind: 'staking', total: 7_000_000_000_000_000_000n, claimed: 2_000_000_000_000_000_000n, claimable: FIVE, expires: false }

const NOT_VERIFIED: ClaimPlanResult = { kind: 'error', error: { kind: 'not-verified' } }
const REAL_PLAN: ClaimPlanResult = { kind: 'plan', plan: { steps: [], calls: [], claimKind: 'ftso-delegation' } }
const STAKING_PLAN: ClaimPlanResult = { kind: 'plan', plan: { steps: [], calls: [], claimKind: 'staking' } }

/** Walks the FULL legal path (draft→quoting→ready→executing→submitted) — a jump drops the patch. */
function submittedClaim(intent: ClaimIntent, awaitType: string): RewardsClaimOperation {
  const base = createOperation<ClaimIntent, unknown, RewardsClaimPlan>({ capability: 'rewards_claim', network: 114, intent, now: 0, id: 'claim-fixture' })
  const steps = [
    { id: 'call-0', type: 'claim', actor: 'your_wallet' as const, state: 'pending' as const, attempts: 0 },
    { id: 'record', type: awaitType, actor: 'flare' as const, state: 'pending' as const, attempts: 0 },
  ]
  const quoting = applyTransition(base, { to: 'quoting', at: 0 }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0, patch: { steps } }).record
  return applyTransition(executing, { to: 'submitted', at: 0 }).record
}

const FTSO_INTENT: ClaimIntent = { kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false }

const claimState = (c: HTMLElement) => c.querySelector('[data-claim-state]')?.getAttribute('data-claim-state')
const claimKind = (c: HTMLElement) => c.querySelector('[data-claim-kind]')?.getAttribute('data-claim-kind')
const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')
const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button')
const lower = (c: HTMLElement) => (c.textContent ?? '').toLowerCase()

describe('ClaimCard — the three kinds render DISTINCTLY, never collapsed (R-REWARD-002)', () => {
  it('CLAIM-01 FTSO carries its OWN fields: epoch + the UNOFFICIAL-mirror proof label; not the others', () => {
    const { container } = render(
      <ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward()] })} proofSource={MIRROR} recipient={RECIPIENT} nativeToken={C2FLR} />,
    )
    expect(claimKind(container)).toBe('ftso-delegation')
    // The FTSO facts.
    expect(container.textContent).toContain('5928') // the epoch, in the mono face
    expect(lower(container)).toContain('unofficial') // the mirror label (official:false)
    expect(container.textContent).toContain('1.500000000000000000') // the amount, full precision
    // NONE of the other kinds' fields.
    expect(lower(container)).not.toContain('burn')
    expect(lower(container)).not.toContain('concluded')
  })

  it('CLAIM-02 rNat carries its OWN fields: the 50% burn + the locked/unlocked/rNat split; not the others', () => {
    const { container } = render(
      <ClaimCard kind="rnat" reads={reads({ rnat: rnatFunded })} withdrawAll nativeToken={C2FLR} />,
    )
    expect(claimKind(container)).toBe('rnat')
    expect(container.textContent).toContain('50%') // the early-exit burn share
    expect(lower(container)).toContain('burn')
    expect(lower(container)).toContain('locked')
    // NONE of the other kinds' fields.
    expect(container.textContent).not.toContain('5928')
    expect(lower(container)).not.toContain('unofficial')
    expect(lower(container)).not.toContain('concluded')
  })

  it('CLAIM-03 FlareDrop carries its OWN fields: the concluded-2026-01-30 archive, no new drop; not the others', () => {
    const { container } = render(<ClaimCard kind="flaredrop" reads={reads()} recipient={RECIPIENT} nativeToken={C2FLR} />)
    expect(claimKind(container)).toBe('flaredrop')
    expect(lower(container)).toContain('concluded')
    expect(container.textContent).toContain('2026-01-30')
    // No new-drop AFFORDANCE: the archive states there is no new drop and offers no live claim.
    expect(lower(container)).toContain('no new drop')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    // NONE of the other kinds' fields.
    expect(container.textContent).not.toContain('5928')
    expect(lower(container)).not.toContain('unofficial')
    expect(lower(container)).not.toContain('burn')
  })

  it('CLAIM-04 staking carries its OWN fields: reward-type "staking", NON-EXPIRING (no epoch line), recipient + wrap; not the others', () => {
    const { container } = render(
      <ClaimCard kind="staking" reads={reads({ staking: stakingFunded })} recipient={RECIPIENT} wrap nativeToken={C2FLR} />,
    )
    expect(claimKind(container)).toBe('staking')
    // The staking facts.
    expect(lower(container)).toContain('staking') // the reward-type label, distinct from the other three
    expect(container.textContent).toContain('5.000000000000000000') // the claimable amount, full precision, mono face
    // Recipient in the mono face.
    expect([...container.querySelectorAll('.fk-mono')].some((el) => el.textContent?.includes('0x0000…00D4'))).toBe(true)
    // Wrap is surfaced.
    expect(lower(container)).toContain('wnat')
    // NON-EXPIRING: the "does not expire" affordance, and NEVER the FTSO 25-epoch / any epoch-expiry line.
    expect(lower(container)).toContain('does not expire')
    expect(lower(container)).not.toContain('expires')
    expect(lower(container)).not.toContain('25-epoch')
    expect(lower(container)).not.toContain('epoch') // no epoch boundary of any kind on the staking card
    // NONE of the other kinds' fields.
    expect(lower(container)).not.toContain('unofficial')
    expect(lower(container)).not.toContain('burn')
    expect(lower(container)).not.toContain('concluded')
  })
})

describe('ClaimCard — the honesty renders', () => {
  it('the UNOFFICIAL-mirror label is present on FTSO and its official flag is false, never protocol truth', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward()] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(lower(container)).toContain('unofficial')
    // The source url is shown so it is auditable, not dressed as an official API.
    expect(container.textContent).toContain('gitlab.com/timivesel')
    expect(lower(container)).not.toContain('official api')
  })

  it('rNat withdrawAll shows the 50% burn as real value destruction BEFORE signing (no operation yet)', () => {
    const { container } = render(<ClaimCard kind="rnat" reads={reads({ rnat: rnatFunded })} withdrawAll nativeToken={C2FLR} />)
    expect(opState(container)).toBeUndefined() // nothing signed yet
    expect(container.textContent).toContain('50%')
    // Half of the 4.0 locked rNat is destroyed — the exact burned amount, in the mono face.
    expect(container.textContent).toContain('2.000000000000000000')
    expect(lower(container)).toContain('destroy')
  })

  it('the 50% burn stays visible even when the carried not-verified gate refuses the claim (still before signing)', () => {
    const { container } = render(
      <ClaimCard kind="rnat" reads={reads({ rnat: rnatFunded })} withdrawAll planResult={NOT_VERIFIED} nativeToken={C2FLR} />,
    )
    expect(container.textContent).toContain('2.000000000000000000') // burn is never hidden by the gate
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(cta(container)?.textContent?.toLowerCase()).toContain('not available')
  })

  it('a proof-unavailable epoch renders "declared unavailable" — never a claimable amount', () => {
    const { container } = render(
      <ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward({ proof: [] })] })} proofSource={MIRROR} nativeToken={C2FLR} />,
    )
    expect(claimState(container)).toBe('ftso-proof-unavailable')
    expect(lower(container)).toContain('unavailable')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('a no-entitlement FTSO account reads the honest empty "nothing earned yet — delegate to earn", never a faked amount', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-empty')
    expect(lower(container)).toContain('nothing earned yet')
    expect(lower(container)).toContain('delegate')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('a !hasProject rNat account reads the honest empty state, never a faked balance', () => {
    const { container } = render(<ClaimCard kind="rnat" reads={reads()} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('rnat-empty')
    expect(lower(container)).toContain('no rnat account')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('staking with claimable 0n reads the honest empty (a delayed leg), never a fabricated amount — and never an epoch expiry', () => {
    // reads() default staking is total===claimed===0 → claimable 0n. A genuinely observed empty
    // (distinct from `unavailable`, which is a read that never landed), framed as a delayed leg.
    const { container } = render(<ClaimCard kind="staking" reads={reads()} recipient={RECIPIENT} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('staking-empty')
    expect(lower(container)).toContain('staking rewards')
    expect(lower(container)).toContain('delayed leg')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    // Still NON-EXPIRING in the empty state — no epoch-expiry copy leaks.
    expect(lower(container)).not.toContain('expires')
    expect(lower(container)).not.toContain('epoch')
  })
})

describe('ClaimCard — a failed/undefined read is UNAVAILABLE, never a confident empty (I-1)', () => {
  // `reads === undefined` is a dead RPC / first-load failure — `useRewards` leaves `reads`
  // undefined and records `error`. It must NOT collapse to the per-kind confident empty
  // (ftso-empty / rnat-empty / flaredrop-concluded); those declare "you earned nothing",
  // which is a lie built on a read that never landed. Mirrors the DelegationCard `unavailable`.
  it('FTSO: undefined reads → unavailable, NEVER ftso-empty ("Nothing earned yet")', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('unavailable')
    expect(claimState(container)).not.toBe('ftso-empty')
    expect(lower(container)).not.toContain('nothing earned yet')
  })

  it('rNat: undefined reads → unavailable, NEVER rnat-empty ("No RNat account")', () => {
    const { container } = render(<ClaimCard kind="rnat" nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('unavailable')
    expect(claimState(container)).not.toBe('rnat-empty')
    expect(lower(container)).not.toContain('no rnat account')
  })

  it('FlareDrop: undefined reads → unavailable, NEVER flaredrop-concluded', () => {
    const { container } = render(<ClaimCard kind="flaredrop" nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('unavailable')
    expect(claimState(container)).not.toBe('flaredrop-concluded')
    expect(lower(container)).not.toContain('concluded')
  })

  it('renders "—" for the exact-value rows + the honest "unknown, not empty" note; CTA disabled', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" nativeToken={C2FLR} />)
    const monoValues = [...container.querySelectorAll('.fk-row-v')].map((el) => el.textContent ?? '')
    expect(monoValues).toContain('—')
    // The honest note: the read didn't land — unknown, not empty (never a faked zero).
    expect(lower(container)).toContain("didn't land")
    expect(lower(container)).toContain('not empty')
    expect(lower(container)).not.toContain('nothing earned yet')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('unavailable ≠ observed-empty: a PRESENT reads with empty ftso is the REAL ftso-empty', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-empty')
    expect(lower(container)).toContain('nothing earned yet')
  })
})

describe('ClaimCard — every state reachable from props (M10-R10/AC6)', () => {
  it('ftso-claimable', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward()] })} proofSource={MIRROR} planResult={REAL_PLAN} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-claimable')
    expect(cta(container)?.hasAttribute('disabled')).toBe(false) // a real plan → signable
  })

  it('ftso-expiring (a reward at/before the on-chain expire-next boundary)', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward({ epoch: 5902 })] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-expiring')
    expect(lower(container)).toContain('25-epoch')
  })

  it('ftso-empty', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-empty')
  })

  it('ftso-proof-unavailable', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward({ proof: [] })] })} proofSource={MIRROR} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('ftso-proof-unavailable')
  })

  it('rnat-claimable', () => {
    const { container } = render(<ClaimCard kind="rnat" reads={reads({ rnat: rnatFunded })} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('rnat-claimable')
  })

  it('rnat-locked-burn-warning', () => {
    const { container } = render(<ClaimCard kind="rnat" reads={reads({ rnat: rnatFunded })} withdrawAll nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('rnat-locked-burn-warning')
  })

  it('rnat-empty', () => {
    const { container } = render(<ClaimCard kind="rnat" reads={reads()} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('rnat-empty')
  })

  it('flaredrop-month (a real historical claimable month)', () => {
    const { container } = render(<ClaimCard kind="flaredrop" reads={reads({ flaredrop: { kind: 'flaredrop', claimableMonths: [5], amount: 0n, concluded: true } })} recipient={RECIPIENT} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('flaredrop-month')
    expect(container.textContent).toContain('5')
  })

  it('flaredrop-concluded', () => {
    const { container } = render(<ClaimCard kind="flaredrop" reads={reads()} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('flaredrop-concluded')
  })

  it('staking-claimable (a real claimable delta → signable ONLY with a real plan)', () => {
    const { container } = render(<ClaimCard kind="staking" reads={reads({ staking: stakingFunded })} recipient={RECIPIENT} planResult={STAKING_PLAN} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('staking-claimable')
    expect(cta(container)?.textContent?.toLowerCase()).toContain('claim staking')
    expect(cta(container)?.hasAttribute('disabled')).toBe(false) // a real plan → signable
  })

  it('staking-empty (observed claimable 0n)', () => {
    const { container } = render(<ClaimCard kind="staking" reads={reads()} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('staking-empty')
  })

  it('staking honest-empty via a no-entitlement plan error → staking-empty, never ftso-empty', () => {
    const noEntitlement: ClaimPlanResult = { kind: 'error', error: { kind: 'no-entitlement' } }
    const { container } = render(<ClaimCard kind="staking" reads={reads({ staking: stakingFunded })} planResult={noEntitlement} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('staking-empty')
    expect(claimState(container)).not.toBe('ftso-empty')
  })

  it('not-verified (rewardsVerified carried false) reads "not built here / not available", never a claimable amount', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" reads={reads({ ftso: [reward()] })} proofSource={MIRROR} planResult={NOT_VERIFIED} nativeToken={C2FLR} />)
    expect(claimState(container)).toBe('not-verified')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(cta(container)?.textContent?.toLowerCase()).toContain('not available')
  })

  it('claiming (a submitted claim is in flight — never succeeded from the submission)', () => {
    const { container } = render(<ClaimCard kind="ftso-delegation" operation={submittedClaim(FTSO_INTENT, 'await_ftso_claim')} nativeToken={C2FLR} />)
    expect(opState(container)).toBe('submitted')
    expect(claimState(container)).toBe('claiming')
    expect(cta(container)?.textContent?.toLowerCase()).toContain('claiming')
  })

  it('awaiting (an unconfirmed claim stays awaiting_external, actor flare — never succeeded)', () => {
    const op = reconcileClaim(submittedClaim(FTSO_INTENT, 'await_ftso_claim'), false, 1000)
    const { container } = render(<ClaimCard kind="ftso-delegation" operation={op} nativeToken={C2FLR} />)
    expect(opState(container)).toBe('awaiting_external')
    expect(claimState(container)).toBe('awaiting')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('succeeded (ONLY from a confirmed on-chain read)', () => {
    const op = reconcileClaim(submittedClaim(FTSO_INTENT, 'await_ftso_claim'), true, 2000)
    const { container } = render(<ClaimCard kind="ftso-delegation" operation={op} nativeToken={C2FLR} />)
    expect(opState(container)).toBe('succeeded')
    expect(claimState(container)).toBe('succeeded')
    expect(cta(container)?.textContent?.toLowerCase()).toContain('claimed')
  })
})
