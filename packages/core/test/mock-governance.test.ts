import { describe, expect, it } from 'vitest'
import { zeroAddress } from 'viem'
import { readEligibility, readGovernanceVotes } from '../src/governance-adapter.js'
import { planGovernance, type GovernanceIntent } from '../src/governance.js'
import { reconcileGovernance } from '../src/governance-states.js'
import { discoverProposals, planCastVote, readProposalDetail } from '../src/proposals.js'
import { applyTransition, createOperation } from '../src/operation.js'
import { createMockGovernanceAdapter, MOCK_GOVERNANCE_OBSERVED } from '../src/index.js'

// M12-T7: the governance mock, written AFTER the real Coston2 round trip + mainnet
// proposal read, reproducing ONLY what Task 6 observed
// (`.thoughts/verification/2026-08-13-m12-governance.md`). It is a labelled fake
// `PublicClient` the REAL governance code runs against unchanged — these tests drive
// `readGovernanceVotes` / `readEligibility` / `planGovernance` / `reconcileGovernance` /
// `discoverProposals` / `readProposalDetail` / `planCastVote` against it, exactly as the
// real hooks would, with no network.

const ACCOUNT = MOCK_GOVERNANCE_OBSERVED.signer
const TARGET = MOCK_GOVERNANCE_OBSERVED.delegateTarget
const NOW = 1_700_000_000

function mustReads(reads: Awaited<ReturnType<typeof readGovernanceVotes>>) {
  if (!reads) throw new Error('expected reads')
  return reads
}

describe('mock-governance — blank-slate reads match the observed live shape (M12-T7)', () => {
  it('Coston2: getVotes 0, getDelegateOfAtNow zero — the real observed blank slate, not a fabricated fill', async () => {
    const { client, deployment } = createMockGovernanceAdapter()
    const reads = await readGovernanceVotes(client, deployment, ACCOUNT)
    expect(reads).toEqual({ votes: 0n, delegate: zeroAddress })
  })

  it('Coston2: isMember THROWS in the fake client -> readEligibility maps it to undefined, never false', async () => {
    const { client, deployment } = createMockGovernanceAdapter()
    const eligibility = await readEligibility(client, deployment, ACCOUNT)
    expect(eligibility).toEqual({ isProposer: false, canPropose: false, isMember: undefined })
    expect(eligibility?.isMember).not.toBe(false)
  })

  it('Flare mainnet reads the SAME observed blank slate (the live probe read identical values there)', async () => {
    const { client, deployment } = createMockGovernanceAdapter({}, 'flare')
    const reads = await readGovernanceVotes(client, deployment, ACCOUNT)
    const eligibility = await readEligibility(client, deployment, ACCOUNT)
    expect(reads).toEqual({ votes: 0n, delegate: zeroAddress })
    expect(eligibility).toEqual({ isProposer: false, canPropose: false, isMember: undefined })
  })
})

describe('mock-governance drives the REAL planGovernance (Coston2 carries the live governanceVerified flip)', () => {
  it('a valid delegate plan against the blank-slate reads, targeting the observed delegate', async () => {
    const { client, deployment } = createMockGovernanceAdapter()
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const intent: GovernanceIntent = { kind: 'delegate', to: TARGET }
    const result = planGovernance({ intent, deployment, reads, account: ACCOUNT })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.plan.calls[0]?.functionName).toBe('delegate')
    expect(result.plan.calls[0]?.args).toEqual([TARGET])
  })
})

describe('mock-governance drives the REAL reconcileGovernance — succeeded ONLY from the read-back (M12)', () => {
  const DELEGATE: GovernanceIntent = { kind: 'delegate', to: TARGET }
  const UNDELEGATE: GovernanceIntent = { kind: 'undelegate' }

  /** Mirrors governance-states.test.ts's submittedRecord() — a broadcast delegate/undelegate, state `submitted`. */
  function submittedRecord(intent: GovernanceIntent) {
    const base = createOperation({ capability: 'governance', network: 114, intent, now: NOW, id: 'mockgov1' })
    const stepType = intent.kind === 'delegate' ? 'delegate' : 'undelegate'
    const recordType = intent.kind === 'delegate' ? 'await_governance_delegation' : 'await_governance_undelegate'
    const steps = [
      { id: 'call-0', type: stepType, actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: recordType, actor: 'flare', state: 'pending', attempts: 0 },
    ] as const
    const executing = applyTransition(base, { to: 'executing', at: NOW, patch: { steps: [...steps] } }).record
    return applyTransition(executing, { to: 'submitted', at: NOW }).record
  }

  it('a submitted delegate against the pre-broadcast (blank-slate) mock read-back stays awaiting_external, NEVER succeeded', async () => {
    const { client, deployment } = createMockGovernanceAdapter() // default: delegate zero, as before the live tx landed
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const r = reconcileGovernance(submittedRecord(DELEGATE), reads, NOW + 1000)
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })

  it('reaches succeeded ONLY once the mock getDelegateOfAtNow read-back equals the observed target (mirrors tx 0xc0da39ab…d7)', async () => {
    const { client, deployment } = createMockGovernanceAdapter({ delegate: TARGET })
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const r = reconcileGovernance(submittedRecord(DELEGATE), reads, NOW + 2000)
    expect(r.state).toBe('succeeded')
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
    expect(r.awaiting).toBeUndefined()
  })

  it('undelegate reaches succeeded ONLY once the read-back is the zero address (mirrors tx 0x5537335d…7d)', async () => {
    const { client, deployment } = createMockGovernanceAdapter({ delegate: zeroAddress })
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const r = reconcileGovernance(submittedRecord(UNDELEGATE), reads, NOW + 3000)
    expect(r.state).toBe('succeeded')
  })

  it('an undelegate against a still-delegated read-back stays awaiting_external, NEVER succeeded', async () => {
    const { client, deployment } = createMockGovernanceAdapter({ delegate: TARGET })
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const r = reconcileGovernance(submittedRecord(UNDELEGATE), reads, NOW + 1000)
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })
})

