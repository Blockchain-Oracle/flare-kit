import { encodeFunctionData } from 'viem'
import type { MemoFeeSettings, MemoIntent, MemoPlanResult } from './smart-accounts/memo-plan.js'
import { planMemoInstruction } from './smart-accounts/memo-plan.js'
import type { MemoObservation } from './smart-accounts/memo-states.js'
import type { PersonalAccountState } from './smart-accounts/personal-account.js'
import { smartAccountsFor } from '@flarekit-dev/contracts'

/**
 * The memo flow's mock, written AFTER the live run and copying only what it observed
 * (M14-R12) — the M13 rule, and the reason this file did not exist until 2026-08-15.
 *
 * Everything here traces to `.thoughts/verification/2026-08-15-coston2-live-memo.json` and its
 * markdown. Nothing is composed, rounded or filled in.
 *
 * WHAT THIS MOCK DELIBERATELY DOES NOT MODEL, because the live run did not produce it:
 *
 * - **`delayed`.** No mint was rate-limited, so there is no observed `DirectMintingDelayed`.
 *   M14-AC5 asks for that state to be reachable FROM PROPS, and that is where it stays — a
 *   mock record of a delay nobody saw would be exactly the fabricated protocol reality this
 *   project forbids.
 * - **`0xFE`.** The run drove `0xFF`; the operation fit inline at 810 bytes. No executor-data
 *   round trip has been observed, so none is offered here.
 * - **The five recovery opcodes.** None was driven live. The planner builds and refuses them
 *   correctly under test, but nothing here claims a chain has accepted one.
 * - **The burn.** No below-minimum payment was ever sent, and it never will be by this kit.
 *
 * AND ONE THING IT MODELS THAT IS EASY TO GET WRONG: `relayedByUs` is **false**. The operation
 * executed and its effect is real, but a third party attested the same public XRPL payment
 * under its own `proofOwner` and submitted first — `0x103b3840…f437`, about two minutes after
 * the payment validated. Recording this as a kit relay would claim a leg the run disproved.
 */

/** The Coston2 XRPL account the run was driven from. Nothing else is mocked. */
export const MEMO_MOCK_XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

/** Wall clock of the XRPL payment, so lifecycle previews sit on a real instant. */
export const MEMO_MOCK_EPOCH = Date.parse('2026-08-15T10:29:07.595Z')

/**
 * Read live from the Coston2 AssetManager at plan time.
 *
 * The minimum is the load-bearing one: at this payment size the proportional 0.25% comes to
 * 5 000 and the protocol charged 100 000, because `mintingFeeFor` floors at the minimum. A
 * surface quoting the percentage alone would have understated the fee twentyfold.
 */
export const OBSERVED_MEMO_FEES: MemoFeeSettings = {
  feeBIPS: 25n,
  minimumFeeUBA: 100_000n,
  assetManagerExecutorFeeUBA: 100_000n,
}

/** The Core Vault's underlying address — where the payment must go, NOT an operator wallet. */
export const OBSERVED_CORE_VAULT = 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p'

/** The FTestXRP token and the recipient the operation moved to, both real Coston2 addresses. */
export const OBSERVED_MEMO_TOKEN = '0x0b6A3645c240605887a5532109323A3E12273dc7' as const
export const OBSERVED_MEMO_RECIPIENT = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a' as const

/** The account as it stood when the plan was built: deployed, nonce 0, 0.5 FTestXRP. */
export const OBSERVED_MEMO_ACCOUNT: PersonalAccountState = {
  xrplOwner: MEMO_MOCK_XRPL_OWNER,
  address: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
  deployed: true,
  nonce: 0n,
  // A real observed zero address: no executor is pinned. Distinct from an unread value.
  pinnedExecutor: '0x0000000000000000000000000000000000000000',
  nativeBalance: 0n,
  fassetBalance: 500_000n,
}

/** The same account after the run: credited 1 900 000, spent 400 000, nonce advanced. */
export const OBSERVED_MEMO_ACCOUNT_AFTER: PersonalAccountState = {
  ...OBSERVED_MEMO_ACCOUNT,
  nonce: 1n,
  fassetBalance: 2_000_000n,
}

/**
 * The operation the memo carried: move 0.4 FTestXRP out of the personal account.
 *
 * Sized deliberately WITHIN the balance the account already held. The first attempt moved 1.0
 * and the plan gate refused it, because the pre-signature simulation runs against the account
 * before the mint credits it — see the run's markdown. That refusal is real behaviour, not a
 * mishap, and it is why this amount is 400 000.
 */
