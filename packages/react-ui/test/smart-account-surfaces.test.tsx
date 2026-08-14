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
} from '@flarekit-dev/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstructionCatalogue } from '../src/InstructionCatalogue.js'
import { InstructionComposer } from '../src/InstructionComposer.js'
import { SmartAccountCard } from '../src/SmartAccountCard.js'
import { INSTRUCTION_STEP_EVIDENCE } from '../src/instruction-composer-state.js'
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

/**
 * One row's value, by its label.
 *
 * Card-wide `toContain` is not good enough for the rules this file exists to pin, and the
 * 2026-08-14 test review proved it: `expect(text).toContain('0 drops')` passed off the
 * DEFAULT INSTRUCTION FEE row — `"1000 drops"` contains `"0 drops"` — so the assertion named
 * after this milestone's headline honesty rule could not fail. Exact equality on the named
 * row is the only form that distinguishes `—` from `0`.
 */
const rowValue = (container: HTMLElement, label: string): string | null | undefined =>
  [...container.querySelectorAll('.fk-row')]
    .find((row) => row.querySelector('.fk-row-k')?.textContent === label)
    ?.querySelector('.fk-row-v')?.textContent
const CLOCK = { now: SMART_ACCOUNT_MOCK_EPOCH, proofWindowSeconds: OBSERVED_SETTINGS.proofValidityDurationSeconds }
const settledOf = (run: typeof OBSERVED_TRANSFER | typeof OBSERVED_DEPOSIT) =>
  reconcileInstruction(mockInstructionRecord(run.intent), mockObservation(run, 'settled'), CLOCK)

describe('SmartAccountCard — an unread value is never a zero', () => {
  it('renders — for unread fields and the real value for an observed zero', () => {
    // Both directions of the rule, pinned to their own rows so neither can pass off another
    // row's text. `unreadOr` returning `'0'` for unread, or `'—'` for a real zero, now fails.
    const unread = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[{ ...coston2View(undefined), settings: undefined }]} />,
    )
    expect(rowValue(unread.container, 'FAsset balance')).toBe('—')
    expect(rowValue(unread.container, 'Memo nonce')).toBe('—')

    // The blank-slate account genuinely holds 0 and reads nonce 0. Those are answers, and
    // they must render as themselves rather than borrowing the unread mark.
    const observed = render(<SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_BLANK)]} />)
    expect(rowValue(observed.container, 'FAsset balance')).toBe('0 drops')
    expect(rowValue(observed.container, 'Memo nonce')).toBe('0')
    expect(observed.container.querySelector('[data-deployment="not-deployed"]')).toBeTruthy()
  })

  it('keeps unread and observed fields apart within ONE account — the common case', () => {
    // Every field of `PersonalAccountState` carries its own `undefined`, and a partial read
    // is ordinary rather than exotic: no FAsset token supplied means no balance at all.
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[coston2View({ ...OBSERVED_ACCOUNT_LIVE, fassetBalance: undefined, nonce: undefined })]}
      />,
    )
    expect(rowValue(container, 'FAsset balance')).toBe('—')
    expect(rowValue(container, 'Memo nonce')).toBe('—')
    // …while a field that DID read still shows its real value on the same card.
    expect(rowValue(container, 'Gas balance')).toBe('0.000000000000000000 C2FLR')
  })

  it('keeps the pinned executor’s three answers apart', () => {
    // `undefined` is unread, the zero address is a REAL "nothing is pinned", and anything
    // else is an executor. Collapsing the middle one renders a link to 0x000…000 as though
    // an executor were pinned.
    const unread = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View({ ...OBSERVED_ACCOUNT_LIVE, pinnedExecutor: undefined })]} />,
    )
    expect(rowValue(unread.container, 'Pinned executor')).toBe('—')

    const none = render(<SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]} />)
    expect(rowValue(none.container, 'Pinned executor')).toBe('None pinned')

    const pinned = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[coston2View({ ...OBSERVED_ACCOUNT_LIVE, pinnedExecutor: '0x00000000000000000000000000000000000000C3' })]}
      />,
    )
    expect(pinned.container.querySelector('[aria-label*="0x00000000000000000000000000000000000000C3"], .fk-xl')).toBeTruthy()
    expect(rowValue(pinned.container, 'Pinned executor')).not.toBe('None pinned')
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

