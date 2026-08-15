import {
  type DexToken,
  type FlareDropState,
  type OperationStep,
  type RewardsReads,
  type RnatState,
  type StakeIntent,
  type StakeLimits,
  type StakeOperation,
  type StakePositionView,
  type StakingRewardState,
  type ValidatorInfo,
  MOCK_EPOCH,
  MOCK_STAKE_OBSERVED,
  amount,
  mockStakingDeployment,
  planStake,
  stakePosition,
} from '@flarekit-dev/core'
import { ClaimCard, StakeCard } from '@flarekit-dev/react-ui'
import type { Section } from './sections'

/**
 * Dev-only. Every state of the M11 StakeCard + the ClaimCard staking (4th) kind that the
 * Task-6 keyless read pass OBSERVED, in both themes (the one gallery toggle re-themes them).
 * States are props built from `MOCK_STAKE_OBSERVED` — the surface is prop-driven, so each
 * state is data, never a live call.
 *
 * The load-bearing honesty is specific to this milestone: **no broadcast landed** (the signer
 * holds ≪ the 50,000-FLR minimum), so `stakeVerified` is false and the stake position is
 * carried STILL-UNBUILT. Therefore:
 *  - there is NO `succeeded` / active-stake case — the STK-02 position panel is always the
 *    honest blank-slate (`staked 0`, mirror `0`) or `unavailable` (`—`), never a populated
 *    mirrored position the live run never observed (state-reachable-from-props rule);
 *  - the plan states are driven by the REAL `planStake` — the honest shipped deployment
 *    (`stakeVerified:false`) refuses `unverified`; the composer/value-lock + the invariant
 *    refusals are proven under an EXPLICIT verified OVERRIDE (the Task-6 `validUnderOverride`
 *    pattern), never a hand-typed plan;
 *  - the in-flight spine is shown pre-broadcast (signing) and awaiting, with NO fabricated
 *    txId and the position still blank-slate;
 *  - the staking reward is NON-EXPIRING and honest-empty where `claimable 0`.
 */

const OBS = MOCK_STAKE_OBSERVED
const NOW = MOCK_EPOCH
const NOW_S = BigInt(Math.floor(NOW / 1000))

const NATIVE: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }
const RECIPIENT = OBS.account
const NATIVE_BAL = amount(146_634_056_736_830_560_487n, 18, NATIVE.symbol) // the live signer balance (≪ 50,000 min)

// The LIVE-read validator set + bounds, reconstructed from the observed wire — never a literal
// in the card. `weight` is nFLR→wei (×1e9), matching `pchain-rpc.ts`.
const VALIDATORS: ValidatorInfo[] = OBS.validatorsWire.map((v) => ({
  nodeId: v.nodeID,
  startTime: BigInt(v.startTime),
  endTime: BigInt(v.endTime),
  weight: BigInt(v.weight) * 1_000_000_000n,
}))
const LIMITS: StakeLimits = {
  minAmount: OBS.minAmountWei,
  maxAmount: OBS.maxAmountWei,
  minDuration: OBS.minDurationSeconds,
  maxDuration: OBS.maxDurationSeconds,
}

// Plan states via the REAL planStake. The honest shipped deployment refuses `unverified`; an
// EXPLICIT verified override (NOT the shipped state) proves the composer + the invariants.
const VALID_INTENT: StakeIntent = {
  nodeId: OBS.chosenValidator,
  amount: OBS.minAmountWei,
  startTime: NOW_S,
  endTime: NOW_S + OBS.minDurationSeconds,
  rewardAddress: OBS.account,
}
const VERIFIED = { ...mockStakingDeployment(), stakeVerified: true } // explicit gallery override — never shipped
const HONEST = mockStakingDeployment() // stakeVerified:false — the real shipped state
const plan = (intent: StakeIntent, deployment = VERIFIED) => planStake({ intent, deployment, limits: LIMITS, validators: VALIDATORS })

