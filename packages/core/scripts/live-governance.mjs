// packages/core/scripts/live-governance.mjs
/**
 * M12 live governance verification. Two passes, mirroring live-delegation.mjs (M10) and
 * live-stake.mjs (M11):
 *
 *   node scripts/live-governance.mjs            # KEYLESS reads (default). No key.
 *   node scripts/live-governance.mjs read       # same — explicit.
 *   node scripts/live-governance.mjs precheck   # KEYLESS eth_call simulate of delegate (no broadcast).
 *   node scripts/live-governance.mjs broadcast --broadcast    # GATED full round trip (delegate→flip→undelegate).
 *   node scripts/live-governance.mjs delegate --broadcast     # GATED delegate + confirm only.
 *   node scripts/live-governance.mjs flip --broadcast         # source-flip (coston2) — after a confirmed read-back.
 *   node scripts/live-governance.mjs undelegate --broadcast   # GATED undelegate + confirm only (closes the trip).
 * The write modes ALSO require the env token LIVE_GOV_BROADCAST + GOV_DELEGATE_TARGET.
 *
 * READ PASS (keyless, ALWAYS): drives the SHIPPED core read code — `readGovernanceVotes` +
 * `readEligibility` (governance-adapter.ts) on Coston2 (114, the write/verify target), and
 * `discoverProposals` + `readProposalDetail` (proposals.ts) on Flare mainnet (14, the proposal
 * read lens). It records the honest live states: the account's blank-slate governance VP /
 * current delegate / eligibility (with `isMember` UNDEFINED — it reverts, probe CONCERN A),
 * the real mainnet FTSO proposal #1 ("Block-latency parameter changes", Defeated) with its
 * full observed tallies / BIPS, and the Coston2 honest-empty discovery. Then it proves the
 * Task-4 `planGovernance` gate holds against the LIVE reads. Since the Task-6 round trip landed
 * (2026-08-13) Coston2 carries `governanceVerified: true` and Flare mainnet is still `false`, so
 * the gate is now proven on MAINNET — the network no live run has driven, where the builder
 * REFUSES a signable plan (`unverified`) — while Coston2 emits a real plan directly, with no
 * override. The invariants (self_delegation / invalid_target / no_delegate / already_delegated)
 * fire against the real reads. No key is read, nothing is signed, nothing is broadcast.
 *
 * BROADCAST PASS (GATED — moves real governance vote power; RAN once on Abu's explicit go,
 * 2026-08-13, and is the reason `governanceVerified` is true on Coston2): wires
 * `delegate(to) → poll getDelegateOfAtNow → flip governanceVerified → undelegate() → poll zero`
 * behind a DOUBLE guard — the `--broadcast` CLI flag AND the `LIVE_GOV_BROADCAST` env token,
 * both required so it can never fire by accident. When either is missing (the default, and this
 * run) the pass records the refusal and STOPS before reading the secrets file, constructing a
 * signer, or touching the private key. It flips `governanceVerified` (Coston2 only) exclusively
 * AFTER a confirmed `getDelegateOfAtNow` read-back, never from the send.
 *
 * SECRETS: the account ADDRESS is a hardcoded public value (the M8/M10/M11 signer, exactly as
 * the Task-1 probe pins it). The keyless read pass NEVER opens `.secrets/live-run.json`. The
 * private key is read ONLY inside the gated broadcast branch, after the double guard passes; it
 * is never logged, printed, put in `--json` output, or written to any evidence file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, formatUnits, getAddress, http, isAddress, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainFor, governanceFor } from '@flare-kit/contracts'
import {
  buildDelegateCall,
  discoverProposals,
  governancePosition,
  planGovernance,
  readEligibility,
  readGovernanceVotes,
  readProposalDetail,
  reconcileGovernance,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const MODE = process.argv[2] ?? 'read'
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`
const MD_PATH = `${ROOT}/.thoughts/verification/2026-08-13-m12-governance.md`
const JSON_PATH = `${ROOT}/.thoughts/verification/2026-08-13-m12-governance-reads.json`
const GOVERNANCE_TS = `${ROOT}/packages/contracts/src/governance.ts`

// The M8/M10/M11 signer — ADDRESS ONLY (keyless read). The keyless pass uses nothing but this
// public value and never opens the secrets file. Blank-slate governance expected on both nets.
const ACCOUNT = getAddress('0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9')

// Bounded discovery, mirroring the Task-1 probe (RPC caps eth_getLogs to ~30 blocks/call).
const LOOKBACK_BLOCKS = 4500n
const MAX_RANGE = 30n

// A well-formed, non-zero, non-self delegate target used ONLY to exercise the pure plan gate in
// the keyless pass (no call is ever signed against it). Distinct from ACCOUNT and the zero addr.
const PLAN_PROBE_TARGET = getAddress('0x1000000000000000000000000000000000000001')

// The broadcast DOUBLE guard: the env token that must accompany the --broadcast flag. Both are
// required, so the value-moving round trip can never fire by accident or from a bare invocation.
const BROADCAST_TOKEN = 'i-understand-this-moves-real-governance-vote-power'
const POLL_MS = 6_000
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS ?? 40)

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const log = (step, data = {}) => console.log(`[${step}]`, JSON.stringify(data, jsonify))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowSec = () => Math.floor(Date.now() / 1000)

function clientFor(chainId) {
  const c = chainFor(chainId)
  const chain = { id: c.id, name: c.name, nativeCurrency: c.nativeCurrency, rpcUrls: { default: { http: [c.rpcUrl] } } }
  return { meta: c, client: createPublicClient({ chain, transport: http(c.rpcUrl) }) }
}

// ============================ READ PASS (keyless, runs now) ============================
async function read() {
  const c2 = clientFor(114)
  const fl = clientFor(14)
  const govC2 = governanceFor('coston2')
  const govFlare = governanceFor('flare')
  const c2Block = await c2.client.getBlockNumber()
  const flareBlock = await fl.client.getBlockNumber()

  // --- Coston2 (write/verify target): governance VP + current delegate + eligibility. ---
  const c2Votes = await readGovernanceVotes(c2.client, govC2, ACCOUNT)
  const c2Elig = await readEligibility(c2.client, govC2, ACCOUNT)
  const c2Position = governancePosition(c2Votes)
  const c2Native = await c2.client.getBalance({ address: ACCOUNT })

  const coston2Reads = {
    block: c2Block.toString(),
    governanceVotePower: govC2.governanceVotePower,
    votes: c2Votes === undefined ? null : c2Votes.votes.toString(),
    votesHuman: c2Votes === undefined ? null : formatUnits(c2Votes.votes, 18),
    delegate: c2Votes === undefined ? null : c2Votes.delegate,
    delegateIsZero: c2Votes !== undefined && c2Votes.delegate.toLowerCase() === zeroAddress,
    votesRender: c2Votes === undefined
      ? 'unavailable: readGovernanceVotes threw — NOT rendered as 0'
      : `observed: ${formatUnits(c2Votes.votes, 18)} governance VP, delegate ${c2Votes.delegate} — a real blank-slate read (0 VP, zero delegate), not a fabricated fill`,
    position: c2Position.status,
    eligibility: c2Elig === undefined
      ? null
      : { isProposer: c2Elig.isProposer, canPropose: c2Elig.canPropose, isMember: c2Elig.isMember ?? null },
    eligibilityRender: c2Elig === undefined
      ? 'unavailable: an essential eligibility read threw'
      : `isProposer=${c2Elig.isProposer} canPropose=${c2Elig.canPropose} isMember=${c2Elig.isMember === undefined ? 'undefined (PollingFtso.isMember REVERTS for a non-member — probe CONCERN A; never coerced to false)' : c2Elig.isMember}`,
    nativeC2flr: c2Native.toString(),
    nativeC2flrHuman: formatUnits(c2Native, 18),
  }
  log('read:coston2:governance', coston2Reads)

  // --- Coston2 discovery: honest-empty (no proposal has ever been created there). ---
  const c2Proposals = await discoverProposals(c2.client, govC2, LOOKBACK_BLOCKS, MAX_RANGE)
  const coston2Discovery = {
    count: c2Proposals.length,
    proposals: c2Proposals.map(summaryOut),
    render: c2Proposals.length === 0
      ? 'honest-empty: getLastProposal id 0 + bounded PollingFoundation scan found none — Coston2 hosts no proposal (blank), never invented'
      : `${c2Proposals.length} proposal(s) discovered`,
  }
  log('read:coston2:discovery', coston2Discovery)

  // --- Flare mainnet (proposal read lens): discover + detail the REAL FTSO proposal #1. ---
  const flVotes = await readGovernanceVotes(fl.client, govFlare, ACCOUNT)
  const flElig = await readEligibility(fl.client, govFlare, ACCOUNT)
  const flProposals = await discoverProposals(fl.client, govFlare, LOOKBACK_BLOCKS, MAX_RANGE)
  const ftsoSummary = flProposals.find((p) => p.source === 'ftso')
  const detail = ftsoSummary
    ? await readProposalDetail(fl.client, govFlare, ftsoSummary.id, 'ftso', ACCOUNT)
    : null

  const detailOut = detail && detail.state !== 'unknown'
    ? {
        id: detail.id.toString(),
        source: detail.source,
        state: detail.state,
        proposer: detail.proposer,
        voteStart: detail.voteStart.toString(),
        voteStartIso: new Date(Number(detail.voteStart) * 1000).toISOString(),
        voteEnd: detail.voteEnd.toString(),
        voteEndIso: new Date(Number(detail.voteEnd) * 1000).toISOString(),
        for: detail.for.toString(),
        forHuman: formatUnits(detail.for, 18),
        against: detail.against.toString(),
        againstHuman: formatUnits(detail.against, 18),
        thresholdBIPS: detail.thresholdBIPS,
        majorityBIPS: detail.majorityBIPS,
        totalVotePower: detail.totalVotePower === undefined ? null : detail.totalVotePower.toString(),
        totalVotePowerHuman: detail.totalVotePower === undefined ? null : formatUnits(detail.totalVotePower, 18),
        // FTSO deployed shape carries none of these — undefined, never fabricated.
        votePowerBlock: detail.votePowerBlock === undefined ? null : detail.votePowerBlock.toString(),
        hasVoted: detail.hasVoted === undefined ? null : detail.hasVoted,
        accountVotes: detail.accountVotes === undefined ? null : detail.accountVotes.toString(),
      }
    : null
  const flareReads = {
    block: flareBlock.toString(),
    governanceVotePower: govFlare.governanceVotePower,
    votes: flVotes === undefined ? null : flVotes.votes.toString(),
    delegate: flVotes === undefined ? null : flVotes.delegate,
    eligibility: flElig === undefined ? null : { isProposer: flElig.isProposer, canPropose: flElig.canPropose, isMember: flElig.isMember ?? null },
    discoveryCount: flProposals.length,
    discovered: flProposals.map(summaryOut),
    ftsoProposalDetail: detailOut,
    render: detailOut
      ? `real mainnet FTSO proposal #${detailOut.id} — ${detailOut.state}; for ${detailOut.forHuman} / against ${detailOut.againstHuman}; threshold ${detailOut.thresholdBIPS} BIPS / majority ${detailOut.majorityBIPS} BIPS`
      : 'no FTSO proposal discovered on mainnet (unexpected — probe found #1)',
  }
  log('read:flare:proposal', flareReads)

  // --- planGovernance gate + invariant proof against the LIVE Coston2 reads. ---
  if (c2Votes === undefined) throw new Error('coston2 governance reads unavailable — cannot prove the plan gate against live reads')
  const liveReads = { delegate: c2Votes.delegate }

  // POST-FLIP reality (Task 6 landed 2026-08-13): Coston2 carries `governanceVerified: true`,
  // Flare mainnet is still `false`. So the gate is proven on MAINNET — the network no live run
  // has ever driven — and Coston2 is proven to emit a real plan directly, with no override.
  // 1. Verified gate: the mainnet read lens REFUSES a signable delegate plan.
  const gate = planGovernance({ intent: { kind: 'delegate', to: PLAN_PROBE_TARGET }, deployment: govFlare, reads: liveReads, account: ACCOUNT })
  // 2. Same intent on the live-verified Coston2 deployment -> a real plan (the mechanism is built).
  const validOnVerified = planGovernance({ intent: { kind: 'delegate', to: PLAN_PROBE_TARGET }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  // 3. Self-delegation invariant (on the verified net, so the gate is not what refuses).
  const selfDelegation = planGovernance({ intent: { kind: 'delegate', to: ACCOUNT }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  // 4. Invalid (zero) target invariant.
  const invalidTarget = planGovernance({ intent: { kind: 'delegate', to: zeroAddress }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  // 5. Undelegate with no current delegate (the live blank-slate delegate is the zero address).
  const noDelegate = planGovernance({ intent: { kind: 'undelegate' }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  // 6. Re-delegating to the CURRENT delegate is refused — otherwise the reconciler would read
  //    `succeeded` off pre-existing state. On the live blank slate the current delegate IS the
  //    zero address, which `invalid_target` catches first, so the code expected depends on the
  //    live read rather than being asserted blind.
  const alreadyDelegated = planGovernance({ intent: { kind: 'delegate', to: c2Votes.delegate }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  const alreadyDelegatedExpected = c2Votes.delegate.toLowerCase() === zeroAddress ? 'invalid_target' : 'already_delegated'

  const plan = {
    probeTarget: PLAN_PROBE_TARGET,
    verifiedGate: { network: 'flare', governanceVerified: govFlare.governanceVerified, ok: gate.ok, error: gate.ok ? null : gate.error.code },
    validOnVerified: { network: 'coston2', governanceVerified: govC2.governanceVerified, ok: validOnVerified.ok, calls: validOnVerified.ok ? validOnVerified.plan.calls.map((c) => c.functionName) : null },
    selfDelegation: { ok: selfDelegation.ok, error: selfDelegation.ok ? null : selfDelegation.error.code },
    invalidTarget: { ok: invalidTarget.ok, error: invalidTarget.ok ? null : invalidTarget.error.code },
    noDelegate: { ok: noDelegate.ok, error: noDelegate.ok ? null : noDelegate.error.code },
    alreadyDelegated: { ok: alreadyDelegated.ok, error: alreadyDelegated.ok ? null : alreadyDelegated.error.code },
  }
  log('read:plan', plan)

  // --- Honest-expectation assertions: fail loud on any drift from the Task-1 probe reality. ---
  const checks = [
    ['coston2 VP observed 0', c2Votes.votes === 0n],
    ['coston2 delegate is zero address', c2Votes.delegate.toLowerCase() === zeroAddress],
    ['coston2 position observed (not unavailable)', c2Position.status === 'observed'],
    ['coston2 isProposer false', c2Elig?.isProposer === false],
    ['coston2 canPropose false', c2Elig?.canPropose === false],
    ['coston2 isMember undefined (reverts — probe CONCERN A)', c2Elig?.isMember === undefined],
    ['coston2 discovery honest-empty []', c2Proposals.length === 0],
    ['mainnet FTSO proposal discovered', !!ftsoSummary],
    ['mainnet FTSO proposal id 1', ftsoSummary?.id === 1n],
    ['mainnet FTSO proposal Defeated', detail?.state === 'defeated'],
    ['mainnet for 2354308387975507843417', detail?.for === 2354308387975507843417n],
    ['mainnet against 0', detail?.against === 0n],
    ['mainnet threshold 6600 BIPS', detail?.thresholdBIPS === 6600],
    ['mainnet majority 5000 BIPS', detail?.majorityBIPS === 5000],
    ['mainnet totalVotePower 5217782567582675528275', detail?.totalVotePower === 5217782567582675528275n],
    ['mainnet proposer b5Dd6cA7…979CFE', detail?.proposer?.toLowerCase() === '0xb5dd6ca7b14bd7d2b6e296983d0aa0d373979cfe'],
    ['FTSO shape: votePowerBlock undefined', detail?.votePowerBlock === undefined],
    ['FTSO shape: hasVoted undefined', detail?.hasVoted === undefined],
    ['FTSO shape: accountVotes undefined', detail?.accountVotes === undefined],
    ['plan gate refuses on mainnet (unverified — the read lens)', gate.ok === false && gate.error.code === 'unverified'],
    ['plan valid on the live-verified coston2 deployment', validOnVerified.ok === true],
    ['self-delegation refused', selfDelegation.ok === false && selfDelegation.error.code === 'self_delegation'],
    ['invalid target refused', invalidTarget.ok === false && invalidTarget.error.code === 'invalid_target'],
    ['undelegate no-delegate refused', noDelegate.ok === false && noDelegate.error.code === 'no_delegate'],
    [`re-delegate to current delegate refused (${alreadyDelegatedExpected})`, alreadyDelegated.ok === false && alreadyDelegated.error.code === alreadyDelegatedExpected],
    // Post-flip: Coston2 carries the live round trip (Task 6, 2026-08-13); mainnet never flips.
    ['governanceVerified true (coston2 source — the live round trip)', govC2.governanceVerified === true],
    ['governanceVerified false (flare source — read lens, never a write target)', govFlare.governanceVerified === false],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)

  const evidence = {
    ranAt: new Date().toISOString(),
    milestone: 'M12 governance — Task 6 keyless live reads (AC1) + plan/invariant proof (AC2)',
    broadcast: false,
    keyless: true,
    account: ACCOUNT,
    deployment: {
      coston2: { ...pickAddrs(govC2), governanceVerified: govC2.governanceVerified },
      flare: { ...pickAddrs(govFlare), governanceVerified: govFlare.governanceVerified },
    },
    coston2Reads,
    coston2Discovery,
    flareReads,
    plan,
    honestExpectations: { all: failed.length === 0, failed },
    broadcastGuard: {
      mechanism: 'DOUBLE guard: the delegate/undelegate broadcast runs only with the `--broadcast` CLI flag AND `LIVE_GOV_BROADCAST` set to the token, both required.',
      ran: false,
      keyRead: false,
      note: 'Default invocation is the keyless read pass; the broadcast branch was not entered and the secrets file was never opened.',
    },
    carry:
      'The Coston2 delegate/undelegate round trip RAN on Abu\'s explicit go (2026-08-13) and governanceVerified is now true there — delegate tx 0xc0da39abf699242a1306c7ac659c59d7df98612940e8b4036ec6d0075d1419d7 (block 34007574) read back the target via getDelegateOfAtNow, undelegate tx 0x5537335d5fcabebcb512b9ece76f258b15cba773fd6a3785e0697e76e75bea7d (block 34007843) read back the zero address. Flare mainnet stays false: it is the proposal read lens and no live run has driven a governance delegation there, so the write stays declared-unbuilt on mainnet. This read pass still broadcasts nothing and reads no key; re-running it re-proves the gate on mainnet and the plan on Coston2 against live reads.',
    note: 'READ-ONLY: readGovernanceVotes + readEligibility + governancePosition + discoverProposals + readProposalDetail + planGovernance (pure). No signer constructed, no key read, nothing broadcast; the account address is the only account value used.',
  }

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
  writeEvidenceMd(evidence)
  log('read:done', { honest: failed.length === 0, failed, json: JSON_PATH, md: MD_PATH })
  if (failed.length) throw new Error(`honest-read expectations failed: ${failed.join(', ')}`)
}

const summaryOut = (p) => ({
  id: p.id.toString(),
  source: p.source,
  state: p.state,
  proposer: p.proposer,
  votePowerBlock: p.votePowerBlock === undefined ? null : p.votePowerBlock.toString(),
  voteStart: p.voteStart.toString(),
  voteEnd: p.voteEnd.toString(),
})
const pickAddrs = (d) => ({
  governanceVotePower: d.governanceVotePower,
  pollingFoundation: d.pollingFoundation,
  pollingFtso: d.pollingFtso,
  pollingManagementGroup: d.pollingManagementGroup,
  chainId: d.chainId,
})

// ======================= PRECHECK (keyless read-only simulate) =======================
// Read-only eth_call simulate of `delegate(target)` from the account ADDRESS (no key, no
// broadcast) to learn whether the 0-VP account can set the delegate pointer directly, or whether
// a minimal WNat wrap is needed first. `simulateContract` with `account` as the address does not
// sign — it is a pure eth_call. Prints the result; never mutates anything.
async function precheck() {
  const targetRaw = process.env.GOV_DELEGATE_TARGET
  if (!targetRaw || !isAddress(targetRaw, { strict: false })) throw new Error('set GOV_DELEGATE_TARGET to a well-formed address')
  const target = getAddress(targetRaw)
  const c2 = clientFor(114)
  const govC2 = governanceFor('coston2')
  const votes = await readGovernanceVotes(c2.client, govC2, ACCOUNT)
  const call = buildDelegateCall(govC2, target)
  let result
  try {
    await c2.client.simulateContract({ account: ACCOUNT, address: call.address, abi: call.abi, functionName: call.functionName, args: call.args })
    result = { ok: true, wrapNeeded: false }
  } catch (e) {
    const reason = String(e.shortMessage || e.message || e).split('\n')[0].slice(0, 200)
    result = { ok: false, reason, wrapNeeded: /vote power|balance|zero|amount/i.test(reason) }
  }
  log('precheck', { target, account: ACCOUNT, govVotePower: votes?.votes?.toString() ?? null, delegateSimulate: result })
}

// ======================= BROADCAST PASS (GATED — HELD today) =======================
// A minimal OperationRecord carrying the plan's real spine, so reconcileGovernance walks the
// actual wallet+flare steps (not a synthetic empty spine). Mirrors live-delegation's recordFor.
const recordFor = (plan, intent, id) => ({
  state: 'submitted', steps: plan.plan.steps, evidence: [], attempts: [], quoteHistory: [],
  updatedAt: 0, createdAt: 0, id, capability: 'governance', network: 114, intent, schemaVersion: 1,
})

// DOUBLE GUARD: true only when BOTH the --broadcast flag AND the LIVE_GOV_BROADCAST token are
// present. A missing guard STOPS every write path before any key read — nothing is signed.
const guardOk = () => process.argv.includes('--broadcast') && process.env.LIVE_GOV_BROADCAST === BROADCAST_TOKEN
const guardState = () => ({ flagPresent: process.argv.includes('--broadcast'), envPresent: process.env.LIVE_GOV_BROADCAST === BROADCAST_TOKEN })

function resolveTarget() {
  const raw = process.env.GOV_DELEGATE_TARGET
  if (!raw || !isAddress(raw, { strict: false }) || raw.toLowerCase() === zeroAddress || raw.toLowerCase() === ACCOUNT.toLowerCase()) {
    throw new Error('set GOV_DELEGATE_TARGET to a well-formed, non-zero, non-self delegate address (recorded in evidence)')
  }
  return getAddress(raw)
}

const loadEvidence = () => (existsSync(JSON_PATH) ? JSON.parse(readFileSync(JSON_PATH, 'utf8')) : {})
const saveEvidence = (e) => writeFileSync(JSON_PATH, JSON.stringify(e, jsonify, 2))

// Build the signer + clients. The private key is read ONLY here, inside a guarded write path,
// solely to construct the local Account; it is never logged, printed, in --json, or in evidence.
function makeSigner() {
  const account = privateKeyToAccount(JSON.parse(readFileSync(SECRETS_PATH, 'utf8')).evm.privateKey)
  if (getAddress(account.address) !== ACCOUNT) throw new Error('secrets signer address does not match the expected account')
  const c2 = chainFor(114)
  const chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
  return { account, c2, publicClient: createPublicClient({ chain, transport: http(c2.rpcUrl) }), walletClient: createWalletClient({ account, chain, transport: http(c2.rpcUrl) }) }
}

// delegate(target): sign, then reach succeeded ONLY from the getDelegateOfAtNow read-back.
async function doDelegate(ctx, target, evidence) {
  const { account, c2, publicClient, walletClient } = ctx
  const govC2 = governanceFor('coston2')
  const verified = { ...govC2, governanceVerified: true } // signing OVERRIDE — the SOURCE flag flips only after the read-back
  const pre = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
  const intent = { kind: 'delegate', to: target }
  const plan = planGovernance({ intent, deployment: verified, reads: { delegate: pre.delegate }, account: ACCOUNT })
  if (!plan.ok) throw new Error(`delegate plan refused: ${plan.error.code}`)
  const hash = await signCall(publicClient, walletClient, account, plan.plan.calls[0], 'delegate')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
    const op = reconcileGovernance(recordFor(plan, intent, 'gov-delegate'), { delegate: now.delegate }, nowSec())
    if (op.state === 'succeeded') {
      evidence.broadcastRun.delegate = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, target, delegateReadBack: now.delegate, opState: op.state, confirmedAt: new Date().toISOString() }
      saveEvidence(evidence); log('broadcast:delegate:CONFIRMED', evidence.broadcastRun.delegate); return true
    }
    await sleep(POLL_MS)
  }
  evidence.broadcastRun.delegate = { tx: hash, target, staged: true, note: 're-run to observe getDelegateOfAtNow reflect the target' }
  saveEvidence(evidence); log('broadcast:delegate:staged', evidence.broadcastRun.delegate); return false
}

// undelegate(): sign, then reach succeeded ONLY when getDelegateOfAtNow reads the zero address.
async function doUndelegate(ctx, evidence) {
  const { account, c2, publicClient, walletClient } = ctx
  const govC2 = governanceFor('coston2')
  const verified = { ...govC2, governanceVerified: true }
  const pre = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
  if (pre.delegate.toLowerCase() === zeroAddress) {
    // Nothing to clear — the round trip is already closed. Never send a gas-burning no-op.
    evidence.broadcastRun.undelegate = { alreadyZero: true, delegateReadBack: pre.delegate, note: 'getDelegateOfAtNow already the zero address — no residual delegation to clear' }
    saveEvidence(evidence); log('broadcast:undelegate:already-zero', evidence.broadcastRun.undelegate); return true
  }
  const intent = { kind: 'undelegate' }
  const plan = planGovernance({ intent, deployment: verified, reads: { delegate: pre.delegate }, account: ACCOUNT })
  if (!plan.ok) throw new Error(`undelegate plan refused: ${plan.error.code}`)
  const hash = await signCall(publicClient, walletClient, account, plan.plan.calls[0], 'undelegate')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
    const op = reconcileGovernance(recordFor(plan, intent, 'gov-undelegate'), { delegate: now.delegate }, nowSec())
    if (op.state === 'succeeded') {
      evidence.broadcastRun.undelegate = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, delegateReadBack: now.delegate, opState: op.state, confirmedAt: new Date().toISOString() }
      saveEvidence(evidence); log('broadcast:undelegate:CONFIRMED', evidence.broadcastRun.undelegate); return true
    }
    await sleep(POLL_MS)
  }
  evidence.broadcastRun.undelegate = { tx: hash, staged: true, note: 're-run to observe getDelegateOfAtNow reflect the zero address' }
  saveEvidence(evidence); log('broadcast:undelegate:staged', evidence.broadcastRun.undelegate); return false
}

// Full atomic round trip: delegate → (on confirm) flip → undelegate. The discrete `delegate`,
// `flip` and `undelegate` modes drive the same steps individually when tests must run between.
async function broadcast() {
  if (!guardOk()) { log('broadcast:REFUSED-held', { ...guardState(), note: 'HELD: needs --broadcast AND LIVE_GOV_BROADCAST token. No key read, nothing signed, governanceVerified untouched.' }); return }
  const target = resolveTarget()
  const ctx = makeSigner()
  const evidence = loadEvidence()
  evidence.broadcastRun = { ranAt: new Date().toISOString(), account: ACCOUNT, target, delegate: {}, undelegate: {} }
  if (!(await doDelegate(ctx, target, evidence))) return // staged — do NOT flip on an unconfirmed read-back
  flip()
  await doUndelegate(ctx, evidence)
}

// `delegate` mode: delegate + confirm only (guarded). Leaves flip/undelegate to their own steps.
async function delegateOnly() {
  if (!guardOk()) { log('broadcast:REFUSED-held', { ...guardState(), note: 'HELD: needs --broadcast AND LIVE_GOV_BROADCAST token.' }); return }
  const target = resolveTarget()
  const ctx = makeSigner()
  const evidence = loadEvidence()
  evidence.broadcastRun = { ...(evidence.broadcastRun ?? {}), ranAt: new Date().toISOString(), account: ACCOUNT, target, delegate: {}, undelegate: evidence.broadcastRun?.undelegate ?? {} }
  await doDelegate(ctx, target, evidence)
}

// `undelegate` mode: undelegate + confirm only (guarded). Closes the round trip.
async function undelegateOnly() {
  if (!guardOk()) { log('broadcast:REFUSED-held', { ...guardState(), note: 'HELD: needs --broadcast AND LIVE_GOV_BROADCAST token.' }); return }
  const ctx = makeSigner()
  const evidence = loadEvidence()
  evidence.broadcastRun = { ...(evidence.broadcastRun ?? { account: ACCOUNT }), undelegate: {} }
  await doUndelegate(ctx, evidence)
}

// `flip` mode: source-flip governanceVerified (Coston2 only) — GUARDED by the double guard AND a
// keyless re-read confirming getDelegateOfAtNow still equals the recorded, confirmed target. It
// touches no key and sends no tx; it only persists the flag AFTER the delegate read-back proved it.
async function flipMode() {
  if (!guardOk()) { log('flip:REFUSED-held', { ...guardState(), note: 'HELD: needs --broadcast AND LIVE_GOV_BROADCAST token.' }); return }
  const target = resolveTarget()
  const evidence = loadEvidence()
  const rec = evidence.broadcastRun?.delegate
  if (rec?.opState !== 'succeeded' || (rec?.delegateReadBack ?? '').toLowerCase() !== target.toLowerCase()) {
    throw new Error('refusing to flip: evidence carries no confirmed delegate read-back equal to the target')
  }
  // Keyless re-read: confirm the delegation is STILL live (getDelegateOfAtNow == target) right now.
  const live = await readGovernanceVotes(clientFor(114).client, governanceFor('coston2'), ACCOUNT)
  if (live.delegate.toLowerCase() !== target.toLowerCase()) {
    throw new Error(`refusing to flip: live getDelegateOfAtNow ${live.delegate} != confirmed target ${target}`)
  }
  flip()
}

// Sign one built governance call: simulate (eth_call, pass the Account object) → writeContract →
// wait for the receipt. ONLY the write paths call this; the keyless read/precheck never do.
async function signCall(publicClient, walletClient, account, call, label) {
  const { request } = await publicClient.simulateContract({ account, address: call.address, abi: call.abi, functionName: call.functionName, args: call.args })
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log(label, { hash, block: receipt.blockNumber.toString(), status: receipt.status })
  return hash
}

// Source-flip governanceVerified false→true for COSTON2 ONLY (the write/verify net; mainnet is a
// read lens and never flips). governance.ts carries the flag on BOTH networks, so this flips the
// `governanceVerified: false` that sits inside the `coston2: {` block (before `flare: {`), located
// by the object-key markers — NOT the `flare:` mention in the doc comment. GUARDED: reached only
// after a confirmed delegate read-back (broadcast()/flipMode()).
function flip() {
  const src = readFileSync(GOVERNANCE_TS, 'utf8')
  const needle = 'governanceVerified: false'
  const coston2Idx = src.indexOf('coston2: {')
  const flareIdx = src.indexOf('flare: {')
  if (coston2Idx === -1 || flareIdx === -1) throw new Error('could not locate the coston2/flare deployment blocks in governance.ts')
  const idx = src.indexOf(needle, coston2Idx)
  if (idx === -1 || idx > flareIdx) throw new Error('coston2 governanceVerified:false not found within the coston2 block — refusing to flip')
  const flipped = src.slice(0, idx) + 'governanceVerified: true' + src.slice(idx + needle.length)
  writeFileSync(GOVERNANCE_TS, flipped)
  log('flip', { file: GOVERNANCE_TS, network: 'coston2', governanceVerified: true })
}

// Human-readable keyless-read evidence (AC1/AC2). Composed from the evidence object; no key material.
function writeEvidenceMd(e) {
  const c = e.coston2Reads
  const f = e.flareReads
  const d = f.ftsoProposalDetail
  const p = e.plan
  const md = [
    '# M12 governance — LIVE keyless reads (AC1) + plan/invariant proof (AC2)',
    '',
    `- Ran: ${e.ranAt} · account \`${e.account}\``,
    '- Networks: **Coston2** (114, write/verify target) + **Flare mainnet** (14, proposal read lens)',
    '- Broadcast: **none** — KEYLESS read pass. The delegate/undelegate round trip is HELD on Abu\'s go (see Carry).',
    '- `governanceVerified`: **true** on Coston2 (flipped by the Task-6 live round trip, 2026-08-13: delegate tx `0xc0da39ab…19d7` block 34007574 read back the target; undelegate tx `0x5537335d…bea7d` block 34007843 read back the zero address) · **false** on Flare mainnet (a read lens, never a write target this milestone).',
    '',
    '## Coston2 governance state (honest observed / undefined — nothing fabricated)',
    '',
    `- block **${c.block}** · GovernanceVotePower \`${c.governanceVotePower}\``,
    `- governance vote power: **${c.votesHuman}** (${c.votes} wei) · position **${c.position}**`,
    `- current delegate: \`${c.delegate}\` (zero? ${c.delegateIsZero})`,
    `- eligibility: ${c.eligibilityRender}`,
    `- native: **${c.nativeC2flrHuman} C2FLR**`,
    `- ${c.votesRender}`,
    '',
    '## Coston2 proposal discovery',
    '',
    `- discovered: **${e.coston2Discovery.count}** — ${e.coston2Discovery.render}`,
    '',
    '## Flare mainnet — the real FTSO proposal (read lens, discovered live)',
    '',
    `- block **${f.block}** · discovered **${f.discoveryCount}** proposal(s) via getLastProposal + bounded PollingFoundation scan`,
    d
      ? [
          `- **FTSO proposal #${d.id}** — state **${d.state}** (index 3 mapped via the FTSO enum: 3 = Defeated, NOT the foundation enum's Succeeded)`,
          `  - proposer \`${d.proposer}\``,
          `  - votes: **for ${d.forHuman}** (${d.for} wei) · **against ${d.againstHuman}** (${d.against} wei)`,
          `  - threshold **${d.thresholdBIPS} BIPS** · majority **${d.majorityBIPS} BIPS** · totalVotePower **${d.totalVotePowerHuman}** (${d.totalVotePower} wei)`,
          `  - window: ${d.voteStartIso} → ${d.voteEndIso}`,
          `  - FTSO deployed shape carries no votePowerBlock / hasVoted / per-voter votes → rendered "—" (undefined), never fabricated`,
        ].join('\n')
      : '- no FTSO proposal discovered (unexpected)',
    '',
    '## planGovernance gate + invariants against the LIVE Coston2 reads (AC2-plan)',
    '',
    `- **verified gate on ${p.verifiedGate.network}**: governanceVerified=${p.verifiedGate.governanceVerified} → refused \`${p.verifiedGate.error}\` — no signable plan is emitted on a network no live run has driven, proven against real reads`,
    `- **valid on ${p.validOnVerified.network}** (governanceVerified=${p.validOnVerified.governanceVerified}, the live-verified net — no override): plan OK, calls \`${JSON.stringify(p.validOnVerified.calls)}\``,
    `- **self-delegation** (to = account) → refused \`${p.selfDelegation.error}\``,
    `- **invalid (zero) target** → refused \`${p.invalidTarget.error}\``,
    `- **undelegate with no current delegate** (live zero delegate) → refused \`${p.noDelegate.error}\``,
    `- **re-delegate to the CURRENT delegate** → refused \`${p.alreadyDelegated.error}\` — never a plan whose read-back is already satisfied by pre-existing state`,
    '',
    '## Carry',
    '',
    `- ${e.carry}`,
    `- honest-read expectations all passed: **${e.honestExpectations.all}**${e.honestExpectations.failed.length ? ' — failed: ' + e.honestExpectations.failed.join(', ') : ''}`,
    '- Broadcast path: wired (`broadcast` subcommand) behind a DOUBLE guard — the `--broadcast` flag AND `LIVE_GOV_BROADCAST` token, both required. This run entered neither; the secrets file was never opened and no key was read.',
    '',
  ].join('\n')
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(MD_PATH, md)
}

async function main() {
  log('start', { mode: MODE, account: ACCOUNT, coston2Verified: governanceFor('coston2').governanceVerified, flareVerified: governanceFor('flare').governanceVerified })
  if (MODE === 'read') await read()
  else if (MODE === 'precheck') await precheck()
  else if (MODE === 'broadcast') await broadcast()
  else if (MODE === 'delegate') await delegateOnly()
  else if (MODE === 'flip') await flipMode()
  else if (MODE === 'undelegate') await undelegateOnly()
  else throw new Error(`unknown mode ${MODE} (use: read | precheck | broadcast | delegate | flip | undelegate)`)
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
