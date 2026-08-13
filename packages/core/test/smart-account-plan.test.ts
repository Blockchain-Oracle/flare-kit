import { smartAccountsFor } from '@flare-kit/contracts'
import { describe, expect, it } from 'vitest'
import type { DeploymentSettings } from '../src/smart-accounts/adapter.js'
import { buildInstructionCatalogue } from '../src/smart-accounts/catalogue.js'
import type { PersonalAccountState } from '../src/smart-accounts/personal-account.js'
import { planInstruction } from '../src/smart-accounts/plan.js'
import type { InstructionIntent } from '../src/smart-accounts/plan-types.js'

/**
 * `planInstruction`. Every refusal here stands in for a controller revert that would land
 * AFTER the XRP reached the operator, so each test is really asking: would a user have
 * lost a payment without this check?
 */

/** Coston2, but with the flag flipped, so the gate is not the thing under test. */
const VERIFIED = { ...smartAccountsFor('coston2'), smartAccountsVerified: true }

const SETTINGS: DeploymentSettings = {
  xrplProviderWallets: ['rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq'],
  sourceId: 'testXRP',
  sourceIdRaw: '0x7465737458525000000000000000000000000000000000000000000000000000',
  proofValidityDurationSeconds: 86_400n,
  defaultInstructionFee: 1000n,
  paused: false,
  instructionFees: Object.fromEntries(
    [0x00, 0x01, 0x02, 0x10, 0x11, 0x12, 0x13, 0x20, 0x21, 0x22, 0x23].map((id) => [id, 1000n]),
  ),
  vaults: [
    { vaultId: 1, address: '0xC90D6847747b85d1fa2E07859869fb9fB72c0361', vaultType: 'firelight' },
    { vaultId: 2, address: '0x9E63a5D282F2fBb7DcE822B98e363b2719D28319', vaultType: 'upshift' },
  ],
  agentVaults: [{ agentVaultId: 1, address: '0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC' }],
  defaultExecutor: { address: '0x103b384064ae85577127097A7cCadfd6fb13f437', fee: 100_000_000_000n },
}

const ACCOUNT: PersonalAccountState = {
  xrplOwner: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
  address: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
  deployed: true,
  nonce: 0n,
  pinnedExecutor: '0x0000000000000000000000000000000000000000',
  nativeBalance: 0n,
  fassetBalance: 5_000_000n,
}

const TRANSFER: InstructionIntent = {
  xrplOwner: ACCOUNT.xrplOwner,
  instructionId: 0x01,
  value: 1_000_000n,
  recipient: '0xDddF991858311597bFD3D125cb342a0d4B56ea0a',
}

function plan(
  overrides: {
    deployment?: typeof VERIFIED
    settings?: DeploymentSettings | undefined
    account?: PersonalAccountState | undefined
    intent?: InstructionIntent
    replayed?: boolean | undefined
  } = {},
) {
  const settings = 'settings' in overrides ? overrides.settings : SETTINGS
  return planInstruction({
    deployment: overrides.deployment ?? VERIFIED,
    settings,
    catalogue: buildInstructionCatalogue(settings),
    personalAccount: 'account' in overrides ? overrides.account : ACCOUNT,
    intent: overrides.intent ?? TRANSFER,
    replayed: 'replayed' in overrides ? overrides.replayed : false,
  })
}

describe('the plan carries the whole chain before approval', () => {
  it('names the operator wallet, the fee, the reference and what the account will do', () => {
    const result = plan()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.destination).toBe('rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq')
    expect(result.plan.feeDrops).toBe(1000n)
    expect(result.plan.amountDrops).toBe(1000n)
    expect(result.plan.sourceId).toBe('testXRP')
    expect(result.plan.proofWindowSeconds).toBe(86_400n)
    expect(result.plan.reference).toMatch(/^0x01/)
    // The full sentence, recipient included. This is the line telling a user where their
    // FAsset is about to go; asserting only that it contains "transfer" passes even when
    // the amount and the recipient are swapped.
    expect(result.plan.downstream).toBe(
      'The personal account will transfer 1000000 drops of the FAsset to 0xDddF991858311597bFD3D125cb342a0d4B56ea0a.',
    )
    expect(result.plan.warnings).toEqual([])
  })

  it('pins the amount the user actually signs, not the fee', () => {
    // An over-payment is legal — the controller checks `receivedAmount >= fee`. Returning
    // `feeDrops` here instead would silently sign a smaller payment than the user chose.
    const result = plan({ intent: { ...TRANSFER, amountDrops: 5000n } })
    expect(result.ok && result.plan.amountDrops).toBe(5000n)
    expect(result.ok && result.plan.feeDrops).toBe(1000n)
  })

  it('names the vault in the downstream line for a deposit', () => {
    const result = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x11, value: 500_000n, vaultId: 1 },
    })
    expect(result.ok && result.plan.downstream).toBe(
      'The personal account will call deposit on firelight vault 1.',
    )
  })

  it('takes the operator wallet from the live read, never a constant', () => {
    const moved = plan({
      settings: { ...SETTINGS, xrplProviderWallets: ['rSOMEOTHERWALLETzzzzzzzzzzzzzzzzz'] },
    })
    expect(moved.ok && moved.plan.destination).toBe('rSOMEOTHERWALLETzzzzzzzzzzzzzzzzz')
  })
})