export const OBSERVED_MEMO_INTENT: MemoIntent = {
  calls: [
    {
      target: OBSERVED_MEMO_TOKEN,
      value: 0n,
      data: encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'transfer',
            stateMutability: 'nonpayable',
            inputs: [{ type: 'address' }, { type: 'uint256' }],
            outputs: [{ type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [OBSERVED_MEMO_RECIPIENT, 400_000n],
      }),
    },
  ],
  // The PAYER framing — the payment actually signed, used exactly as given.
  totalUBA: 2_000_000n,
  nonce: 0n,
}

/**
 * Everything the run recorded about the chain, in one record.
 *
 * `relayedByUs: false` is not an omission. See the file comment.
 */
export const OBSERVED_MEMO_RUN = {
  network: 'coston2',
  xrplTransactionId: 'A71BFFCA8B786B222A1196914CDB799D1E5B042B38B073D02AFF44641BC55DD6',
  paymentDrops: 2_000_000n,
  opcode: 0xff,
  memoBytes: 810,
  votingRoundId: 1_426_220n,
  /** Our own EOA. It made the proof ours alone — it did not make the payment ours. */
  proofOwner: '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
  fdcRequestFeeWei: 1000n,
  mintingFeeUBA: 100_000n,
  creditedUBA: 1_900_000n,
  movedUBA: 400_000n,
  userOperationExecuted: {
    personalAccount: OBSERVED_MEMO_ACCOUNT.address,
    nonce: 0n,
    transactionHash: '0x4d7ad65562937bf42b11a80b1f9b040c3a52a47e5425d078d194ac14249607c9',
    blockNumber: 34_089_050n,
  },
  /** Who actually submitted. Not us — and the record says so rather than eliding it. */
  relayedByUs: false,
  relayer: '0x103b384064ae85577127097a7ccadfd6fb13f437',
} as const

/**
 * The exact memo bytes the XRP Ledger carried and the controller accepted.
 *
 * Kept verbatim so `mockMemoPlan()` can be checked against them: the mock drives the REAL
 * encoder, and the test asserts the two agree. That is a stronger claim than embedding the
 * bytes alone would be — it proves the shipped codec reproduces what Coston2 actually took,
 * rather than that someone once pasted a string correctly.
 */
export const OBSERVED_MEMO_BYTES =
  '0xff000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000089023176a776cdb1d339a7649116b1a6f3deffcb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000002e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001442b2ee7830000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000b6a3645c240605887a5532109323a3e12273dc7000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000dddf991858311597bfd3d125cb342a0d4b56ea0a0000000000000000000000000000000000000000000000000000000000061a80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

/**
 * The plan, from the REAL gate driven with the observed inputs.
 *
 * Not a stored `MemoPlan` literal. A recorded result could drift from the planner that ships
 * and nothing would notice; this way the mock exercises the same code a caller does, and the
 * live run's numbers are the assertion.
 */
export function mockMemoPlan(
  account: PersonalAccountState = OBSERVED_MEMO_ACCOUNT,
): MemoPlanResult {
  return planMemoInstruction({
    deployment: smartAccountsFor('coston2'),
    personalAccount: account,
    fees: OBSERVED_MEMO_FEES,
    intent: OBSERVED_MEMO_INTENT,
    // The run read this as unknown at plan time — the payment did not exist yet. Recorded as
    // the run had it, which means the plan carries its `replay_unknown` warning.
    replayed: undefined,
    // The simulation the run actually performed, against the account before the mint.
    simulation: { ok: true },
  })
}

/**
 * The lifecycle observation for the run, as `reconcileMemoInstruction` consumes it.
 *
 * `effectObserved` is `true` only because the run READ IT BACK — the recipient's balance moved
 * by exactly 400 000. It is never set from the event alone: a mined relay proves the
 * transaction landed, not that the instruction did what it said.
 */
export function mockMemoObservation(): MemoObservation {
  return {
    xrplPayment: { transactionId: OBSERVED_MEMO_RUN.xrplTransactionId },
    proofRetrieved: true,
    relayHash: OBSERVED_MEMO_RUN.userOperationExecuted.transactionHash,
    userOperationExecuted: {
      personalAccount: OBSERVED_MEMO_RUN.userOperationExecuted.personalAccount,
      nonce: OBSERVED_MEMO_RUN.userOperationExecuted.nonce,
    },
    effectObserved: true,
  }
}

/**
 * The same run BEFORE the effect was read back — the honest intermediate state.
 *
 * Worth having as its own fixture because it is the state a surface is most likely to get
 * wrong: the operation has run, the receipt is mined, and it is still not `succeeded`.
 */
export function mockMemoObservationAwaitingEffect(): MemoObservation {
  const { effectObserved: _dropped, ...rest } = mockMemoObservation()
  return rest
}