describe('SmartAccountCard — an empty read is not an absent one', () => {
  it('calls an empty operator-wallet list a deployment gap, not an unread value', () => {
    // `settings` being defined proves the read landed, so `[]` means the controller registers
    // no wallet — the planner refuses that by name. Rendering `—` said "we could not look".
    const { container } = render(
      <SmartAccountCard
        xrplOwner={OWNER}
        networks={[{ ...coston2View(OBSERVED_ACCOUNT_LIVE), settings: { ...OBSERVED_SETTINGS, xrplProviderWallets: [] } }]}
      />,
    )
    expect(container.textContent).toContain('None registered')
    expect(container.textContent).toContain('no destination a payment could reach')
  })

  it('still renders — for the wallet list when the controller itself did not read', () => {
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[{ ...coston2View(OBSERVED_ACCOUNT_LIVE), settings: undefined }]} />,
    )
    expect(container.textContent).not.toContain('None registered')
    expect(container.textContent).toContain('—')
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

  it('never claims agreement from ONE network', () => {
    // A two-network property asserted from a single read is the failure this module exists
    // to prevent, and `networks.length < 2` is the only thing standing in its way.
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]} />,
    )
    expect(container.querySelector('[data-parity="not-comparable"]')).toBeTruthy()
    expect(container.textContent).not.toContain('The same address on both networks')
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

  it('keeps a dispatch the codec could not parse in the history', () => {
    // A row that vanished because its reference did not decode would be the account's own
    // record quietly losing a real instruction — read right before someone decides whether
    // to pay again. Both rows must survive, with their identifiers.
    const rows = [
      {
        personalAccount: OBSERVED_ACCOUNT_LIVE.address,
        transactionId: `0x${OBSERVED_TRANSFER.xrplTransactionId.toLowerCase()}` as `0x${string}`,
        paymentReference: OBSERVED_TRANSFER.reference,
        instructionId: 0x01,
        action: 'transfer',
        blockNumber: OBSERVED_TRANSFER.dispatchBlock,
        transactionHash: OBSERVED_TRANSFER.dispatchHash as `0x${string}`,
      },
      {
        personalAccount: OBSERVED_ACCOUNT_LIVE.address,
        transactionId: `0x${OBSERVED_DEPOSIT.xrplTransactionId.toLowerCase()}` as `0x${string}`,
        paymentReference: OBSERVED_DEPOSIT.reference,
        // Neither could be read off the log — the row is still a dispatch that happened.
        instructionId: undefined,
        action: undefined,
        blockNumber: undefined,
        transactionHash: undefined,
      },
    ]
    const { container } = render(
      <SmartAccountCard xrplOwner={OWNER} networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]} history={rows} />,
    )
    const [parsed, unparsed] = [...container.querySelectorAll('.fk-sa-history-row')]
    expect(container.querySelectorAll('.fk-sa-history-row')).toHaveLength(2)

    // The row the codec understood: its id, its action and both transaction identifiers.
    expect(parsed?.textContent).toContain('0x01')
    expect(parsed?.textContent).toContain('transfer')
    expect(parsed?.textContent).toContain('block 34018235')

    // The one it did not: it SURVIVES, named as unrecognised, still carrying the payment it
    // refers to. An unread id and an unread block are `—`, never a confident `0x00` or
    // `block 0` — `0x00` is a real instruction and would name the wrong one.
    expect(unparsed?.textContent).toContain('unrecognised instruction')
    expect(unparsed?.textContent).toContain('aa78f5fb')
    expect(unparsed?.textContent).not.toContain('0x00')
    expect(unparsed?.textContent).not.toContain('block 0')
    expect(unparsed?.textContent).toContain('—')
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

  it('offers selection ONLY for instructions this deployment can serve', () => {
    // The gate on `selectable`. Without it, a superseded or unavailable row becomes a
    // clickable path toward composing an instruction the controller refuses — after the XRP
    // has left. The planner refuses it too, but a surface should not route there at all.
    const { container } = render(
      <InstructionCatalogue rows={mockInstructionCatalogue()} onSelect={() => {}} />,
    )
    expect(container.querySelector('[data-instruction="0x01"] button')).toBeTruthy()
    expect(container.querySelector('[data-instruction="0x00"] button')).toBeFalsy()
    expect(container.querySelector('[data-instruction="0x10"] button')).toBeFalsy()
  })

  it('renders the deployment’s own per-id fee, not its default', () => {
    // The READ half of the no-fallback rule. Mainnet charges 950000 for four ids against a
    // 500000 default, so a renderer quoting the default would under-pay by 450000 drops —
    // and the payment is already gone when the controller refuses the proof.
    const { container } = render(<InstructionCatalogue rows={buildInstructionCatalogue(OBSERVED_MAINNET_SETTINGS)} />)
    expect(container.querySelector('[data-instruction="0x00"] .fk-sa-row-fee')?.textContent).toBe('950000 drops')
    expect(container.querySelector('[data-instruction="0x01"] .fk-sa-row-fee')?.textContent).toBe('500000 drops')
    // `0x23` specifically: the mock had it at 950 000 and the probe says 500 000. The earlier
    // version of this test asserted the fabricated number, so the test was pinning the bug in
    // place. Rendering it here means the screen and the probe have to agree.
    expect(container.querySelector('[data-instruction="0x23"] .fk-sa-row-fee')?.textContent).toBe('500000 drops')
  })

  it('renders an unread fee as — rather than the default fee', () => {
    // Mainnet proves why this matters: four ids charge 950000 against a 500000 default, so a
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

  it('never renders a never-attempted read as an empty catalogue', () => {
    // A table with a header and no rows is a CLAIM — "this deployment serves nothing" — made
    // here before anything was read. The vocabulary is eleven rows and never empty.
    const { container } = render(<InstructionCatalogue />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(container.textContent).toContain('No deployment has been read yet')
    expect(container.textContent).toContain('not an empty catalogue')
  })

  it('states a reason once when every row shares it, and per row when they differ', () => {
    const shared = render(<InstructionCatalogue rows={buildInstructionCatalogue(undefined)} />)
    expect(shared.container.querySelectorAll('.fk-sa-row-reason')).toHaveLength(0)
    expect(shared.container.textContent).toContain('Every row here says the same thing')

    // The live shape: three superseded rows and eight available ones do NOT share a reason,
    // so each keeps its own — the dedupe must not swallow a genuinely per-row fact.
    //
    // Counting `.fk-sa-row-reason` was NOT enough and the test review proved it: that class
    // is also on the vault-id and agent-vault-id spans, which render either way, so the
    // count was above zero no matter what the dedupe did. These two assertions are the ones
    // that bite — the reason text must be on the superseded rows themselves, and the
    // shared-reason note must be absent.
    const live = render(<InstructionCatalogue rows={mockInstructionCatalogue()} />)
    const superseded = [...live.container.querySelectorAll('[data-availability="superseded"]')]
    expect(superseded).toHaveLength(3)
    expect(superseded.every((row) => row.textContent?.includes('Superseded:'))).toBe(true)
    expect(live.container.textContent).not.toContain('Every row here says the same thing')
  })
})

describe('InstructionComposer — the whole chain, before an irreversible payment', () => {
  const plan = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)

  it('keys its evidence map off the spine the plan actually produces', () => {
    // Across the package boundary, which is where this can rot silently: core pins the four
    // ids, but `OperationTimeline` yields `[]` for a key it cannot find — so renaming a leg
    // in core and updating only core's assertions drops every identifier off the timeline
    // with a green suite. Nothing else compares these two lists.
    const ids = plan.ok ? [...plan.plan.steps.map((step) => step.id)].sort() : []
    expect(ids).toHaveLength(4)
    expect(Object.keys(INSTRUCTION_STEP_EVIDENCE).sort()).toEqual(ids)
  })

  it('shows all 32 memo bytes, untruncated, and states the destination-tag prohibition', () => {
    const { container } = render(<InstructionComposer planResult={plan} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />)
    expect(container.textContent).toContain(OBSERVED_TRANSFER.reference)
    expect(container.textContent).toContain('No destination tag')
  })

  it('shows no deadline before the payment lands, and a wall-clock instant after', () => {
    const before = render(<InstructionComposer planResult={plan} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />)
    expect(before.container.textContent).toContain('The proof window starts when the payment lands')

    const paid = mockObservation(OBSERVED_TRANSFER, 'paid')
    const deadline = proofDeadlineMs(paid, OBSERVED_SETTINGS.proofValidityDurationSeconds)!
    const after = render(
      <InstructionComposer
        planResult={plan}
        record={reconcileInstruction(mockInstructionRecord(OBSERVED_TRANSFER.intent), paid, CLOCK)}
        proofDeadline={deadline}
        now={SMART_ACCOUNT_MOCK_EPOCH}
        nativeSymbol="C2FLR"
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
    const { container } = render(<InstructionComposer planResult={refused} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />)
    expect(container.querySelector('.fk-unbuilt')).toBeTruthy()
    expect(container.querySelector('.fk-panel-action')).toBeFalsy()
  })

  it('states a NON-unverified refusal and never offers to sign against it', () => {
    // The highest-harm untested state in the milestone: fourteen refusal codes share one
    // path, and only `unverified` had a test. `ctaForInstruction` returning `disabled: false`
    // there would put an enabled "Sign the XRPL payment" on a plan the controller rejects —
    // an irreversible payment against a refusal the kit already knew about.
    const refused = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_LIVE)
    expect(!refused.ok && refused.refusal.code).toBe('recipient_unfunded')

    const { container } = render(<InstructionComposer planResult={refused} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />)
    expect(container.querySelector('[data-refusal="recipient_unfunded"]')).toBeTruthy()
    expect(container.textContent).toContain('The account cannot cover this')
    // The planner's OWN message survives the note's framing — it carries the balance and the
    // amount, and losing it leaves a user with an apology and no numbers.
    expect(container.textContent).toContain('holds 500000')

    const cta = container.querySelector('.fk-panel-action button') as HTMLButtonElement | null
    expect(cta).toBeTruthy()
    expect(cta?.disabled).toBe(true)
    expect(cta?.textContent).not.toContain('Sign')
  })

  it('renders the plan’s warnings before anything is signed', () => {
    // The plan carries `account_undeployed`; core asserts the warning exists, and this is
    // what asserts it reaches the screen. Deleting the map was invisible to the suite.
    const { container } = render(
      <InstructionComposer planResult={plan} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />,
    )
    expect(container.textContent).toContain('The account does not exist yet')
  })

  it('never reaches a success word from a submitted dispatch', () => {
    const submitted = reconcileInstruction(
      mockInstructionRecord(OBSERVED_TRANSFER.intent),
      mockObservation(OBSERVED_TRANSFER, 'submitted'),
      CLOCK,
    )
    const { container } = render(
      <InstructionComposer planResult={plan} record={submitted} now={SMART_ACCOUNT_MOCK_EPOCH} nativeSymbol="C2FLR" />,
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
        nativeSymbol="C2FLR"
      />,
    )
    expect(expired.state).toBe('expired')
    expect(container.textContent).toContain('Your XRP is at the operator’s wallet')
    expect(container.textContent).toContain('a NEW payment')
    // Asserted on the CTA itself, not `.every()` over every button: an empty array satisfies
    // `every`, so deleting the action block entirely would have passed.
    const cta = container.querySelector('.fk-panel-action button') as HTMLButtonElement | null
    expect(cta?.textContent).toBe('Window closed')
    expect(cta?.disabled).toBe(true)
    expect(container.textContent?.toLowerCase()).not.toContain('retry')
  })

  it('shows no countdown, because Countdown reads “Ready” at zero', () => {
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={expired}
        proofDeadline={deadline}
        now={deadline + 60_000}
        nativeSymbol="C2FLR"
      />,
    )
    expect(container.querySelector('.fk-countdown')).toBeFalsy()
    expect(container.textContent).not.toContain('Ready')
  })

  it('drives the recovery panel from the injected clock, not the wall clock', () => {
    // `OperationTimeline` used to render `RecoveryPanel` without `nowMs`, so the panel fell
    // back to `Date.now()` and this surface's determinism promise ended at that boundary.
    // The bug is invisible until a record carries a time-gated action, which is exactly why
    // this test constructs one: at the injected `now` the action is not yet available, and
    // only a real clock could make it say anything else.
    const gated = {
      ...reconcileInstruction(mockInstructionRecord(OBSERVED_TRANSFER.intent), paid, CLOCK),
      recovery: [
        {
          id: 're-request',
          label: 'Re-request the proof',
          effect: 'Asks the Data Connector for the proof again.',
          movesNewValue: false,
          preconditions: [],
          signs: false,
          broadcasts: false,
          nextState: 'awaiting_external' as const,
          availableAt: SMART_ACCOUNT_MOCK_EPOCH + 3_600_000,
        },
      ],
    }
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={gated}
        now={SMART_ACCOUNT_MOCK_EPOCH}
        nativeSymbol="C2FLR"
      />,
    )
    expect(container.textContent).toContain('Not yet')
    expect(container.textContent).toContain('Re-request the proof')
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
        nativeSymbol="C2FLR"
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
        nativeSymbol="C2FLR"
      />,
    )
    expect(record.state).toBe('succeeded')
    expect(container.textContent).toContain('Dispatched by another submitter')
    expect(container.textContent).toContain(OBSERVED_DEPOSIT.dispatchedBy)
    expect(container.textContent).not.toContain('Failed')
  })

  it('does not tell a user another submitter sent a dispatch this kit sent', () => {
    // The transfer WAS ours. A guard of `!== undefined` instead of `=== false` would put the
    // "another submitter" note on our own dispatch — the mirror image of the deposit case.
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={settledOf(OBSERVED_TRANSFER)}
        dispatchedByUs={OBSERVED_TRANSFER.dispatchedByUs}
        now={SMART_ACCOUNT_MOCK_EPOCH}
        nativeSymbol="C2FLR"
      />,
    )
    expect(OBSERVED_TRANSFER.dispatchedByUs).toBe(true)
    expect(container.textContent).not.toContain('Dispatched by another submitter')
  })

  it('claims nothing about the submitter when it was not established', () => {
    const { container } = render(
      <InstructionComposer
        planResult={mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)}
        record={settledOf(OBSERVED_TRANSFER)}
        now={SMART_ACCOUNT_MOCK_EPOCH}
        nativeSymbol="C2FLR"
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
        nativeSymbol="C2FLR"
      />,
    )
    expect(container.textContent).toContain('Nothing is watching this right now')
  })
})
