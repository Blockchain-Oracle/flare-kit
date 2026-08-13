import type {
  DexToken,
  StakeIntent,
  StakeLimits,
  StakeOperation,
  StakePlan,
  StakePlanResult,
  StakePositionView,
  StakingDeployment,
  ValidatorInfo,
} from '@flare-kit/core'
import {
  STAKE_CAPABILITY,
  applyTransition,
  createOperation,
  evidence,
  planStake,
  reconcileStake,
  stakePosition,
} from '@flare-kit/core'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StakeCard } from '../src/StakeCard.js'

// The live-read fixtures (validators + bounds). These NodeIDs live ONLY in the test — the
// card source must contain no NodeID literal (they come from the reads at runtime).
const NODE_A = 'NodeID-3M9KJu6ekVAyFn6Vr5vJ9zdWDGpU2M8Z1'
const NODE_B = 'NodeID-9CkG9MBNavnw7EVSRyGa8czPyaNChdcM3'
const ACCOUNT = '0x00000000000000000000000000000000000000C3' as `0x${string}`

const DAY = 86_400n
const START = 1_700_000_000n
const FLR: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }

const MIN_AMOUNT = 50_000n * 10n ** 18n
const MAX_AMOUNT = 200_000_000n * 10n ** 18n
const limits: StakeLimits = {
  minAmount: MIN_AMOUNT,
  maxAmount: MAX_AMOUNT,
  minDuration: 14n * DAY,
  maxDuration: 365n * DAY,
}

const validators: ValidatorInfo[] = [
  { nodeId: NODE_A, startTime: START, endTime: START + 400n * DAY, weight: 1_000_000n * 10n ** 18n },
  // A short-window validator: a 30-day stake would end AFTER it.
  { nodeId: NODE_B, startTime: START, endTime: START + 20n * DAY, weight: 500_000n * 10n ** 18n },
]

const deployment = (verified: boolean): StakingDeployment => ({
  network: 'coston2',
  pChainStakeMirror: '0x00000000000000000000000000000000000000a1',
  pChainStakeMirrorVerifier: '0x00000000000000000000000000000000000000a2',
  validatorRewardManager: '0x00000000000000000000000000000000000000a3',
  pChainRpcBase: 'https://coston2-api.flare.network/ext/bc/P',
  hrp: 'costwo',
  stakeVerified: verified,
})

const intent: StakeIntent = {
  nodeId: NODE_A,
  amount: MIN_AMOUNT,
  startTime: START,
  endTime: START + 30n * DAY,
  rewardAddress: ACCOUNT,
}

const planFor = (i: StakeIntent, verified: boolean): StakePlanResult =>
  planStake({ intent: i, deployment: deployment(verified), limits, validators })

const planOk = planFor(intent, true)
const planUnverified = planFor(intent, false)
const planBelowMin = planFor({ ...intent, amount: 1_000n * 10n ** 18n }, true)
const planEndsAfterValidator = planFor({ ...intent, nodeId: NODE_B }, true)

const okPlan = (): StakePlan => {
  if (!planOk.ok) throw new Error('fixture: expected an ok plan')
  return planOk.plan
}

/** Walk the full legal path to a SUBMITTED stake-in op (a jump would drop the patch). */
function submittedStakeOp(): StakeOperation {
  const plan = okPlan()
  const base = createOperation<StakeIntent, unknown, StakePlan>({
    capability: STAKE_CAPABILITY,
    network: 114,
    intent,
    now: 0,
    id: 'stake-fixture',
  })
  const quoting = applyTransition(base, { to: 'quoting', at: 0, patch: { steps: plan.steps, plan } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0 }).record
  return applyTransition(executing, {
    to: 'submitted',
    at: 0,
    evidence: [evidence({ kind: 'flare_tx', label: 'Flare tx', value: `0x${'7b'.repeat(32)}`, observedAt: 0 })],
  }).record
}

const observedStaked: StakePositionView = stakePosition({
  stakes: [{ nodeId: NODE_A, amount: MIN_AMOUNT, startTime: START, endTime: START + 30n * DAY }],
  mirroredVotePower: MIN_AMOUNT,
})
const observedNoMirror: StakePositionView = stakePosition({
  stakes: [{ nodeId: NODE_A, amount: MIN_AMOUNT, startTime: START, endTime: START + 30n * DAY }],
  mirroredVotePower: undefined,
})
const observedEmpty: StakePositionView = stakePosition({ stakes: [], mirroredVotePower: 0n })
const unavailable: StakePositionView = stakePosition(undefined)

