import {
  type ClaimIntent,
  type ClaimPlanResult,
  type DexToken,
  type FlareDropState,
  type FtsoReward,
  type OperationStep,
  type RewardsReads,
  type RnatState,
  MOCK_EPOCH,
  MOCK_REWARDS_OBSERVED,
} from '@flare-kit/core'
import { ClaimCard, type RewardsClaimOperation } from '../src/index.js'
import type { Section } from './sections.js'

/**
 * Dev-only. Every required state of the M10 ClaimCard, in both themes. The THREE claim
 * kinds render DISTINCTLY (R-REWARD-002) and are never collapsed into a generic claim.
 * States are built from the OBSERVED live keyless read pass (`MOCK_REWARDS_OBSERVED`,
 * 2026-08-12): FTSO no-entitlement, RNat "no RNat account" and FlareDrop "already
 * finished" are the REAL empty reads for this account — reused here as-is, never a faked
 * zero — plus the one real observed epoch-5929 mirror proof tuple (a DIFFERENT
 * beneficiary; ours earned nothing) reused as the proof-present SHAPE for the demo reward
 * line items the claimable/expiring states need. A fixed `now` (MOCK_EPOCH) keeps the
 * screenshots deterministic. No reward claim ever settled live this milestone
 * (`rewardsVerified` is CARRIED false past M10), so `claiming`/`awaiting`/`succeeded` are
 * shown with no tx evidence — there is no real one to show, and this build never invents
 * one.
 */

const NOW = MOCK_EPOCH + 5_000
const NOW_S = Math.floor(NOW / 1000)

const NATIVE: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }
const MIRROR = { url: 'https://gitlab.com/timivesel/ftsov2-testnet-rewards', official: false }
const RECIPIENT = MOCK_REWARDS_OBSERVED.account

// The REAL observed reads for this account (2026-08-12 keyless read pass): no FTSO
// entitlement, no RNat project, FlareDrop concluded with nothing claimable.
const baseReads: RewardsReads = {
  currentRewardEpoch: MOCK_REWARDS_OBSERVED.currentRewardEpoch,
  claimableEpochs: Array.from(
    { length: MOCK_REWARDS_OBSERVED.claimableEpochEnd - MOCK_REWARDS_OBSERVED.claimableEpochStart + 1 },
    (_, i) => MOCK_REWARDS_OBSERVED.claimableEpochStart + i,
  ),
  expireNextEpoch: MOCK_REWARDS_OBSERVED.expireNextEpoch,
  ftso: [],
  rnat: { kind: 'rnat', month: MOCK_REWARDS_OBSERVED.rnatCurrentMonth, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false },
  flaredrop: { kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true },
  // M11 added the 4th (staking) kind as a REQUIRED field on RewardsReads; this account's staking
  // read is the observed empty (total === claimed === 0), non-expiring. The M10 ClaimCard cases here
  // never read `.staking`, but the type now requires it — carried honest-empty, never fabricated.
  staking: { kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false },
}

// The REAL observed epoch-5929 mirror proof tuple, reused as the proof-present shape for
// a demo reward line item — never claimed as OUR account's entitlement (it belongs to a
// different beneficiary; this account's own reads are the empty `baseReads.ftso` above).
const demoReward = (epoch: number, proofPresent: boolean): FtsoReward => ({
  kind: 'ftso-delegation',
  epoch,
  amount: MOCK_REWARDS_OBSERVED.proofPresentAmount,
  claimType: MOCK_REWARDS_OBSERVED.proofPresentClaimType,
  proof: proofPresent ? MOCK_REWARDS_OBSERVED.proofPresentMerkleProof : [],
  expiresAtEpoch: MOCK_REWARDS_OBSERVED.expireNextEpoch,
  source: MIRROR,
})

// A hypothetical funded RNat project account — never observed live (this account's real
// read is `hasProject:false`); needed to cover the claimable/burn-warning composer states.
const RNAT_FUNDED: RnatState = {
  kind: 'rnat',
  month: MOCK_REWARDS_OBSERVED.rnatCurrentMonth,
  wNat: 3_000_000_000_000_000_000n,
  rnat: 5_000_000_000_000_000_000n,
  locked: 4_000_000_000_000_000_000n,
  hasProject: true,
}

// A hypothetical still-claimable historical month — never observed live (this account's
// real FlareDrop read is concluded with nothing claimable); needed for `flaredrop-month`.
const FLAREDROP_MONTH: FlareDropState = { kind: 'flaredrop', claimableMonths: [5], amount: 0n, concluded: true }

const REAL_PLAN: ClaimPlanResult = { kind: 'plan', plan: { steps: [], calls: [], claimKind: 'ftso-delegation' } }
const NOT_VERIFIED: ClaimPlanResult = { kind: 'error', error: { kind: 'not-verified' } }

