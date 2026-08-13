// packages/core/src/mock-governance.ts
import { type Address, type Hex, type PublicClient, zeroAddress } from 'viem'
import { type FlareNetworkKey, type GovernanceDeployment, governanceFor } from '@flare-kit/contracts'

/**
 * The governance mock (M12-T7), written AFTER the real Coston2 round trip + mainnet
 * proposal read and copying ONLY what that run observed. It is a labelled fake
 * `PublicClient` the REAL `readGovernanceVotes` / `readEligibility`
 * (`governance-adapter.ts`), `planGovernance` / `governancePosition` (`governance.ts`),
 * `reconcileGovernance` (`governance-states.ts`) and `discoverProposals` /
 * `readProposalDetail` / `planCastVote` (`proposals.ts`) run against UNCHANGED — so a
 * test or demo drives the true code path with no network. Mock mode is explicit: a caller
 * constructs this client; nothing ever falls back to it.
 *
 * OBSERVED (evidence `.thoughts/verification/2026-08-13-m12-governance.md` +
 * `.thoughts/verification/2026-08-13-m12-governance-reads.json`; signer
 * `0xA4b05cdB…31Bd9`):
 *
 *  - Coston2 blank-slate reads (block 34007182): `getVotes` 0, `getDelegateOfAtNow` the
 *    zero address, `isProposer` false, `canPropose` false, `isMember` REVERTS for a
 *    non-member (probe CONCERN A — never coerced to false). Flare mainnet (block
 *    67309105) read the IDENTICAL blank slate for the same account — governance vote
 *    power was never held or delegated on either network before the round trip.
 *  - The Coston2 round trip (Abu's go): `delegate(0xDddF991858311597bFD3D125cb342a0d4B56ea0a)`
 *    (tx `0xc0da39abf699242a1306c7ac659c59d7df98612940e8b4036ec6d0075d1419d7`) read back
 *    `getDelegateOfAtNow` = the target; `undelegate()` (tx
 *    `0x5537335d5fcabebcb512b9ece76f258b15cba773fd6a3785e0697e76e75bea7d`) read back the
 *    zero address. `governanceVerified` flipped true on Coston2 only — Flare mainnet
 *    stays false (a read lens, never a write target this milestone).
 *  - The one real proposal (Flare mainnet, `getLastProposal`, source 'ftso'): id 1,
 *    "Block-latency parameter changes", state index 3 = Defeated (the FTSO enum, NOT the
 *    foundation one — see `proposal-mapping.ts`), for 2354.308387975507843417, against 0,
 *    threshold 6600 BIPS, majority 5000 BIPS, totalVotePower 5217.782567582675528275
 *    (UNCONFIRMED best-effort). Coston2 hosts no proposal — `getLastProposal` id 0,
 *    honest-empty. No foundation `ProposalCreated` log was ever discoverable on either
 *    network, so the bounded scan here never yields one.
 *
 * REFUSES the unobserved (the M10/M11 mock discipline):
 *  - `isMember` always THROWS in the fake client (both networks — the live revert) so the
 *    real `readEligibility` yields `isMember: undefined`, never a fabricated `false`.
 *  - `succeeded` is never hand-written here — it falls out of feeding this client's own
 *    `getDelegateOfAtNow` read-back into the REAL `reconcileGovernance`.
 *  - No proposal beyond the observed FTSO id 1 exists in this mock: any other id, or a
 *    read against `PollingFoundation`'s proposal shape, refuses rather than invents one.
 *  - `governanceVerified` is read straight off `governanceFor(network)` — this mock never
 *    assigns it, so a non-Coston2 network can never be made to appear flipped.
 *  - Only Coston2 drove the round trip: a VP/delegate/eligibility override requested for
 *    any other network throws rather than inventing a mainnet delegation that was never
 *    broadcast (mainnet is a read lens, never a write target).
 */

export const MOCK_GOVERNANCE_OBSERVED = {
  signer: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as Address,
  delegateTarget: '0xDddF991858311597bFD3D125cb342a0d4B56ea0a' as Address,
  delegateTx: '0xc0da39abf699242a1306c7ac659c59d7df98612940e8b4036ec6d0075d1419d7' as Hex,
  undelegateTx: '0x5537335d5fcabebcb512b9ece76f258b15cba773fd6a3785e0697e76e75bea7d' as Hex,
  coston2Block: 34_007_182n,
  flareBlock: 67_309_105n,
  // The one real proposal ever discoverable live (Flare mainnet, source 'ftso', id 1).
  proposal: {
    id: 1n,
    description: '{"name":"Block-latency parameter changes"}',
    proposer: '0xb5Dd6cA7b14bd7d2B6E296983D0AA0D373979CFE' as Address,
    voteStart: 1_733_413_499n,
    voteEnd: 1_733_586_299n,
    thresholdBIPS: 6_600n,
    majorityBIPS: 5_000n,
    forVotes: 2_354_308_387_975_507_843_417n,
    against: 0n,
    totalVotePower: 5_217_782_567_582_675_528_275n,
    noOfEligibleMembers: 247n,
    stateIndex: 3, // FTSO enum: Canceled(0) Pending(1) Active(2) Defeated(3) Succeeded(4)
  },
} as const

