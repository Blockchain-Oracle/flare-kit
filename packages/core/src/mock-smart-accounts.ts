import { smartAccountsFor } from '@flare-kit/contracts'
import type { DeploymentSettings } from './smart-accounts/adapter.js'
import { buildInstructionCatalogue } from './smart-accounts/catalogue.js'
import type { PersonalAccountState } from './smart-accounts/personal-account.js'
import { planInstruction } from './smart-accounts/plan.js'
import type { InstructionIntent, InstructionPlanResult } from './smart-accounts/plan-types.js'
import type { InstructionObservation } from './smart-accounts/states.js'

/**
 * The smart-accounts mock, written AFTER the live runs and copying what they observed.
 *
 * It is a READER the real code is driven by, not a second implementation: `mockPlan` calls
 * the real `planInstruction`, and a caller reconciles with the real `reconcileInstruction`.
 * There is no second state machine here to drift from the first one.
 *
 * It REFUSES anything the live runs did not observe — an unobserved XRPL owner, an
 * instruction that was never driven, a network that was never verified. An unmocked call is
 * a loud error rather than a plausible answer, because a mock that invents a smart account
 * would be inventing the one thing this milestone exists to prove.
 *
 * Every value below was read from Coston2 on 2026-08-13 and is recorded in
 * `.thoughts/verification/2026-08-13-coston2-live-smart-account.json` and
 * `…-m13-probe.json`. Nothing here is composed.
 *
 * THE DEPOSIT IS DELIBERATELY NOT MODELLED AS OURS. Its instruction executed and its effect
 * is real — 500 000 shares from controller vault 1 — but the operator's backend dispatched
 * it before this kit could, so `OBSERVED_DEPOSIT.dispatchedByUs` is `false`. Rendering it as
 * a kit dispatch would be the mock claiming a leg the live run did not prove, which is the
 * M11 lesson (never flip a flag or invent a leg to make a composer look active).
 */

/** The Coston2 XRPL account the runs were driven from. Nothing else is mocked. */
export const MOCK_XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

/**
 * Wall-clock of the transfer run, so lifecycle previews sit on a real clock.
 *
 * Named distinctly from the kit-wide `MOCK_EPOCH` in `mock.ts` rather than shadowing it:
 * that one is the FAssets mock's clock and the gallery already quotes against it, so two
 * different instants under one name behind an `export *` would be a silent trap.
 */
export const SMART_ACCOUNT_MOCK_EPOCH = Date.parse('2026-08-13T18:29:43.007Z')

/** Read live from `MasterAccountController` on Coston2 — every field, no defaults. */
export const OBSERVED_SETTINGS: DeploymentSettings = {
  xrplProviderWallets: ['rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq'],
  sourceId: 'testXRP',
  sourceIdRaw: '0x7465737458525000000000000000000000000000000000000000000000000000',
  proofValidityDurationSeconds: 86_400n,
  defaultInstructionFee: 1000n,
  paused: false,
  // Every id fell through to the default on Coston2. Mainnet does NOT — five ids charge
  // 950 000 against a 500 000 default — which is why these are read, never assumed.
  instructionFees: Object.fromEntries(
    [0x00, 0x01, 0x02, 0x10, 0x11, 0x12, 0x13, 0x20, 0x21, 0x22, 0x23].map((id) => [id, 1000n]),
  ),
  vaults: [
    { vaultId: 4, address: '0xD91324A6e8884147F6425E9ddd60e11Aea060B5b', vaultType: 'upshift' },
    { vaultId: 2, address: '0x9E63a5D282F2fBb7DcE822B98e363b2719D28319', vaultType: 'upshift' },
    { vaultId: 3, address: '0x4066A1363a04ce3B23eEcB53dEfa65f94A24355E', vaultType: 'upshift' },
    // The deposit landed here. NOT one of the kit's own `vaults.ts` Coston2 vaults.
    { vaultId: 1, address: '0xC90D6847747b85d1fa2E07859869fb9fB72c0361', vaultType: 'firelight' },
  ],
  agentVaults: [{ agentVaultId: 1, address: '0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC' }],
  defaultExecutor: { address: '0x103b384064ae85577127097A7cCadfd6fb13f437', fee: 100_000_000_000n },
}

/** The account BEFORE the first instruction: derived, never deployed, empty. */
export const OBSERVED_ACCOUNT_BLANK: PersonalAccountState = {
  xrplOwner: MOCK_XRPL_OWNER,
  address: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
  deployed: false,
  nonce: 0n,
  pinnedExecutor: '0x0000000000000000000000000000000000000000',
  nativeBalance: 0n,
  fassetBalance: 0n,
}

/**
 * The account as it stood when the transfer was planned: funded by the `fund` phase with
 * 2 000 000, and still NOT deployed — the first instruction is what deploys it. This is a
 * real observed moment, recorded in the `fund` phase, not a convenience.
 */
export const OBSERVED_ACCOUNT_FUNDED: PersonalAccountState = {
  ...OBSERVED_ACCOUNT_BLANK,
  fassetBalance: 2_000_000n,
}

/** The same account after both runs: deployed, holding what the deposit left behind. */
export const OBSERVED_ACCOUNT_LIVE: PersonalAccountState = {
  ...OBSERVED_ACCOUNT_BLANK,
  deployed: true,
  fassetBalance: 500_000n,
}

