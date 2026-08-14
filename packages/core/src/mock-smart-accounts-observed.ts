import type { DeploymentSettings } from './smart-accounts/adapter.js'
import type { PersonalAccountState } from './smart-accounts/personal-account.js'
import type { InstructionIntent } from './smart-accounts/plan-types.js'

/**
 * What the live runs and the keyless probe of 2026-08-13 ACTUALLY OBSERVED — the data half of
 * the smart-accounts mock, split from `mock-smart-accounts.ts` when the two together crossed
 * the 300-line cap.
 *
 * The split is at a real seam, not an arbitrary line count: this file is a RECORD and holds no
 * behaviour, while its neighbour is a READER that drives the real planner and reconciler with
 * it. Everything here traces to
 * `.thoughts/verification/2026-08-13-coston2-live-smart-account.json` and `…-m13-probe.json`.
 * Nothing is composed, rounded or filled in.
 *
 * THE DEPOSIT IS DELIBERATELY NOT MODELLED AS OURS. Its instruction executed and its effect is
 * real — 500 000 shares from controller vault 1 — but the operator's backend dispatched it
 * before this kit could, so `OBSERVED_DEPOSIT.dispatchedByUs` is `false`. Recording it as a kit
 * dispatch would claim a leg the live run did not prove, which is the M11 lesson: never flip a
 * flag or invent a leg to make a composer look active.
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

/**
 * The FDC request fee the live runs actually paid, in wei, from `phases.attest.feeWei`.
 *
 * Read per request from the FDC hub at request time — this is a RECORD of what one request
 * cost on Coston2 that day, not a constant a surface may quote for a future one.
 */
export const OBSERVED_FDC_REQUEST_FEE_WEI = 1000n

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

/**
 * FLARE MAINNET, READ ONLY — the keyless probe of 2026-08-13, recorded in `…-m13-probe.json`.
 *
 * Every number here was read off the mainnet controller, so it is observed exactly like the
 * Coston2 block above. What it is NOT is a write path: `smartAccountsVerified.flare` stays
 * `false`, `mockPlan` targets Coston2 only, and planning against this deployment returns the
 * real `unverified` refusal. It exists because mainnet is the milestone's READ LENS, and the
 * identical-address property cannot be shown from one network alone.
 *
 * It also carries the fee fact the whole no-fallback rule rests on: five ids charge 950 000
 * against a 500 000 default. A surface that substituted the default here would quote a
 * payment 450 000 drops short of what the controller requires.
 */
export const OBSERVED_MAINNET_SETTINGS: DeploymentSettings = {
  xrplProviderWallets: ['rM2LEysS4isvAJkZFfxKDL5z4aTfWcBTXV'],
  sourceId: 'XRP',
  sourceIdRaw: '0x5852500000000000000000000000000000000000000000000000000000000000',
  proofValidityDurationSeconds: 7_200n,
  defaultInstructionFee: 500_000n,
  paused: false,
  instructionFees: Object.fromEntries(
    [0x00, 0x01, 0x02, 0x10, 0x11, 0x12, 0x13, 0x20, 0x21, 0x22, 0x23].map((id) => [
      id,
      [0x00, 0x02, 0x10, 0x20, 0x23].includes(id) ? 950_000n : 500_000n,
    ]),
  ),
  vaults: [
    { vaultId: 1, address: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', vaultType: 'firelight' },
    { vaultId: 2, address: '0x373D7d201C8134D4a2f7b5c63560da217e3dEA28', vaultType: 'upshift' },
    { vaultId: 3, address: '0x2439D4bb753A0f3777d4C9011AFacc475ba6B951', vaultType: 'upshift' },
  ],
  agentVaults: [{ agentVaultId: 1, address: '0x09011d2A11A40DB855Cb00B3AA5a0F5F3bd485FD' }],
  defaultExecutor: {
    address: '0x02954e158Be2b477E1C26F31e8AA0c21b378445C',
    fee: 10_000_000_000_000_000_000n,
  },
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

/**
 * The SAME XRPL address's account on Flare mainnet, probed the same day.
 *
 * Its address is byte-identical to the Coston2 one, which is the property the whole card is
 * built to show — and it is recorded here as two separately-read values that AGREE, not as
 * one value reused twice. Nothing has ever touched it, so it is honestly undeployed with a
 * zero nonce, no pinned executor and zero balances: real observed zeroes, not placeholders.
 */
export const OBSERVED_MAINNET_ACCOUNT: PersonalAccountState = {
  xrplOwner: MOCK_XRPL_OWNER,
  address: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
  deployed: false,
  nonce: 0n,
  pinnedExecutor: '0x0000000000000000000000000000000000000000',
  nativeBalance: 0n,
  fassetBalance: 0n,
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