describe('refusals — each one is a payment a user would otherwise have lost', () => {
  it('refuses before anything is read when the network is unverified', () => {
    const result = plan({ deployment: smartAccountsFor('coston2') as typeof VERIFIED })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.refusal.code).toBe('unverified')
  })

  it('refuses when the deployment could not be read', () => {
    const result = plan({ settings: undefined })
    expect(!result.ok && result.refusal.code).toBe('deployment_unreadable')
    expect(!result.ok && result.refusal.message).toMatch(/controller could not be read/)
  })

  it('refuses when the personal account could not be derived', () => {
    // Shares a refusal code with the branch above, so the message is what tells them apart
    // — and without this test the branch is simply unwalked.
    const result = plan({ account: undefined })
    expect(!result.ok && result.refusal.code).toBe('deployment_unreadable')
    expect(!result.ok && result.refusal.message).toMatch(/personal account/)
  })

  it('refuses a payment smaller than the instruction fee', () => {
    const result = plan({ intent: { ...TRANSFER, amountDrops: 999n } })
    expect(!result.ok && result.refusal.code).toBe('fee_unmet')
  })

  it('refuses when the deployment registers no operator wallet', () => {
    const result = plan({ settings: { ...SETTINGS, xrplProviderWallets: [] } })
    expect(!result.ok && result.refusal.code).toBe('no_operator_wallet')
  })

  it('refuses a vault id the CONTROLLER does not register', () => {
    // The kit's own vault registry lists Coston2 vaults too, and they are different ones.
    const result = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x11, value: 500_000n, vaultId: 99 },
    })
    expect(!result.ok && result.refusal.code).toBe('vault_not_registered')
  })

  it('refuses a Firelight instruction aimed at an Upshift vault', () => {
    // The chain's own name for this is InvalidInstructionType. It would revert — after the
    // payment.
    const result = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x11, value: 500_000n, vaultId: 2 },
    })
    expect(!result.ok && result.refusal.code).toBe('vault_type_mismatch')
  })

  it('refuses a superseded legacy collateral-reservation command', () => {
    const result = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x00, value: 1n, agentVaultId: 1 },
    })
    expect(!result.ok && result.refusal.code).toBe('not_composable')
  })

  it('refuses a transfer the personal account demonstrably cannot cover', () => {
    const result = plan({
      account: { ...ACCOUNT, fassetBalance: 10n },
    })
    expect(!result.ok && result.refusal.code).toBe('recipient_unfunded')
  })

  it('refuses a payment that has already dispatched, and does not call it a retry', () => {
    const result = plan({ replayed: true })
    expect(!result.ok && result.refusal.code).toBe('already_dispatched')
    expect(!result.ok && result.refusal.message).toMatch(/new payment, not a retry/)
  })

  it('refuses rather than quote an unread fee', () => {
    // Found by the M13 review gate. Quoting the default instead is how a user ends up
    // signing a payment the controller refuses — see the adapter test for the live numbers.
    const result = plan({
      settings: { ...SETTINGS, instructionFees: { ...SETTINGS.instructionFees, 0x01: undefined } },
    })
    expect(!result.ok && result.refusal.code).toBe('fee_unreadable')
  })

  it('refuses while the controller is paused', () => {
    // Found by the M13 review gate. Every dispatch entry point carries `notPaused`, and on
    // mainnet the proof window is two hours — a pause outlasting it makes the payment
    // permanently undispatchable.
    const result = plan({ settings: { ...SETTINGS, paused: true } })
    expect(!result.ok && result.refusal.code).toBe('paused')
  })

  it('refuses a redeem when the executor fee it must carry could not be read', () => {
    // PersonalAccount.redeemFXrp requires msg.value >= executorFee. Dispatching with a
    // guess reverts every time, with the XRPL payment already spent.
    const result = plan({
      settings: { ...SETTINGS, defaultExecutor: undefined },
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x02, value: 1n },
    })
    expect(!result.ok && result.refusal.code).toBe('executor_fee_unreadable')
  })

  it('refuses a vault DEPOSIT the account cannot cover, not just a transfer', () => {
    // Found by the M13 review gate. A deposit pulls the same FAsset in the same units, so
    // it carries the identical hazard — the gate is keyed on the denomination now.
    const result = plan({
      account: { ...ACCOUNT, fassetBalance: 10n },
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x11, value: 500_000n, vaultId: 1 },
    })
    expect(!result.ok && result.refusal.code).toBe('recipient_unfunded')
  })

  it('refuses an instruction id the kit cannot build', () => {
    const result = plan({ intent: { ...TRANSFER, instructionId: 0x44 } })
    expect(!result.ok && result.refusal.code).toBe('unknown_instruction')
  })

  it('refuses a zero recipient through the codec’s own rules', () => {
    const result = plan({
      intent: { ...TRANSFER, recipient: '0x0000000000000000000000000000000000000000' },
    })
    expect(!result.ok && result.refusal.code).toBe('invalid_reference')
  })
})