const UNVERIFIED_PLAN = plan(VALID_INTENT, HONEST) // → { ok:false, unverified }
const COMPOSED_PLAN = plan(VALID_INTENT) // → { ok:true, plan+value-lock } under the override
const BELOW_MIN_PLAN = plan({ ...VALID_INTENT, amount: OBS.minAmountWei - 1n })
const SHORT_PLAN = plan({ ...VALID_INTENT, endTime: NOW_S + OBS.minDurationSeconds - 1n })
const PAST_VALIDATOR_PLAN = plan({ ...VALID_INTENT, endTime: OBS.chosenValidatorEnd + 1n })

// STK-02 position views. The honest states this milestone:
//  - blank-slate: observed empty `readStakesOf` `[]` + a genuine `balanceOf` `0` → `Staked 0 / mirror 0`.
//  - mirror-unavailable: `readStakesOf` observed `[]` but the mirror `balanceOf` reverted → `Staked 0 / mirror —`
//    (a reachable MIXED state: the two are separate reads; the mirror `undefined` is the honest unknown, never `0`).
//  - position-unavailable: the WHOLE position read didn't land → both rows `—`.
const POS_BLANK: StakePositionView = stakePosition({ stakes: [], mirroredVotePower: 0n })
const POS_MIRROR_UNAVAILABLE: StakePositionView = stakePosition({ stakes: [], mirroredVotePower: undefined })
const POS_UNAVAILABLE: StakePositionView = stakePosition(undefined)

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({
  id,
  type,
  actor,
  state,
  attempts: 0,
})
const mkOp = (state: StakeOperation['state'], over: Partial<StakeOperation> = {}): StakeOperation =>
  ({
    state,
    id: 'op',
    capability: 'staking',
    network: 114,
    intent: VALID_INTENT,
    steps: [],
    evidence: [], // no fabricated txId — no broadcast landed live
    attempts: [],
    quoteHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    schemaVersion: 1,
    ...over,
  }) as StakeOperation
const awaiting = (reason: string) => ({ awaiting: { actor: 'flare' as const, reason, since: Number(NOW_S) } })

// The stake-in spine (export C→P → delegate → Flare records). Shown WITHOUT a txId.
const SIGNING_STEPS = [step('export', 'transfer_to_p', 'active'), step('delegate', 'delegate', 'pending'), step('record', 'await_stake', 'pending', 'flare')]
const AWAITING_STEPS = [step('export', 'transfer_to_p', 'done'), step('delegate', 'delegate', 'done'), step('record', 'await_stake', 'active', 'flare')]

// The ClaimCard staking (4th) kind. Empty is the OBSERVED reality; the claimable line is a
// clearly-hypothetical demo of the card (this account earned nothing — total===claimed live).
const rewardsBase = (staking: StakingRewardState): RewardsReads => ({
  currentRewardEpoch: 0,
  claimableEpochs: [],
  expireNextEpoch: 0,
  ftso: [],
  rnat: { kind: 'rnat', month: 0, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false } as RnatState,
  flaredrop: { kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true } as FlareDropState,
  staking,
})
const STAKING_EMPTY = rewardsBase({ kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false })
const STAKING_CLAIMABLE = rewardsBase({ kind: 'staking', total: 12_500_000_000_000_000_000n, claimed: 0n, claimable: 12_500_000_000_000_000_000n, expires: false })

const stakeBase = { nativeToken: NATIVE, validators: VALIDATORS, limits: LIMITS, networkLabel: 'Coston2' } as const
const claimBase = { nativeToken: NATIVE, recipient: RECIPIENT, wrap: false, networkLabel: 'Coston2' } as const

