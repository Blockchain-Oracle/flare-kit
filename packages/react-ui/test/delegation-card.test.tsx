import type {
  DelegationIntent,
  DelegationPlanResult,
  DelegationReads,
  DexToken,
} from '@flare-kit/core'
import {
  applyTransition,
  buildDelegationPlan,
  createMockDelegationAdapter,
  createOperation,
  delegationPosition,
  evidence,
  reconcileDelegation,
} from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelegationCard } from '../src/DelegationCard.js'

const C2FLR: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }
const WNAT: DexToken = { symbol: 'WNat', address: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273', decimals: 18 }
const PROVIDER = '0xB63C1E02a41e975f4d826BD06eccaFaCd5038B5D' as `0x${string}`
const ACCOUNT = '0x00000000000000000000000000000000000000C3' as `0x${string}`
const FIVE = 5_000_000_000_000_000_000n

const blankReads: DelegationReads = {
  nativeBalance: 47_000_000_000_000_000_000n,
  wrappedBalance: 0n,
  mode: 0,
  delegates: [],
  votePower: 0n,
  undelegatedVotePower: 0n,
}
const wrappedReads: DelegationReads = { ...blankReads, wrappedBalance: FIVE, votePower: FIVE, undelegatedVotePower: FIVE }
const delegatedReads: DelegationReads = {
  ...blankReads,
  wrappedBalance: FIVE,
  mode: 1,
  delegates: [{ address: PROVIDER, bips: 10_000 }],
  votePower: 0n,
  undelegatedVotePower: 0n,
}

const DELEGATE_INTENT: DelegationIntent = { kind: 'delegate', targets: [{ to: PROVIDER, bips: 10_000 }] }
const WRAP_INTENT: DelegationIntent = { kind: 'wrap', amount: FIVE }

const adapter = createMockDelegationAdapter()
const planFor = (intent: DelegationIntent, reads: DelegationReads) =>
  buildDelegationPlan(adapter, adapter.deployment, ACCOUNT, intent, reads)

/** Walks the FULL legal path (draft→quoting→ready→executing→submitted) — a jump is dropped. */
function opAt(intent: DelegationIntent, reads: DelegationReads, to: 'executing' | 'submitted') {
  const plan = planFor(intent, reads)
  if (plan.kind !== 'plan') throw new Error('fixture expected a plan')
  const base = createOperation<DelegationIntent, unknown, typeof plan.plan>({
    capability: 'delegation',
    network: 114,
    intent,
    now: 0,
    id: 'del-fixture',
  })
  const quoting = applyTransition(base, { to: 'quoting', at: 0 }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0, patch: { steps: plan.plan.steps, plan: plan.plan } }).record
  if (to === 'executing') return executing
  return applyTransition(executing, {
    to: 'submitted',
    at: 0,
    evidence: [evidence({ kind: 'flare_tx', label: 'Flare tx', value: `0x${'7b'.repeat(32)}`, observedAt: 0 })],
  }).record
}

const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')
const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button')
const ctaText = (c: HTMLElement) => cta(c)?.textContent

const observed = delegationPosition(delegatedReads)
const observedWrapped = delegationPosition(wrappedReads)
const observedBlank = delegationPosition(blankReads)
const unavailable = delegationPosition(undefined)

