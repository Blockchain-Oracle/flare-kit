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
  buildInstructionCatalogue,
  mockInstructionCatalogue,
  mockInstructionRecord,
  mockObservation,
  mockPlan,
  planInstruction,
  proofDeadlineMs,
  reconcileInstruction,
  smartAccountsFor,
} from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstructionCatalogue } from '../src/InstructionCatalogue.js'
import { InstructionComposer } from '../src/InstructionComposer.js'
import { SmartAccountCard } from '../src/SmartAccountCard.js'
import type { SmartAccountNetworkView } from '../src/smart-account-card-state.js'

/**
 * The M13 surfaces, driven through the honesty rules that decide whether they may ship.
 *
 * Every fixture comes from the observed live runs and the real planner/reconciler, so a test
 * passing here means the SHIPPED code path produced the rendering — not that a hand-built
 * prop object happened to render. The assertions are deliberately about what must NEVER be on
 * screen (a confident zero, a "retry" on a dead operation, a success claimed from a submit),
 * because those are the failures a screenshot review is worst at catching.
 */

const COSTON2 = smartAccountsFor('coston2')
const FLARE = smartAccountsFor('flare')

const coston2View = (account: SmartAccountNetworkView['account']): SmartAccountNetworkView => ({
  deployment: COSTON2,
  networkLabel: 'Coston2',
  nativeSymbol: 'C2FLR',
  settings: OBSERVED_SETTINGS,
  account,
})

const MAINNET_VIEW: SmartAccountNetworkView = {
  deployment: FLARE,
  networkLabel: 'Flare Mainnet',
  nativeSymbol: 'FLR',
  settings: OBSERVED_MAINNET_SETTINGS,
  account: OBSERVED_MAINNET_ACCOUNT,
}

const OWNER = OBSERVED_ACCOUNT_LIVE.xrplOwner
const CLOCK = { now: SMART_ACCOUNT_MOCK_EPOCH, proofWindowSeconds: OBSERVED_SETTINGS.proofValidityDurationSeconds }
const settledOf = (run: typeof OBSERVED_TRANSFER | typeof OBSERVED_DEPOSIT) =>
  reconcileInstruction(mockInstructionRecord(run.intent), mockObservation(run, 'settled'), CLOCK)

describe('SmartAccountCard — an unread value is never a zero', () => {
  it('renders — for unread fields and the real value for an observed zero', () => {
    const unread = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[{ ...coston2View(undefined), settings: undefined }]} />,
    )
    const unreadText = unread.container.textContent ?? ''
    expect(unreadText).toContain('—')
    // The blank-slate account genuinely holds 0 and reads nonce 0. Those are answers, and
    // they must render as themselves rather than borrowing the unread mark.
    const observed = render(<SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_BLANK)]} />)
    expect(observed.container.textContent).toContain('0 drops')
    expect(observed.container.querySelector('[data-deployment="not-deployed"]')).toBeTruthy()
  })

  it('never claims not-deployed when the code read failed', () => {
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[coston2View({ ...OBSERVED_ACCOUNT_LIVE, deployed: undefined })]}
      />,
    )
    expect(container.querySelector('[data-deployment="unknown"]')).toBeTruthy()
    expect(container.querySelector('[data-deployment="not-deployed"]')).toBeFalsy()
    expect(container.textContent).not.toContain('Not deployed yet')
  })
})

describe('SmartAccountCard — the identical-address property is compared, not claimed', () => {
  it('reports identical only when BOTH networks answered', () => {
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE), MAINNET_VIEW]} />,
    )
    expect(container.querySelector('[data-parity="identical"]')).toBeTruthy()
    expect(container.textContent).toContain(OBSERVED_ACCOUNT_LIVE.address)
  })

  it('refuses to compare when one side is unread — never rendering that as agreement', () => {
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[{ ...coston2View(undefined), settings: undefined }, MAINNET_VIEW]}
      />,
    )
    expect(container.querySelector('[data-parity="not-comparable"]')).toBeTruthy()
    expect(container.textContent).not.toContain('The same address on both networks')
  })

  it('is loud when the two networks genuinely disagree', () => {
    const other = { ...OBSERVED_MAINNET_ACCOUNT, address: '0x00000000000000000000000000000000000000AA' as const }
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[coston2View(OBSERVED_ACCOUNT_LIVE), { ...MAINNET_VIEW, account: other }]}
      />,
    )
    expect(container.querySelector('[data-parity="differs"]')).toBeTruthy()
    expect(container.textContent).toContain('Do not fund either address')
  })

  it('treats a checksum difference as the same address, not a disagreement', () => {
    const lower = { ...OBSERVED_MAINNET_ACCOUNT, address: OBSERVED_ACCOUNT_LIVE.address.toLowerCase() as `0x${string}` }
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[coston2View(OBSERVED_ACCOUNT_LIVE), { ...MAINNET_VIEW, account: lower }]}
      />,
    )
    expect(container.querySelector('[data-parity="identical"]')).toBeTruthy()
  })
})