const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button') as HTMLButtonElement | null
const rowValues = (c: HTMLElement) => [...c.querySelectorAll('.fk-row-v')].map((e) => e.textContent ?? '')
const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')

describe('StakeCard — validators are live-read, never a NodeID literal in source', () => {
  it('renders each live-read validator NodeID and its active window', () => {
    const { container } = render(
      <StakeCard position={unavailable} validators={validators} limits={limits} nativeToken={FLR} />,
    )
    expect(container.textContent).toContain(NODE_A)
    expect(container.textContent).toContain(NODE_B)
    // The validator panel exists and lists both nodes.
    expect(container.querySelectorAll('.fk-stake-validator').length).toBe(2)
    // Each carries an active window (a timestamp), so the ceiling on the stake end is visible.
    expect(container.querySelector('.fk-stake-validator .fk-ts')).not.toBeNull()
  })

  it('carries no hardcoded NodeID literal in the card source (they come from the reads)', () => {
    const cardSrc = readFileSync(join(process.cwd(), 'src', 'StakeCard.tsx'), 'utf8')
    const stateSrc = readFileSync(join(process.cwd(), 'src', 'stake-card-state.ts'), 'utf8')
    expect(cardSrc).not.toMatch(/NodeID-/)
    expect(stateSrc).not.toMatch(/NodeID-/)
  })
})