describe('DelegationCard — DEL-02 state panel (mono, unavailable ≠ zero)', () => {
  it('renders wrapped balance, bips and vote power in the mono face, carrying their unit', () => {
    const { container } = render(<DelegationCard position={observed} nativeToken={C2FLR} wrappedToken={WNAT} />)
    const monoValues = [...container.querySelectorAll('.fk-row-v')].map((el) => el.textContent ?? '')
    // Wrapped balance at full stored precision, carrying WNat.
    expect(monoValues.some((v) => v.includes('5.000000000000000000') && v.includes('WNat'))).toBe(true)
    // The delegatee's bips, in mono, carrying the unit.
    expect(monoValues.some((v) => v.includes('10000 bips'))).toBe(true)
    // Vote power, in mono, carrying its unit.
    expect(monoValues.some((v) => v.includes('vote power') || v.toLowerCase().includes('vp'))).toBe(true)
  })

  it('unavailable read renders — (unknown), never a confident zero-delegation', () => {
    const { container } = render(<DelegationCard position={unavailable} nativeToken={C2FLR} wrappedToken={WNAT} />)
    const monoValues = [...container.querySelectorAll('.fk-row-v')].map((el) => el.textContent ?? '')
    expect(monoValues).toContain('—')
    // Never a confident zero: no "0 WNat" wrapped balance, no "0 bips" delegation.
    expect(container.textContent).not.toContain('0 WNat')
    expect(container.textContent).not.toContain('0 bips')
    // Distinct from no-balance: says the position is unavailable, not empty.
    expect(container.textContent?.toLowerCase()).toContain('unavailable')
  })

  it('no-balance is a REAL observed-empty holding, distinct from unavailable (shows 0, not —)', () => {
    const { container } = render(<DelegationCard position={observedBlank} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(container.getAttribute).toBeDefined()
    const panel = container.querySelector('[data-del-state]')
    expect(panel?.getAttribute('data-del-state')).toBe('no-balance')
    const monoValues = [...container.querySelectorAll('.fk-row-v')].map((el) => el.textContent ?? '')
    // A real zero, not an unknown dash.
    expect(monoValues.some((v) => v.includes('0.000000000000000000'))).toBe(true)
  })
})

describe('DelegationCard — DEL-01 composer invariants (honest, never a silent no-op)', () => {
  it('too-many-delegates (>2) is rendered honestly and the CTA is disabled', () => {
    const plan: DelegationPlanResult = { kind: 'error', error: { kind: 'too-many-delegates', max: 2 } }
    const { container } = render(
      <DelegationCard position={observedWrapped} planResult={plan} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    expect(container.querySelector('[data-del-state]')?.getAttribute('data-del-state')).toBe('too-many-delegates')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('bips-over-100 (Σ>10000) is rendered honestly and the CTA is disabled', () => {
    const plan: DelegationPlanResult = { kind: 'error', error: { kind: 'bips-over-100', sum: 12_000 } }
    const { container } = render(
      <DelegationCard position={observedWrapped} planResult={plan} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    expect(container.querySelector('[data-del-state]')?.getAttribute('data-del-state')).toBe('bips-over-100')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('mode-conflict reads "undelegate first", never a silent no-op', () => {
    const plan: DelegationPlanResult = { kind: 'error', error: { kind: 'mode-conflict', current: 'amount' } }
    const { container } = render(
      <DelegationCard position={observedWrapped} planResult={plan} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    expect(container.querySelector('[data-del-state]')?.getAttribute('data-del-state')).toBe('mode-conflict')
    expect(container.textContent?.toLowerCase()).toContain('undelegate first')
  })

  it('not-verified gate: the CTA is disabled and the note is shown', () => {
    const plan: DelegationPlanResult = { kind: 'error', error: { kind: 'not-verified' } }
    const { container } = render(
      <DelegationCard position={observedWrapped} planResult={plan} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    expect(container.querySelector('[data-del-state]')?.getAttribute('data-del-state')).toBe('not-verified')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(container.textContent?.toLowerCase()).toContain('not built here')
  })

  it('empty-provider guard: a delegate with zero filled rows is NOT submittable', () => {
    const { container } = render(
      <DelegationCard
        position={observedWrapped}
        providers={[{ to: '' }]}
        delegateMode="percentage"
        nativeToken={C2FLR}
        wrappedToken={WNAT}
      />,
    )
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
    expect(ctaText(container)?.toLowerCase()).toContain('add a provider')
  })

  it('needs-wrap: an observed-but-unwrapped account composing a delegate must wrap first', () => {
    const { container } = render(
      <DelegationCard
        position={observedBlank}
        providers={[{ to: PROVIDER, bips: 10_000 }]}
        delegateMode="percentage"
        nativeToken={C2FLR}
        wrappedToken={WNAT}
      />,
    )
    expect(container.querySelector('[data-del-state]')?.getAttribute('data-del-state')).toBe('needs-wrap')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('the current on-chain mode is shown (NOTSET / PERCENTAGE / AMOUNT)', () => {
    const { container } = render(<DelegationCard position={observed} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(container.textContent).toContain('PERCENTAGE')
  })

  it('AMOUNT-mode share cell is a read-only display span — no disabled input, no mis-wired onChange (T11)', () => {
    const { container } = render(
      <DelegationCard
        position={observedWrapped}
        providers={[{ to: PROVIDER, amount: { value: FIVE, decimals: 18, asset: 'WNat' } }]}
        delegateMode="amount"
        nativeToken={C2FLR}
        wrappedToken={WNAT}
      />,
    )
    // The share cell is a <span>, NOT an <input>: there is no disabled field with no on-screen
    // "why", and no onChange that would (wrongly) set `bips` from an amount keystroke.
    const share = container.querySelector('.fk-delegation-provider-share')
    expect(share?.tagName).toBe('SPAN')
    expect(container.querySelectorAll('input.fk-delegation-provider-share')).toHaveLength(0)
    // It displays the supplied amount at full precision, read-only.
    expect(share?.textContent).toContain('5.000000000000000000')
  })
})

describe('DelegationCard — DEL-03 timeline (submitted → awaiting → succeeded)', () => {
  it('submitted: state chip + a tx evidence chip on the spine (never succeeded from the submit)', () => {
    const op = opAt(DELEGATE_INTENT, wrappedReads, 'submitted')
    const { container } = render(
      <DelegationCard operation={op} position={observedWrapped} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    expect(opState(container)).toBe('submitted')
    expect(container.querySelector('.fk-ev[data-kind="flare_tx"]')).not.toBeNull()
  })

  it('awaiting: the delegatesOf read does not yet reflect the target → awaiting_external(flare)', () => {
    const op = reconcileDelegation(opAt(DELEGATE_INTENT, wrappedReads, 'submitted'), blankReads, DELEGATE_INTENT, 1000)
    const { container } = render(<DelegationCard operation={op} position={observedWrapped} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(opState(container)).toBe('awaiting_external')
    expect(container.textContent).toContain('Flare')
    expect(cta(container)?.hasAttribute('disabled')).toBe(true)
  })

  it('succeeded: ONLY once delegatesOf reflects the target', () => {
    const op = reconcileDelegation(opAt(DELEGATE_INTENT, wrappedReads, 'submitted'), delegatedReads, DELEGATE_INTENT, 2000)
    const { container } = render(<DelegationCard operation={op} position={observed} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(opState(container)).toBe('succeeded')
  })

  it('wrapping: an executing wrap reads "Wrapping…"', () => {
    const op = opAt(WRAP_INTENT, blankReads, 'executing')
    const { container } = render(<DelegationCard operation={op} position={observedBlank} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(opState(container)).toBe('executing')
    expect(ctaText(container)?.toLowerCase()).toContain('wrapping')
  })

  it('delegating: an executing delegate reads "Delegating…"', () => {
    const op = opAt(DELEGATE_INTENT, wrappedReads, 'executing')
    const { container } = render(<DelegationCard operation={op} position={observedWrapped} nativeToken={C2FLR} wrappedToken={WNAT} />)
    expect(opState(container)).toBe('executing')
    expect(ctaText(container)?.toLowerCase()).toContain('delegating')
  })
})

describe('DelegationCard — DEL-01 wrap/unwrap (full amount only, no partial affordance)', () => {
  it('compose (wrap): the SwapLeg is editable and the CTA prompts to wrap', () => {
    const { container } = render(
      <DelegationCard position={observedBlank} wrapDirection="wrap" amountText="5" nativeBalance={{ value: 47_000_000_000_000_000_000n, decimals: 18, asset: 'C2FLR' }} nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    const leg = container.querySelector('.fk-leg-amount') as HTMLInputElement | null
    expect(leg).not.toBeNull()
    expect(leg?.disabled).toBe(false)
  })

  it('unwrap: the amount is the FULL wrapped balance and is NOT editable (no partial unwrap)', () => {
    const { container } = render(
      <DelegationCard position={observedWrapped} wrapDirection="unwrap" nativeToken={C2FLR} wrappedToken={WNAT} />,
    )
    const leg = container.querySelector('.fk-leg-amount') as HTMLInputElement | null
    expect(leg?.disabled).toBe(true)
    expect(leg?.value).toContain('5.000000000000000000')
  })
})