describe('SmartAccountCard — an incomplete history is not an empty one', () => {
  it('states a failed scan as unknown rather than showing no rows', () => {
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]} historyError="The node refused the range." />,
    )
    expect(container.textContent).toContain('History unavailable')
    expect(container.textContent).not.toContain('found no instruction')
  })

  it('states a completed empty scan as a real answer', () => {
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_BLANK)]} history={[]} />,
    )
    expect(container.textContent).toContain('found no instruction')
    expect(container.textContent).not.toContain('History unavailable')
  })

  it('draws no history block at all when no scan was asked for', () => {
    const { container } = render(<SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]} />)
    expect(container.querySelector('.fk-sa-history')).toBeFalsy()
  })
})

describe('InstructionCatalogue — availability is read, and its three negatives stay three', () => {
  it('renders every built-in with the deployment’s own fee, never a default', () => {
    const { container } = render(<InstructionCatalogue rows={mockInstructionCatalogue()} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(11)
    expect(container.querySelector('[data-instruction="0x01"]')?.getAttribute('data-availability')).toBe('available')
    expect(container.querySelector('[data-instruction="0x00"]')?.getAttribute('data-availability')).toBe('superseded')
  })

  it('renders an unread fee as — rather than the default fee', () => {
    // Mainnet proves why this matters: five ids charge 950000 against a 500000 default, so a
    // substituted default is a wrong price, not a harmless placeholder.
    const rows = buildInstructionCatalogue({ ...OBSERVED_MAINNET_SETTINGS, instructionFees: {} })
    const { container } = render(<InstructionCatalogue rows={rows} />)
    const fee = container.querySelector('[data-instruction="0x00"] .fk-sa-row-fee')
    expect(fee?.textContent).toBe('—')
    expect(fee?.textContent).not.toContain('500000')
  })

  it('keeps unknown distinct from unavailable', () => {
    const unknown = render(<InstructionCatalogue rows={buildInstructionCatalogue(undefined)} />)
    expect(
      [...unknown.container.querySelectorAll('tbody tr')].every(
        (row) => row.getAttribute('data-availability') === 'unknown',
      ),
    ).toBe(true)

    const noVaults = render(<InstructionCatalogue rows={buildInstructionCatalogue({ ...OBSERVED_SETTINGS, vaults: [] })} />)
    expect(noVaults.container.querySelector('[data-instruction="0x11"]')?.getAttribute('data-availability')).toBe(
      'unavailable',
    )
  })

  it('states a reason once when every row shares it, and per row when they differ', () => {
    const shared = render(<InstructionCatalogue rows={buildInstructionCatalogue(undefined)} />)
    expect(shared.container.querySelectorAll('.fk-sa-row-reason')).toHaveLength(0)
    expect(shared.container.textContent).toContain('Every row here says the same thing')

    // The live shape: three superseded rows and eight available ones do NOT share a reason,
    // so each keeps its own — the dedupe must not swallow a genuinely per-row fact.
    const live = render(<InstructionCatalogue rows={mockInstructionCatalogue()} />)
    expect(live.container.querySelectorAll('.fk-sa-row-reason').length).toBeGreaterThan(0)
  })
})

describe('InstructionComposer — the whole chain, before an irreversible payment', () => {
  const plan = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)

  it('shows all 32 memo bytes, untruncated, and states the destination-tag prohibition', () => {
    const { container } = render(<InstructionComposer planResult={plan} now={SMART_ACCOUNT_MOCK_EPOCH} />)
    expect(container.textContent).toContain(OBSERVED_TRANSFER.reference)
    expect(container.textContent).toContain('No destination tag')
  })

  it('shows no deadline before the payment lands, and a wall-clock instant after', () => {
    const before = render(<InstructionComposer planResult={plan} now={SMART_ACCOUNT_MOCK_EPOCH} />)
    expect(before.container.textContent).toContain('The proof window starts when the payment lands')

    const paid = mockObservation(OBSERVED_TRANSFER, 'paid')
    const deadline = proofDeadlineMs(paid, OBSERVED_SETTINGS.proofValidityDurationSeconds)!
    const after = render(
      <InstructionComposer
        planResult={plan}
        record={reconcileInstruction(mockInstructionRecord(OBSERVED_TRANSFER.intent), paid, CLOCK)}
        proofDeadline={deadline}
        now={SMART_ACCOUNT_MOCK_EPOCH}
      />,
    )
    expect(after.container.textContent).toContain('Usable until')
  })

  it('offers a declared-unbuilt affordance on an unverified network, and no button at all', () => {
    const refused = planInstruction({
      deployment: FLARE,
      settings: OBSERVED_MAINNET_SETTINGS,
      catalogue: buildInstructionCatalogue(OBSERVED_MAINNET_SETTINGS),
      personalAccount: OBSERVED_MAINNET_ACCOUNT,
      intent: OBSERVED_TRANSFER.intent,
      replayed: false,
      balanceRequested: true,
    })
    const { container } = render(<InstructionComposer planResult={refused} now={SMART_ACCOUNT_MOCK_EPOCH} />)
    expect(container.querySelector('.fk-unbuilt')).toBeTruthy()
    expect(container.querySelector('.fk-panel-action')).toBeFalsy()
  })

  it('never reaches a success word from a submitted dispatch', () => {
    const submitted = reconcileInstruction(
      mockInstructionRecord(OBSERVED_TRANSFER.intent),
      mockObservation(OBSERVED_TRANSFER, 'submitted'),
      CLOCK,
    )
    const { container } = render(
      <InstructionComposer planResult={plan} record={submitted} now={SMART_ACCOUNT_MOCK_EPOCH} />,
    )
    expect(container.querySelector('[data-op-state="awaiting_external"]')).toBeTruthy()
    // The chip is where a success claim would surface first, so it is asserted on directly
    // rather than through the whole subtree's text.
    expect(container.querySelector('.fk-chip[data-state]')?.textContent).not.toContain('Succeeded')
    expect(container.textContent).not.toContain('Instruction executed')
  })
})