export const M11_STAKING_SECTIONS: readonly Section[] = [
  {
    id: 'm11-staking',
    title: 'M11 · StakeCard (live-read validators + bounds; value-lock; carried unverified — no fabricated stake)',
    cases: [
      {
        name: 'discovery — the live-read validator set + the 50,000-FLR / 14–365-day bounds; nothing composed yet',
        node: <StakeCard position={POS_BLANK} selectedNodeId={OBS.chosenValidator} {...stakeBase} />,
      },
      {
        name: 'compose — the irreversible pre-sign value-lock (50,000.000000000000000000 C2FLR, 14 days) under the verified-path preview',
        node: (
          <StakeCard
            position={POS_BLANK}
            planResult={COMPOSED_PLAN}
            selectedNodeId={OBS.chosenValidator}
            amountText="50000"
            durationDays={14}
            nativeBalance={NATIVE_BAL}
            {...stakeBase}
          />
        ),
      },
      {
        name: 'not-verified — the HONEST shipped state: stakeVerified false, so the kit refuses to emit a signable plan',
        node: <StakeCard position={POS_BLANK} planResult={UNVERIFIED_PLAN} selectedNodeId={OBS.chosenValidator} {...stakeBase} />,
      },
      {
        name: 'amount-below-min — below the live 50,000-FLR floor, refused before a plan is built',
        node: <StakeCard position={POS_BLANK} planResult={BELOW_MIN_PLAN} selectedNodeId={OBS.chosenValidator} amountText="49999" durationDays={14} {...stakeBase} />,
      },
      {
        name: 'duration-below-min — under the live 14-day floor, refused',
        node: <StakeCard position={POS_BLANK} planResult={SHORT_PLAN} selectedNodeId={OBS.chosenValidator} amountText="50000" durationDays={13} {...stakeBase} />,
      },
      {
        name: 'ends-after-validator — the stake end outlives the chosen validator window, refused',
        node: <StakeCard position={POS_BLANK} planResult={PAST_VALIDATOR_PLAN} selectedNodeId={OBS.chosenValidator} amountText="50000" durationDays={365} {...stakeBase} />,
      },
      {
        name: 'signing — the round-trip spine pre-broadcast (export C→P active); no txId, position still blank-slate',
        node: <StakeCard operation={mkOp('executing', { steps: SIGNING_STEPS })} position={POS_BLANK} {...stakeBase} />,
      },
      {
        name: 'awaiting — Flare recording the stake on the P-chain (readStakesOf not yet reflecting it); never succeeded from the submit',
        node: <StakeCard operation={mkOp('awaiting_external', { steps: AWAITING_STEPS, ...awaiting('Flare is recording your stake on the P-chain.') })} position={POS_BLANK} {...stakeBase} />,
      },
      {
        name: 'position blank-slate — the honest still-unbuilt STK-02: staked 0, mirror 0 (a real read), distinct from unavailable',
        node: <StakeCard position={POS_BLANK} {...stakeBase} />,
      },
      {
        name: 'mirror-unavailable — readStakesOf observed empty but the mirror balanceOf reverted: Staked 0, mirror — (a reachable mixed state)',
        node: <StakeCard position={POS_MIRROR_UNAVAILABLE} {...stakeBase} />,
      },
      {
        name: 'position-unavailable — the whole position read didn’t land; both rows render —, never a confident zero',
        node: <StakeCard position={POS_UNAVAILABLE} {...stakeBase} />,
      },
    ],
  },
  {
    id: 'm11-staking-reward',
    title: 'M11 · ClaimCard · staking reward (4th kind; NON-EXPIRING — never the 25-epoch line)',
    cases: [
      {
        name: 'staking-empty — the OBSERVED reality: total === claimed → honest empty (a delayed leg), non-expiring',
        node: <ClaimCard kind="staking" reads={STAKING_EMPTY} {...claimBase} />,
      },
      {
        name: 'staking-claimable — a claimable delta (hypothetical; this account earned nothing live), "Does not expire"',
        node: <ClaimCard kind="staking" reads={STAKING_CLAIMABLE} {...claimBase} />,
      },
    ],
  },
]