/** Run 1 — the transfer, dispatched by this kit, confirmed by balance deltas. */
export const OBSERVED_TRANSFER = {
  intent: {
    xrplOwner: MOCK_XRPL_OWNER,
    instructionId: 0x01,
    value: 1_000_000n,
    recipient: '0xDddF991858311597bFD3D125cb342a0d4B56ea0a',
  } satisfies InstructionIntent,
  reference: '0x0100000000000000000f4240dddf991858311597bfd3d125cb342a0d4b56ea0a',
  xrplTransactionId: 'E4385C7AD4E316DF269BFBB96A15204CC68E549005228BB6B1808595DC04117D',
  xrplLedgerIndex: 19_881_251,
  votingRoundId: 1_424_618n,
  dispatchHash: '0xd23a2d66eafc0de230590276794709e71eda91dee9ca687d0a46ba3fd16cabb1',
  dispatchBlock: 34_018_235n,
  dispatchedByUs: true,
  effect: { recipientDelta: 1_000_000n, personalAccountDelta: -1_000_000n },
} as const

/** Run 2 — the deposit. Executed and verified; dispatched by the OPERATOR, not by us. */
export const OBSERVED_DEPOSIT = {
  intent: {
    xrplOwner: MOCK_XRPL_OWNER,
    instructionId: 0x11,
    value: 500_000n,
    vaultId: 1,
  } satisfies InstructionIntent,
  reference: '0x11000000000000000007a1200000000100000000000000000000000000000000',
  xrplTransactionId: 'AA78F5FBD0D4EEBA64AE4DE691A6F02E26F8BAB70F8B74FE2B8144B255860FCF',
  xrplLedgerIndex: 19_884_153,
  votingRoundId: 1_424_722n,
  dispatchHash: '0x53aad8df00e90fc6bd2917a68756d2fb2de0ce5875f46f3e35a3f96851173c6d',
  dispatchBlock: 34_022_984n,
  /** The operator's backend beat us to it. Our own dispatch reverted TransactionAlreadyExecuted. */
  dispatchedByUs: false,
  dispatchedBy: '0xca0bf4cbc1cf8c4b5fd7984b42af907099084466',
  effect: { sharesIssued: 500_000n, personalAccountDelta: -500_000n },
} as const

const OBSERVED_RUNS = [OBSERVED_TRANSFER, OBSERVED_DEPOSIT] as const

function refuse(what: string): never {
  throw new Error(
    `mock-smart-accounts: ${what} was never observed. The mock answers only what the ` +
      '2026-08-13 Coston2 runs actually drove; anything else would be an invented smart account.',
  )
}

/** The catalogue as the live deployment produced it. */
export function mockInstructionCatalogue() {
  return buildInstructionCatalogue(OBSERVED_SETTINGS)
}

/**
 * A plan from the REAL planner over the observed deployment. Refuses an owner or an
 * instruction the runs never drove — including the nine built-ins that were never
 * dispatched, which the live evidence says nothing about.
 */
export function mockPlan(intent: InstructionIntent, account = OBSERVED_ACCOUNT_LIVE): InstructionPlanResult {
  if (intent.xrplOwner !== MOCK_XRPL_OWNER) refuse(`XRPL owner ${intent.xrplOwner}`)
  if (!OBSERVED_RUNS.some((run) => run.intent.instructionId === intent.instructionId)) {
    refuse(`instruction 0x${intent.instructionId.toString(16).padStart(2, '0')}`)
  }
  return planInstruction({
    // Coston2 only, and its flag is genuinely `true` — flipped by run 1, not by the mock.
    deployment: smartAccountsFor('coston2'),
    settings: OBSERVED_SETTINGS,
    catalogue: mockInstructionCatalogue(),
    personalAccount: account,
    intent,
    replayed: false,
    balanceRequested: true,
  })
}

/**
 * The observation feed for one of the two runs, at a chosen point along its four legs. The
 * caller passes this to the REAL `reconcileInstruction`; the mock never advances a record
 * itself.
 *
 * `leg: 'settled'` for the DEPOSIT still reports `instructionExecuted` — the instruction did
 * execute — because that is what the chain says. Whether this kit sent that transaction is
 * `OBSERVED_DEPOSIT.dispatchedByUs`, and a surface that cares must read it there rather than
 * inferring it from the operation reaching `succeeded`.
 */
export function mockObservation(
  run: typeof OBSERVED_TRANSFER | typeof OBSERVED_DEPOSIT,
  leg: 'unpaid' | 'paid' | 'proved' | 'submitted' | 'settled',
): InstructionObservation {
  if (leg === 'unpaid') return {}
  const xrplPayment = {
    transactionId: run.xrplTransactionId,
    // The ledger close the proof window is measured from, as the run recorded it.
    blockTimestamp: BigInt(Math.floor(SMART_ACCOUNT_MOCK_EPOCH / 1000) - 120),
  }
  if (leg === 'paid') return { xrplPayment }
  if (leg === 'proved') return { xrplPayment, proofRetrieved: true }
  if (leg === 'submitted') {
    return { xrplPayment, proofRetrieved: true, submissionHash: run.dispatchHash }
  }
  return {
    xrplPayment,
    proofRetrieved: true,
    submissionHash: run.dispatchHash,
    instructionExecuted: {
      personalAccount: OBSERVED_ACCOUNT_LIVE.address,
      transactionId: `0x${run.xrplTransactionId.toLowerCase()}`,
      instructionId: run.intent.instructionId,
    },
    dispatchReadSucceeded: true,
    effectObserved: true,
  }
}