describe('InstructionComposer — a dead operation invites nothing', () => {
  const paid = mockObservation(OBSERVED_TRANSFER, 'paid')
  const deadline = proofDeadlineMs(paid, OBSERVED_SETTINGS.proofValidityDurationSeconds)!
  const expired = reconcileInstruction(mockInstructionRecord(OBSERVED_TRANSFER.intent), paid, {
    now: deadline + 60_000,
    proofWindowSeconds: OBSERVED_SETTINGS.proofValidityDurationSeconds,
  })

  it('states where the funds are, that this is terminal, and offers no enabled control', () => {
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={expired}
        proofDeadline={deadline}
        now={deadline + 60_000}
      />,
    )
    expect(expired.state).toBe('expired')
    expect(container.textContent).toContain('Your XRP is at the operator’s wallet')
    expect(container.textContent).toContain('a NEW payment')
    expect([...container.querySelectorAll('button')].every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    expect(container.textContent?.toLowerCase()).not.toContain('retry')
  })

  it('shows no countdown, because Countdown reads “Ready” at zero', () => {
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={expired}
        proofDeadline={deadline}
        now={deadline + 60_000}
      />,
    )
    expect(container.querySelector('.fk-countdown')).toBeFalsy()
    expect(container.textContent).not.toContain('Ready')
  })

  it('does not claim the operation is progressing safely on its own', () => {
    // The shared RecoveryPanel said exactly that for `expired`, which is non-terminal in the
    // canonical table by design (an expired QUOTE is re-quotable). Here it would be false.
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={expired}
        proofDeadline={deadline}
        now={deadline + 60_000}
      />,
    )
    expect(container.textContent).not.toContain('nothing is at risk')
    expect(container.textContent).not.toContain('progressing on its own')
  })
})

describe('InstructionComposer — who dispatched is a separate fact from whether it worked', () => {
  it('marks the live deposit as executed by another submitter, without calling it a failure', () => {
    const record = settledOf(OBSERVED_DEPOSIT)
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_DEPOSIT.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={record}
        dispatchedByUs={OBSERVED_DEPOSIT.dispatchedByUs}
        dispatchedBy={OBSERVED_DEPOSIT.dispatchedBy}
        now={SMART_ACCOUNT_MOCK_EPOCH}
      />,
    )
    expect(record.state).toBe('succeeded')
    expect(container.textContent).toContain('Dispatched by another submitter')
    expect(container.textContent).toContain(OBSERVED_DEPOSIT.dispatchedBy)
    expect(container.textContent).not.toContain('Failed')
  })

  it('claims nothing about the submitter when it was not established', () => {
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={settledOf(OBSERVED_TRANSFER)}
        now={SMART_ACCOUNT_MOCK_EPOCH}
      />,
    )
    expect(container.textContent).not.toContain('Dispatched by another submitter')
  })

  it('says so when an in-flight operation is being watched by nothing', () => {
    const submitted = reconcileInstruction(
      mockInstructionRecord(OBSERVED_TRANSFER.intent),
      mockObservation(OBSERVED_TRANSFER, 'submitted'),
      CLOCK,
    )
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={submitted}
        reconciling={false}
        now={SMART_ACCOUNT_MOCK_EPOCH}
      />,
    )
    expect(container.textContent).toContain('Nothing is watching this right now')
  })
})
