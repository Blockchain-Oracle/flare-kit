import type {
  Eligibility,
  GovernanceIntent,
  GovernanceOperation,
  GovernancePlan,
  GovernancePositionView,
} from '@flare-kit/core'
import {
  applyTransition,
  createOperation,
  evidence,
  governanceFor,
  governancePosition,
  planGovernance,
  reconcileGovernance,
} from '@flare-kit/core'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GovernanceCard } from '../src/GovernanceCard.js'

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`
const ACCOUNT = '0x00000000000000000000000000000000000000C3' as `0x${string}`
const DELEGATE = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a' as `0x${string}`
const FIVE = 5_000_000_000_000_000_000n

// governanceFor('coston2') is the LIVE-verified deployment (governanceVerified: true); Flare
// mainnet is the read lens (governanceVerified: false — the declared-unbuilt gate).
const coston2 = governanceFor('coston2')
const flare = governanceFor('flare')

const observedDelegated: GovernancePositionView = governancePosition({ votes: FIVE, delegate: DELEGATE })
const observedBlank: GovernancePositionView = governancePosition({ votes: 0n, delegate: ZERO })
const unavailable: GovernancePositionView = governancePosition(undefined)

const eligProposer: Eligibility = { isProposer: true, canPropose: true, isMember: true }
// The observed live shape for an arbitrary account: not a proposer, and isMember REVERTS →
// undefined (probe CONCERN A — never coerced to false).
const eligNone: Eligibility = { isProposer: false, canPropose: false, isMember: undefined }

const DELEGATE_INTENT: GovernanceIntent = { kind: 'delegate', to: DELEGATE }
const UNDELEGATE_INTENT: GovernanceIntent = { kind: 'undelegate' }

const planDelegate = planGovernance({ intent: DELEGATE_INTENT, deployment: coston2, reads: { delegate: ZERO }, account: ACCOUNT })
const planUnverified = planGovernance({ intent: DELEGATE_INTENT, deployment: flare, reads: { delegate: ZERO }, account: ACCOUNT })
const planSelf = planGovernance({ intent: { kind: 'delegate', to: ACCOUNT }, deployment: coston2, reads: { delegate: ZERO }, account: ACCOUNT })
// Re-delegating to the address already delegated to — refused at the PLAN, because the
// reconciler's read-back would otherwise be satisfied by pre-existing state.
const planAlready = planGovernance({ intent: DELEGATE_INTENT, deployment: coston2, reads: { delegate: DELEGATE }, account: ACCOUNT })

/** Walk the FULL legal path (draft→quoting→ready→executing→submitted) — a jump drops the patch. */
function submittedOp(intent: GovernanceIntent, currentDelegate: `0x${string}`): GovernanceOperation {
  const result = planGovernance({ intent, deployment: coston2, reads: { delegate: currentDelegate }, account: ACCOUNT })
  if (!result.ok) throw new Error('fixture expected a plan')
  const plan: GovernancePlan = result.plan
  const base = createOperation<GovernanceIntent, unknown, GovernancePlan>({
    capability: 'governance',
    network: 114,
    intent,
    now: 0,
    id: 'gov-fixture',
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

const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button') as HTMLButtonElement | null
const rowValues = (c: HTMLElement) => [...c.querySelectorAll('.fk-row-v')].map((e) => e.textContent ?? '')
const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')
const govState = (c: HTMLElement) => c.querySelector('[data-gov-state]')?.getAttribute('data-gov-state')
const buttonByText = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').toLowerCase().includes(text.toLowerCase()))

describe('GovernanceCard — VP panel (mono, full precision, unavailable ≠ zero)', () => {
  it('renders vote power and the current delegate in the mono face, at full precision', () => {
    const { container } = render(<GovernanceCard position={observedDelegated} />)
    const values = rowValues(container)
    // Governance vote power at full stored precision, carrying its unit — in the mono face.
    expect(values.some((v) => v.includes('5.000000000000000000') && v.toUpperCase().includes('VP'))).toBe(true)
    // The current delegate address is rendered in the mono face.
    const monoDelegate = [...container.querySelectorAll('.fk-mono')].some((el) => (el.textContent ?? '').includes('0xDddF'))
    expect(monoDelegate).toBe(true)
  })

  it('an unavailable VP read renders "—", never a confident 0 vote power', () => {
    const { container } = render(<GovernanceCard position={unavailable} />)
    const values = rowValues(container)
    expect(values).toContain('—')
    // Never a fabricated zero.
    expect(container.textContent).not.toContain('0 VP')
    expect(container.textContent).not.toContain('0.000000000000000000 VP')
    // Distinct from observed-empty: says the position is unavailable, not empty.
    expect(container.textContent?.toLowerCase()).toContain('unavailable')
    expect(govState(container)).toBe('unavailable')
  })

  it('an observed blank slate is a REAL value (0 VP, no delegate), distinct from unavailable', () => {
    const { container } = render(<GovernanceCard position={observedBlank} />)
    // A real observed zero, not an unknown dash.
    expect(container.textContent).toContain('0.000000000000000000')
    expect(govState(container)).not.toBe('unavailable')
    // No current delegate is an observed-empty ("None"), never a fabricated address.
    expect(container.textContent).toContain('None')
  })
})

describe('GovernanceCard — the composer is SINGLE-TARGET (all-or-nothing, no bips)', () => {
  it('offers exactly ONE target address input — no bips field, no second-provider row', () => {
    const { container } = render(
      <GovernanceCard position={observedBlank} targetText={DELEGATE} planResult={planDelegate} />,
    )
    // Exactly one target address input, and it is the governance-target input.
    expect(container.querySelectorAll('.fk-gov-target').length).toBe(1)
    // Governance VP is all-or-nothing: there is NO bips/share cell and NO numeric share input.
    expect(container.querySelector('[class*="share"]')).toBeNull()
    expect(container.querySelector('input[inputmode="numeric"]')).toBeNull()
    // And no second address input (single delegate, never two providers).
    const textInputs = [...container.querySelectorAll('input')].filter(
      (el) => (el.getAttribute('inputmode') ?? 'text') === 'text',
    )
    expect(textInputs.length).toBe(1)
  })

  it('carries no bips/second-provider vocabulary in the card source (governance VP is all-or-nothing)', () => {
    const cardSrc = readFileSync(join(process.cwd(), 'src', 'GovernanceCard.tsx'), 'utf8')
    const stateSrc = readFileSync(join(process.cwd(), 'src', 'governance-card-state.ts'), 'utf8')
    expect(cardSrc).not.toMatch(/bips/i)
    expect(stateSrc).not.toMatch(/bips/i)
    // No "add a provider" / second-provider affordance (that is the M10 DelegationCard shape).
    expect(cardSrc).not.toMatch(/add a provider/i)
  })

  it('offers Undelegate when a current delegate exists, and NOT when there is none', () => {
    const withDelegate = render(<GovernanceCard position={observedDelegated} />)
    expect(buttonByText(withDelegate.container, 'undelegate')).toBeDefined()

    const noDelegate = render(<GovernanceCard position={observedBlank} />)
    expect(buttonByText(noDelegate.container, 'undelegate')).toBeUndefined()
  })

  // T12-d: with NO plan the verified gate has not been evaluated, so the affordance must not
  // present itself as live — the same stance the delegate CTA already takes.
  it('Undelegate is verified-gated: disabled with no plan, live once a plan says it is legal', () => {
    const noPlan = render(<GovernanceCard position={observedDelegated} />)
    expect(buttonByText(noPlan.container, 'undelegate')?.hasAttribute('disabled')).toBe(true)

    const unverifiedPlan = render(<GovernanceCard position={observedDelegated} planResult={planUnverified} />)
    expect(buttonByText(unverifiedPlan.container, 'undelegate')?.hasAttribute('disabled')).toBe(true)

    const undelegatePlan = planGovernance({ intent: UNDELEGATE_INTENT, deployment: coston2, reads: { delegate: DELEGATE }, account: ACCOUNT })
    expect(undelegatePlan.ok).toBe(true)
    const live = render(<GovernanceCard position={observedDelegated} planResult={undelegatePlan} />)
    expect(buttonByText(live.container, 'undelegate')?.hasAttribute('disabled')).toBe(false)
  })
})

describe('GovernanceCard — eligibility rendered honestly (isMember undefined ≠ No)', () => {
  it('renders isProposer / canPropose as their real booleans', () => {
    const { container } = render(<GovernanceCard position={observedBlank} eligibility={eligProposer} />)
    const text = container.textContent ?? ''
    expect(text.toLowerCase()).toContain('proposer')
    // Both reliable gates are true here → both surface "Yes".
    const values = rowValues(container)
    expect(values.filter((v) => v.trim() === 'Yes').length).toBeGreaterThanOrEqual(2)
  })

  it('isMember: undefined renders "—" / unknown, NEVER "No" (it reverts on-chain)', () => {
    const { container } = render(<GovernanceCard position={observedBlank} eligibility={eligNone} />)
    const values = rowValues(container)
    // isProposer:false and canPropose:false are honestly "No"…
    expect(values.filter((v) => v.trim() === 'No').length).toBeGreaterThanOrEqual(2)
    // …but isMember (undefined) is "—", not a third "No".
    expect(values).toContain('—')
    expect(values.filter((v) => v.trim() === 'No').length).toBe(2)
  })

  it('the propose/submit affordance is declared-unbuilt (permissioned), never a live submit', () => {
    const { container } = render(<GovernanceCard position={observedBlank} eligibility={eligProposer} />)
    // No enabled "Propose"/"Submit proposal" action exists — it is declared-unbuilt this milestone.
    const propose = buttonByText(container, 'propose')
    if (propose) expect(propose.hasAttribute('disabled')).toBe(true)
    // The declared-unbuilt scope is stated in text.
    expect(container.textContent?.toLowerCase()).toMatch(/proposal.*(isn't|not) built|not built here/)
  })
})

describe('GovernanceCard — the verified gate (false = declared-unbuilt, true = plan + sign)', () => {
  it('unverified (Flare read lens) disables the CTA and states it is not built here', () => {
    const { container } = render(
      <GovernanceCard position={observedBlank} targetText={DELEGATE} planResult={planUnverified} />,
    )
    expect(planUnverified.ok).toBe(false)
    expect(govState(container)).toBe('unverified')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(container.textContent?.toLowerCase()).toContain('not built here')
  })

  it('a self-delegation is refused honestly and the CTA is disabled', () => {
    expect(planSelf.ok).toBe(false)
    const { container } = render(
      <GovernanceCard position={observedBlank} targetText={ACCOUNT} planResult={planSelf} />,
    )
    expect(govState(container)).toBe('self-delegation')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('a re-delegation to the CURRENT delegate is refused honestly, and the CTA never offers to sign it', () => {
    expect(planAlready.ok).toBe(false)
    const { container } = render(
      <GovernanceCard position={observedDelegated} targetText={DELEGATE} planResult={planAlready} />,
    )
    expect(govState(container)).toBe('already-delegated')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    // The refusal is explained, not just disabled.
    expect(container.textContent?.toLowerCase()).toContain('already delegates')
    // And it is NEVER dressed as a completed delegation.
    expect(cta(container)?.textContent?.toLowerCase()).not.toContain('done')
  })

  it('a valid delegate plan on the verified network drives an actionable sign', () => {
    expect(planDelegate.ok).toBe(true)
    const { container } = render(
      <GovernanceCard position={observedBlank} targetText={DELEGATE} planResult={planDelegate} />,
    )
    const button = cta(container)
    expect(button?.hasAttribute('disabled')).toBe(false)
    expect(button?.textContent?.toLowerCase()).toContain('delegate')
  })
})

describe('GovernanceCard — the delegate/undelegate spine (succeeded ONLY from the read-back)', () => {
  it('submitted: renders the spine with a tx evidence chip, never "Done"', () => {
    const op = submittedOp(DELEGATE_INTENT, ZERO)
    const { container } = render(<GovernanceCard operation={op} position={observedBlank} />)
    expect(opState(container)).toBe('submitted')
    expect(container.querySelector('.fk-spine')).not.toBeNull()
    expect(container.querySelector('.fk-ev[data-kind="flare_tx"]')).not.toBeNull()
    // A submitted delegate is never rendered as done.
    expect(cta(container)?.textContent?.toLowerCase()).not.toContain('done')
  })

  it('awaiting: getDelegateOfAtNow does not yet reflect the target → awaiting_external(flare)', () => {
    const op = reconcileGovernance(submittedOp(DELEGATE_INTENT, ZERO), { delegate: ZERO }, 1000)
    const { container } = render(<GovernanceCard operation={op} position={observedBlank} />)
    expect(opState(container)).toBe('awaiting_external')
    expect(container.textContent).toContain('Flare')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('succeeded: ONLY once getDelegateOfAtNow reflects the delegated target', () => {
    const op = reconcileGovernance(submittedOp(DELEGATE_INTENT, ZERO), { delegate: DELEGATE }, 2000)
    const { container } = render(<GovernanceCard operation={op} position={observedDelegated} />)
    expect(opState(container)).toBe('succeeded')
  })

  it('an undelegate spine renders and reaches succeeded when the delegate clears to zero', () => {
    const op = reconcileGovernance(submittedOp(UNDELEGATE_INTENT, DELEGATE), { delegate: ZERO }, 2000)
    const { container } = render(<GovernanceCard operation={op} position={observedBlank} />)
    expect(opState(container)).toBe('succeeded')
  })

  // `reconcileGovernance` never emits `partially_succeeded`, but this is a PUBLISHED component
  // taking an arbitrary GovernanceOperation from any host. Folding it into `succeeded` made the
  // CTA read "Done" — a full-success claim the operation state does not make.
  it('partially_succeeded is NOT rendered as "Done" — a partial success is not a success claim', () => {
    const op = applyTransition(submittedOp(DELEGATE_INTENT, ZERO), { to: 'partially_succeeded', at: 3000 }).record
    expect(op.state).toBe('partially_succeeded')
    const { container } = render(<GovernanceCard operation={op} position={observedBlank} />)
    expect(govState(container)).toBe('partially-succeeded')
    expect(cta(container)?.textContent?.toLowerCase()).not.toContain('done')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })
})