/**
 * Overrides to drive the round trip; every default is the OBSERVED blank slate (0 votes,
 * zero delegate, isProposer/canPropose false — identical on both networks). Combine with
 * the default `network: 'coston2'` to reproduce the two live-observed non-blank shapes:
 *  - delegated: `{ delegate: MOCK_GOVERNANCE_OBSERVED.delegateTarget }`
 *  - undelegated (back to blank): omit, or `{ delegate: zeroAddress }`
 * ANY override on a network other than Coston2 throws — only Coston2 drove a write.
 */
export interface MockGovernanceConfig {
  readonly votes?: bigint
  readonly delegate?: Address
  readonly isProposer?: boolean
  readonly canPropose?: boolean
}

type ReadContractArgs = { readonly address: Address; readonly functionName: string; readonly args?: readonly unknown[] }

function proposalInfoTuple() {
  const p = MOCK_GOVERNANCE_OBSERVED.proposal
  return [p.noOfEligibleMembers, p.description, p.proposer, p.voteStart, p.voteEnd, p.thresholdBIPS, p.majorityBIPS, p.totalVotePower] as const
}

function createMockGovernanceClient(deployment: GovernanceDeployment, config: MockGovernanceConfig, network: FlareNetworkKey): PublicClient {
  const gvpAddress = deployment.governanceVotePower.toLowerCase()
  const foundationAddress = deployment.pollingFoundation.toLowerCase()
  const ftsoAddress = deployment.pollingFtso.toLowerCase()
  const votes = config.votes ?? 0n
  const delegate = config.delegate ?? zeroAddress
  const isProposer = config.isProposer ?? false
  const canPropose = config.canPropose ?? false
  // The one real proposal was discovered on Flare mainnet only — Coston2 hosts none.
  const hasProposal = network === 'flare'
  const proposal = MOCK_GOVERNANCE_OBSERVED.proposal

  return {
    async readContract({ address, functionName, args = [] }: ReadContractArgs) {
      const addr = String(address).toLowerCase()

      if (addr === gvpAddress) {
        if (functionName === 'getVotes') return votes
        if (functionName === 'getDelegateOfAtNow') return delegate
        throw new Error(`mock-governance: unexpected (unobserved) read ${functionName} on GovernanceVotePower`)
      }

      if (addr === foundationAddress) {
        if (functionName === 'isProposer') return isProposer
        // No foundation proposal was ever discoverable live — any proposal-shaped read refuses.
        throw new Error(`mock-governance: unexpected (unobserved) read ${functionName} on PollingFoundation — no foundation proposal was ever observed`)
      }

      if (addr === ftsoAddress) {
        if (functionName === 'canPropose') return canPropose
        if (functionName === 'isMember') {
          // Observed REVERT on both networks (probe CONCERN A) — never coerced to false.
          throw new Error('execution reverted: PollingFtso.isMember')
        }
        if (functionName === 'getLastProposal') return hasProposal ? [proposal.id, proposal.description] : [0n, '']
        // Every remaining PollingFtso read is proposal-shaped: refuse anything but the one observed id.
        if (!hasProposal || (args[0] as bigint | undefined) !== proposal.id) {
          throw new Error(`mock-governance: no proposal beyond the observed FTSO id ${proposal.id} was ever discovered`)
        }
        if (functionName === 'getProposalInfo') return proposalInfoTuple()
        if (functionName === 'getProposalVotes') return [proposal.forVotes, proposal.against]
        if (functionName === 'state') return proposal.stateIndex
        throw new Error(`mock-governance: unexpected (unobserved) read ${functionName} on PollingFtso`)
      }

      throw new Error(`mock-governance: read on an unobserved contract ${address}`)
    },
    async getBlockNumber() {
      return network === 'flare' ? MOCK_GOVERNANCE_OBSERVED.flareBlock : MOCK_GOVERNANCE_OBSERVED.coston2Block
    },
    async getContractEvents() {
      // No foundation ProposalCreated log was ever observed on either network — honest-empty.
      return []
    },
  } as unknown as PublicClient
}

/**
 * The mock: a fake `PublicClient` paired with the REAL `governanceFor(network)`
 * deployment, untouched — so `governanceVerified` is exactly what the live flip left it
 * (true on Coston2, false on Flare) and this mock never assigns it itself. Only Coston2
 * drove the round trip; a VP/delegate/eligibility override requested on any other network
 * throws rather than inventing a mainnet delegation that was never broadcast.
 */
export function createMockGovernanceAdapter(
  config: MockGovernanceConfig = {},
  network: FlareNetworkKey = 'coston2',
): { readonly client: PublicClient; readonly deployment: GovernanceDeployment } {
  const overridden = config.votes !== undefined || config.delegate !== undefined || config.isProposer !== undefined || config.canPropose !== undefined
  if (network !== 'coston2' && overridden) {
    throw new Error(
      `mock-governance: the delegate/undelegate round trip and VP/eligibility overrides were only observed live on ` +
        `coston2 — the mock refuses to fabricate them for '${network}' (mainnet is a read lens, never a write target).`,
    )
  }
  const deployment = governanceFor(network)
  return { client: createMockGovernanceClient(deployment, config, network), deployment }
}