describe('the dispatch value', () => {
  it('is zero for a transfer and the executor fee for a redeem', () => {
    // Hardcoding zero here was an M13 review-gate Critical: a redeem routes msg.value to
    // PersonalAccount.redeemFXrp, which requires it to cover the executor fee.
    const transfer = plan()
    expect(transfer.ok && transfer.plan.dispatchValueWei).toBe(0n)

    const redeem = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x02, value: 1n },
    })
    expect(redeem.ok && redeem.plan.dispatchValueWei).toBe(100_000_000_000n)
  })
})

describe('warnings — things a user must see that are NOT grounds to refuse', () => {
  it('warns rather than refuses when the replay flag could not be read', () => {
    // Refusing would assert the payment was already used; treating it as unused would
    // assert it was not. Neither is known.
    const result = plan({ replayed: undefined })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('replay_unknown')
  })

  it('warns rather than refuses when the account balance could not be read', () => {
    const result = plan({ account: { ...ACCOUNT, fassetBalance: undefined } })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('balance_unknown')
  })

  it('says a lots-denominated instruction was not balance-checked, in its own words', () => {
    // Silence would imply it WAS checked. And the code differs from `balance_not_read`:
    // that one means nobody asked, this one means the units cannot be compared.
    const result = plan({
      intent: { xrplOwner: ACCOUNT.xrplOwner, instructionId: 0x02, value: 1n },
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('balance_not_comparable')
  })

  it('warns that an undeployed account will be created by this instruction', () => {
    // The first-ever instruction necessarily runs against an account with no code. That is
    // normal, and the user should know the address is about to become real.
    const result = plan({ account: { ...ACCOUNT, deployed: false } })
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('account_undeployed')
  })

  it('does not claim an account is undeployed when the code read failed', () => {
    const result = plan({ account: { ...ACCOUNT, deployed: undefined } })
    expect(result.ok).toBe(true)
    const codes = result.ok ? result.plan.warnings.map((w) => w.code) : []
    expect(codes).not.toContain('account_undeployed')
    // ...and it does not ignore the third value either. Found by the M13 review gate: the
    // planner previously dropped it, treating "we could not look" like "already deployed".
    expect(codes).toContain('deployment_state_unknown')
  })

  it('distinguishes a balance that FAILED to read from one never asked for', () => {
    // Both arrive as `undefined`. Reporting the second as a failed read invents a failure.
    const failed = plan({ account: { ...ACCOUNT, fassetBalance: undefined } })
    expect(failed.ok && failed.plan.warnings.map((w) => w.code)).toContain('balance_unknown')

    const neverAsked = planInstruction({
      deployment: VERIFIED,
      settings: SETTINGS,
      catalogue: buildInstructionCatalogue(SETTINGS),
      personalAccount: { ...ACCOUNT, fassetBalance: undefined },
      intent: TRANSFER,
      replayed: false,
      balanceRequested: false,
    })
    const codes = neverAsked.ok ? neverAsked.plan.warnings.map((w) => w.code) : []
    expect(codes).toContain('balance_not_read')
    expect(codes).not.toContain('balance_unknown')
  })
})