const FTSO_INTENT: ClaimIntent = { kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false }

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({
  id,
  type,
  actor,
  state,
  attempts: 0,
})
const mkOp = (state: RewardsClaimOperation['state'], over: Partial<RewardsClaimOperation> = {}): RewardsClaimOperation => ({
  state,
  id: 'op',
  capability: 'rewards_claim',
  network: 114,
  intent: FTSO_INTENT,
  steps: [],
  evidence: [],
  attempts: [],
  quoteHistory: [],
  createdAt: NOW,
  updatedAt: NOW,
  schemaVersion: 1,
  ...over,
})
const awaiting = (reason: string) => ({ awaiting: { actor: 'flare' as const, reason, since: NOW_S } })

const CLAIM_STEPS_INFLIGHT = [step('call-0', 'claim', 'done'), step('record', 'await_ftso_claim', 'active', 'flare')]
const CLAIM_STEPS_DONE = [step('call-0', 'claim', 'done'), step('record', 'await_ftso_claim', 'done', 'flare')]

const base = { nativeToken: NATIVE, networkLabel: 'Coston2' } as const
const ftsoBase = { ...base, proofSource: MIRROR, recipient: RECIPIENT } as const

export const M10_CLAIMS_SECTIONS: readonly Section[] = [
  {
    id: 'm10-claims',
    title: 'M10 · ClaimCard (three DISTINCT kinds; unofficial mirror, 50% burn, concluded archive)',
    cases: [
      {
        name: 'ftso-claimable — a claimable reward, proof present (real epoch-5929 mirror tuple shape)',
        node: <ClaimCard kind="ftso-delegation" reads={{ ...baseReads, ftso: [demoReward(MOCK_REWARDS_OBSERVED.proofPresentEpoch, true)] }} planResult={REAL_PLAN} {...ftsoBase} />,
      },
      {
        name: 'ftso-proof-unavailable — an on-chain reward the mirror never proved; declared, never a claimable amount',
        node: <ClaimCard kind="ftso-delegation" reads={{ ...baseReads, ftso: [demoReward(5920, false)] }} {...ftsoBase} />,
      },
      {
        name: 'ftso-empty — the REAL observed no-entitlement read (getStateOfRewards all-empty)',
        node: <ClaimCard kind="ftso-delegation" reads={baseReads} {...ftsoBase} />,
      },
      {
        name: `ftso-expiring — at the observed expire-next boundary (epoch ${MOCK_REWARDS_OBSERVED.expireNextEpoch})`,
        node: <ClaimCard kind="ftso-delegation" reads={{ ...baseReads, ftso: [demoReward(MOCK_REWARDS_OBSERVED.expireNextEpoch, true)] }} {...ftsoBase} />,
      },
      {
        name: 'rnat-claimable — a funded RNat project account (hypothetical; this account has none)',
        node: <ClaimCard kind="rnat" reads={{ ...baseReads, rnat: RNAT_FUNDED }} {...base} />,
      },
      {
        name: 'rnat-locked-burn-warning — withdrawAll burns 50% of the still-locked balance BEFORE signing',
        node: <ClaimCard kind="rnat" reads={{ ...baseReads, rnat: RNAT_FUNDED }} withdrawAll {...base} />,
      },
      {
        name: 'rnat-empty — the REAL observed "no RNat account" read (getBalancesOf revert)',
        node: <ClaimCard kind="rnat" reads={baseReads} {...base} />,
      },
      {
        name: 'flaredrop-month — a real historical claimable month (hypothetical; this account has none left)',
        node: <ClaimCard kind="flaredrop" reads={{ ...baseReads, flaredrop: FLAREDROP_MONTH }} recipient={RECIPIENT} {...base} />,
      },
      {
        name: 'flaredrop-concluded — the REAL observed "already finished" read; no new-drop affordance',
        node: <ClaimCard kind="flaredrop" reads={baseReads} recipient={RECIPIENT} {...base} />,
      },
      {
        name: 'claiming — a submitted FTSO claim in flight (never succeeded from the submission)',
        node: <ClaimCard kind="ftso-delegation" operation={mkOp('submitted', { steps: CLAIM_STEPS_INFLIGHT })} {...base} />,
      },
      {
        name: 'awaiting — Flare confirming the claim (no tx evidence: no claim has settled live this milestone)',
        node: <ClaimCard kind="ftso-delegation" operation={mkOp('awaiting_external', { steps: CLAIM_STEPS_INFLIGHT, ...awaiting('Flare is confirming your claim.') })} {...base} />,
      },
      {
        name: 'succeeded — ONLY from a confirmed on-chain read',
        node: <ClaimCard kind="ftso-delegation" operation={mkOp('succeeded', { steps: CLAIM_STEPS_DONE })} {...base} />,
      },
      {
        name: 'not-verified — rewardsVerified is carried false past M10; the kit will not sign a claim',
        node: (
          <ClaimCard
            kind="ftso-delegation"
            reads={{ ...baseReads, ftso: [demoReward(MOCK_REWARDS_OBSERVED.proofPresentEpoch, true)] }}
            planResult={NOT_VERIFIED}
            {...ftsoBase}
          />
        ),
      },
    ],
  },
]