describe('StakeCard — composer surfaces the live-read bounds and the value-lock before signing', () => {
  it('shows the live-read 50k minimum and the 14–365 day window (from limits, not literals)', () => {
    const { container } = render(
      <StakeCard position={unavailable} validators={validators} limits={limits} nativeToken={FLR} />,
    )
    const text = container.textContent ?? ''
    // Minimum stake at full precision, from limits.minAmount.
    expect(text).toContain('50000')
    // The duration window, from limits.min/maxDuration in days.
    expect(text).toContain('14')
    expect(text).toContain('365')
    expect(text.toLowerCase()).toContain('day')
  })

  it('a valid plan surfaces the irreversible value-lock BEFORE the submit affordance', () => {
    const { container } = render(
      <StakeCard
        position={unavailable}
        planResult={planOk}
        validators={validators}
        limits={limits}
        nativeToken={FLR}
      />,
    )
    const lock = container.querySelector('.fk-stake-lock')
    const button = cta(container)
    expect(lock).not.toBeNull()
    expect(button).not.toBeNull()
    // The value-lock is stated ahead of the sign button in document order.
    expect(lock!.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The exact committed amount is shown, in full precision, carrying its asset.
    expect(lock!.textContent).toContain('50000.000000000000000000')
    // The commitment is framed as irreversible.
    expect(container.textContent?.toLowerCase()).toContain('irreversible')
  })
})

describe('StakeCard — the verified gate (false = declared-unbuilt, true = plan + sign)', () => {
  it('stakeVerified:false renders a declared-unbuilt affordance and NO actionable sign', () => {
    const { container } = render(
      <StakeCard
        position={unavailable}
        planResult={planUnverified}
        validators={validators}
        limits={limits}
        nativeToken={FLR}
      />,
    )
    // The configured path is still shown (validators render)…
    expect(container.querySelectorAll('.fk-stake-validator').length).toBe(2)
    // …but there is no plan, so no value-lock and no actionable sign button.
    expect(container.querySelector('.fk-stake-lock')).toBeNull()
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(container.textContent?.toLowerCase()).toContain('not built here')
  })

  it('stakeVerified:true drives the real plan + sign path (enabled CTA + value-lock)', () => {
    const { container } = render(
      <StakeCard
        position={unavailable}
        planResult={planOk}
        validators={validators}
        limits={limits}
        nativeToken={FLR}
      />,
    )
    expect(container.querySelector('.fk-stake-lock')).not.toBeNull()
    const button = cta(container)
    expect(button?.hasAttribute('disabled')).toBe(false)
    expect(button?.textContent?.toLowerCase()).toContain('stake')
  })

  it('surfaces the amount_below_min invariant honestly and disables the CTA', () => {
    expect(planBelowMin.ok).toBe(false)
    const { container } = render(
      <StakeCard
        position={unavailable}
        planResult={planBelowMin}
        validators={validators}
        limits={limits}
        nativeToken={FLR}
      />,
    )
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(container.querySelector('.fk-stake-lock')).toBeNull()
    expect(container.textContent?.toLowerCase()).toContain('minimum')
  })

  it('surfaces the ends_after_validator invariant honestly (a stake cannot outlive its validator)', () => {
    expect(planEndsAfterValidator.ok).toBe(false)
    const { container } = render(
      <StakeCard
        position={unavailable}
        planResult={planEndsAfterValidator}
        validators={validators}
        limits={limits}
        nativeToken={FLR}
      />,
    )
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(container.textContent?.toLowerCase()).toContain('validator')
  })
})

describe('StakeCard — state panel (mono, full precision, unavailable ≠ zero)', () => {
  it('renders staked positions and mirrored vote power in the mono face at full precision', () => {
    const { container } = render(<StakeCard position={observedStaked} nativeToken={FLR} />)
    const values = rowValues(container)
    // Staked amount at full stored precision, carrying its asset.
    expect(values.some((v) => v.includes('50000.000000000000000000') && v.includes('C2FLR'))).toBe(true)
    // Mirrored vote power, in mono, carrying its unit.
    expect(values.some((v) => v.includes('50000.000000000000000000') && v.toUpperCase().includes('VP'))).toBe(true)
    // Amounts render in the mono face.
    expect(container.querySelector('.fk-stake-position .fk-row-v')).not.toBeNull()
  })

  it('an unavailable MIRROR read renders "—" for vote power, never a confident 0', () => {
    const { container } = render(<StakeCard position={observedNoMirror} nativeToken={FLR} />)
    const values = rowValues(container)
    // The staked position is still observed (real), but the mirror is unknown → "—".
    expect(values).toContain('—')
    // Never a fabricated zero vote power.
    expect(container.textContent).not.toContain('0 VP')
    expect(container.textContent).not.toContain('0.000000000000000000 VP')
  })

  it('an unavailable POSITION read renders "—" everywhere, distinct from an empty stake', () => {
    const { container } = render(<StakeCard position={unavailable} nativeToken={FLR} />)
    const values = rowValues(container)
    expect(values).toContain('—')
    expect(container.textContent?.toLowerCase()).toContain('unavailable')
    // Not collapsed into a confident zero holding.
    expect(container.textContent).not.toContain('0.000000000000000000 C2FLR')
  })

  it('an observed EMPTY position is a real holding (0 vote power), distinct from unavailable', () => {
    const { container } = render(<StakeCard position={observedEmpty} nativeToken={FLR} />)
    // A real observed zero mirror is shown as a real value, not "—".
    expect(container.textContent).toContain('0.000000000000000000')
    expect(container.querySelector('[data-stake-state]')?.getAttribute('data-stake-state')).not.toBe('unavailable')
  })
})

describe('StakeCard — the four-leg round-trip timeline (succeeded only from the read)', () => {
  it('renders the four legs (export → import → delegate → return) for an in-flight op', () => {
    const op = submittedStakeOp()
    const { container } = render(<StakeCard operation={op} position={unavailable} nativeToken={FLR} />)
    expect(opState(container)).toBe('submitted')
    // Four conceptual legs of the cross-substrate round trip.
    expect(container.querySelectorAll('.fk-stake-legs .fk-legtl-leg').length).toBe(4)
    // The operation spine carries the real signed steps + the broadcast evidence.
    expect(container.querySelector('.fk-spine')).not.toBeNull()
    expect(container.querySelector('.fk-ev[data-kind="flare_tx"]')).not.toBeNull()
    // A submitted delegate is NOT rendered as done — the CTA never reads "Done".
    expect(cta(container)?.textContent?.toLowerCase()).not.toContain('done')
  })

  it('reaches succeeded ONLY once the on-chain stake position is read back', () => {
    const submitted = submittedStakeOp()
    // The hook re-reads the position; a matching read advances the op to succeeded.
    const succeeded = reconcileStake(submitted, {
      leg: 'stake',
      now: 2000,
      stakePosition: { nodeId: NODE_A, amount: MIN_AMOUNT, startTime: START, endTime: START + 30n * DAY },
    })
    const { container } = render(<StakeCard operation={succeeded} position={observedStaked} nativeToken={FLR} />)
    expect(opState(container)).toBe('succeeded')
  })
})