describe('mock-governance — the observed mainnet FTSO proposal id=1, nothing fabricated beyond it (M12)', () => {
  it('discoverProposals on Flare returns EXACTLY the one observed proposal — no extra, no Active, no foundation proposal', async () => {
    const { client, deployment } = createMockGovernanceAdapter({}, 'flare')
    const found = await discoverProposals(client, deployment, 100n, 30n)
    expect(found).toHaveLength(1)
    expect(found[0]).toEqual({
      id: 1n,
      source: 'ftso',
      state: 'defeated',
      proposer: MOCK_GOVERNANCE_OBSERVED.proposal.proposer,
      votePowerBlock: undefined,
      voteStart: MOCK_GOVERNANCE_OBSERVED.proposal.voteStart,
      voteEnd: MOCK_GOVERNANCE_OBSERVED.proposal.voteEnd,
    })
  })

  it('readProposalDetail reproduces the real observed tallies/BIPS/window for id=1 exactly', async () => {
    const { client, deployment } = createMockGovernanceAdapter({}, 'flare')
    const detail = await readProposalDetail(client, deployment, 1n, 'ftso', ACCOUNT)
    expect(detail).toEqual({
      id: 1n,
      source: 'ftso',
      state: 'defeated',
      proposer: MOCK_GOVERNANCE_OBSERVED.proposal.proposer,
      votePowerBlock: undefined,
      voteStart: 1_733_413_499n,
      voteEnd: 1_733_586_299n,
      for: 2_354_308_387_975_507_843_417n,
      against: 0n,
      thresholdBIPS: 6600,
      majorityBIPS: 5000,
      totalVotePower: 5_217_782_567_582_675_528_275n,
      hasVoted: undefined,
      accountVotes: undefined,
    })
  })

  it('requesting a second id (never observed live) is honest-unknown, never a fabricated second proposal', async () => {
    const { client, deployment } = createMockGovernanceAdapter({}, 'flare')
    const detail = await readProposalDetail(client, deployment, 2n, 'ftso', ACCOUNT)
    expect(detail).toEqual({ id: 2n, source: 'ftso', state: 'unknown' })
  })

  it('Coston2 discovery is honest-empty — no proposal was ever hosted there', async () => {
    const { client, deployment } = createMockGovernanceAdapter()
    const found = await discoverProposals(client, deployment, 100n, 30n)
    expect(found).toEqual([])
  })

  it('planCastVote for the mock-reproduced observed proposal stays carried — never executable, driven end to end from the mock', async () => {
    const { client, deployment } = createMockGovernanceAdapter({}, 'flare')
    const found = await discoverProposals(client, deployment, 100n, 30n)
    const proposal = found[0]
    if (!proposal) throw new Error('expected the observed proposal')
    const reads = mustReads(await readGovernanceVotes(client, deployment, ACCOUNT))
    const res = planCastVote({ proposal, reads })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected carried')
    expect(res.error.code).toBe('carried')
  })
})

describe('mock-governance refuses the unobserved (M12)', () => {
  it('Coston2 carries the real live governanceVerified flip (true)', () => {
    const { deployment } = createMockGovernanceAdapter()
    expect(deployment.governanceVerified).toBe(true)
  })

  it('Flare mainnet NEVER flips governanceVerified — mainnet is a read lens, never a write target', () => {
    const { deployment } = createMockGovernanceAdapter({}, 'flare')
    expect(deployment.governanceVerified).toBe(false)
  })

  it('a VP/delegate override requested on a non-Coston2 network throws (only Coston2 drove the round trip)', () => {
    expect(() => createMockGovernanceAdapter({ delegate: TARGET }, 'flare')).toThrow(/only observed live on coston2/)
  })

  it('an isProposer/canPropose override on Flare also throws (never fabricate mainnet eligibility beyond the blank slate)', () => {
    expect(() => createMockGovernanceAdapter({ isProposer: true }, 'flare')).toThrow(/only observed live on coston2/)
  })
})
