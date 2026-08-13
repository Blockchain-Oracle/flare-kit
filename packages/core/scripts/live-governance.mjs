// packages/core/scripts/live-governance.mjs
/**
 * M12 live governance verification. Two passes, mirroring live-delegation.mjs (M10) and
 * live-stake.mjs (M11):
 *
 *   node scripts/live-governance.mjs            # KEYLESS reads (default). Runs now, no key.
 *   node scripts/live-governance.mjs read       # same — explicit.
 *   node scripts/live-governance.mjs broadcast --broadcast   # GATED delegate/undelegate. HELD.
 *
 * READ PASS (keyless, ALWAYS): drives the SHIPPED core read code — `readGovernanceVotes` +
 * `readEligibility` (governance-adapter.ts) on Coston2 (114, the write/verify target), and
 * `discoverProposals` + `readProposalDetail` (proposals.ts) on Flare mainnet (14, the proposal
 * read lens). It records the honest live states: the account's blank-slate governance VP /
 * current delegate / eligibility (with `isMember` UNDEFINED — it reverts, probe CONCERN A),
 * the real mainnet FTSO proposal #1 ("Block-latency parameter changes", Defeated) with its
 * full observed tallies / BIPS, and the Coston2 honest-empty discovery. Then it proves the
 * Task-4 `planGovernance` gate holds against the LIVE reads: with `governanceVerified:false`
 * the builder REFUSES a signable plan (`unverified`) — no plan is emitted while unverified —
 * while a verified OVERRIDE (NOT a source flip) shows the mechanism is built and the invariants
 * (self_delegation / invalid_target / no_delegate) fire against the real reads. No key is read,
 * nothing is signed, nothing is broadcast.
 *
 * BROADCAST PASS (GATED — moves real governance vote power, HELD on Abu's explicit go): wires
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
  const verified = { ...govC2, governanceVerified: true } // OVERRIDE for the demo — NOT a source flip

  // 1. Verified gate: the REAL (unflipped) deployment REFUSES a signable delegate plan.
  const gate = planGovernance({ intent: { kind: 'delegate', to: PLAN_PROBE_TARGET }, deployment: govC2, reads: liveReads, account: ACCOUNT })
  // 2. Same intent under the verified override -> a real plan (the mechanism is built).
  const validUnderOverride = planGovernance({ intent: { kind: 'delegate', to: PLAN_PROBE_TARGET }, deployment: verified, reads: liveReads, account: ACCOUNT })
  // 3. Self-delegation invariant (override so the gate is not what refuses).
  const selfDelegation = planGovernance({ intent: { kind: 'delegate', to: ACCOUNT }, deployment: verified, reads: liveReads, account: ACCOUNT })
  // 4. Invalid (zero) target invariant.
  const invalidTarget = planGovernance({ intent: { kind: 'delegate', to: zeroAddress }, deployment: verified, reads: liveReads, account: ACCOUNT })
  // 5. Undelegate with no current delegate (the live blank-slate delegate is the zero address).
  const noDelegate = planGovernance({ intent: { kind: 'undelegate' }, deployment: verified, reads: liveReads, account: ACCOUNT })

  const plan = {
    probeTarget: PLAN_PROBE_TARGET,
    verifiedGate: { governanceVerified: govC2.governanceVerified, ok: gate.ok, error: gate.ok ? null : gate.error.code },
    validUnderOverride: { ok: validUnderOverride.ok, calls: validUnderOverride.ok ? validUnderOverride.plan.calls.map((c) => c.functionName) : null },
    selfDelegation: { ok: selfDelegation.ok, error: selfDelegation.ok ? null : selfDelegation.error.code },
    invalidTarget: { ok: invalidTarget.ok, error: invalidTarget.ok ? null : invalidTarget.error.code },
    noDelegate: { ok: noDelegate.ok, error: noDelegate.ok ? null : noDelegate.error.code },
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
    ['plan gate refuses (unverified)', gate.ok === false && gate.error.code === 'unverified'],
    ['plan valid under verified override', validUnderOverride.ok === true],
    ['self-delegation refused', selfDelegation.ok === false && selfDelegation.error.code === 'self_delegation'],
    ['invalid target refused', invalidTarget.ok === false && invalidTarget.error.code === 'invalid_target'],
    ['undelegate no-delegate refused', noDelegate.ok === false && noDelegate.error.code === 'no_delegate'],
    ['governanceVerified still false (coston2 source)', govC2.governanceVerified === false],
    ['governanceVerified still false (flare source)', govFlare.governanceVerified === false],
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
      'The delegate/undelegate round trip is HELD on Abu\'s explicit go. It is cheap and reversible (no funding floor) but moves real governance vote power, so it runs only on the double guard. governanceVerified stays FALSE on both networks; the governance-delegation write is declared-unbuilt, nothing faked. It flips (Coston2 only) exclusively after a live delegate lands and getDelegateOfAtNow reads back the target, then undelegate restores the zero address.',
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

// ======================= BROADCAST PASS (GATED — HELD today) =======================
// A minimal OperationRecord carrying the plan's real spine, so reconcileGovernance walks the
// actual wallet+flare steps (not a synthetic empty spine). Mirrors live-delegation's recordFor.
const recordFor = (plan, intent, id) => ({
  state: 'submitted', steps: plan.plan.steps, evidence: [], attempts: [], quoteHistory: [],
  updatedAt: 0, createdAt: 0, id, capability: 'governance', network: 114, intent, schemaVersion: 1,
})

async function broadcast() {
  const flagOk = process.argv.includes('--broadcast')
  const envOk = process.env.LIVE_GOV_BROADCAST === BROADCAST_TOKEN
  // DOUBLE GUARD: refuse unless BOTH the flag AND the env token are present. When either is
  // missing (the default, and this run), record the refusal and STOP — before reading the
  // secrets file, constructing a signer, or touching the private key.
  if (!flagOk || !envOk) {
    log('broadcast:REFUSED-held', {
      flagPresent: flagOk,
      envPresent: envOk,
      note: 'HELD: the governance delegate/undelegate broadcast needs the --broadcast flag AND LIVE_GOV_BROADCAST set to the token. No key read, nothing signed, governanceVerified untouched.',
    })
    return
  }

  // ---- Everything below runs ONLY on Abu's explicit go (never in this task). ----
  const targetRaw = process.env.GOV_DELEGATE_TARGET
  if (!targetRaw || !isAddress(targetRaw, { strict: false }) || targetRaw.toLowerCase() === zeroAddress || targetRaw.toLowerCase() === ACCOUNT.toLowerCase()) {
    throw new Error('set GOV_DELEGATE_TARGET to a well-formed, non-zero, non-self delegate address (recorded in evidence)')
  }
  const target = getAddress(targetRaw)

  // The private key is read ONLY here, inside the guarded branch, to build the local signer.
  // It is never logged, printed, put in --json output, or written to any evidence file.
  const account = privateKeyToAccount(JSON.parse(readFileSync(SECRETS_PATH, 'utf8')).evm.privateKey)
  if (getAddress(account.address) !== ACCOUNT) throw new Error('secrets signer address does not match the expected account')

  const c2 = chainFor(114)
  const chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
  const publicClient = createPublicClient({ chain, transport: http(c2.rpcUrl) })
  const walletClient = createWalletClient({ account, chain, transport: http(c2.rpcUrl) })
  const govC2 = governanceFor('coston2')
  // OVERRIDE lets the builder emit a signable plan for the round trip about to be driven live;
  // the SOURCE flag stays false and flips only after the confirming read-back (flip()).
  const verified = { ...govC2, governanceVerified: true }
  const evidence = existsSync(JSON_PATH) ? JSON.parse(readFileSync(JSON_PATH, 'utf8')) : {}
  evidence.broadcastRun = { ranAt: new Date().toISOString(), account: ACCOUNT, target, delegate: {}, undelegate: {} }

  // --- delegate(target): sign, then reach succeeded ONLY from the getDelegateOfAtNow read-back. ---
  const preDelegate = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
  const delegateIntent = { kind: 'delegate', to: target }
  const delegatePlan = planGovernance({ intent: delegateIntent, deployment: verified, reads: { delegate: preDelegate.delegate }, account: ACCOUNT })
  if (!delegatePlan.ok) throw new Error(`delegate plan refused: ${delegatePlan.error.code}`)
  const delegateHash = await signCall(publicClient, walletClient, account, delegatePlan.plan.calls[0], 'delegate')
  let delegateConfirmed = false
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
    const op = reconcileGovernance(recordFor(delegatePlan, delegateIntent, 'gov-delegate'), { delegate: now.delegate }, nowSec())
    if (op.state === 'succeeded') {
      evidence.broadcastRun.delegate = { tx: delegateHash, explorer: `${c2.explorerUrl}/tx/${delegateHash}`, delegateReadBack: now.delegate, opState: op.state, confirmedAt: new Date().toISOString() }
      writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
      log('broadcast:delegate:CONFIRMED', evidence.broadcastRun.delegate)
      delegateConfirmed = true
      break
    }
    await sleep(POLL_MS)
  }
  if (!delegateConfirmed) {
    evidence.broadcastRun.delegate = { tx: delegateHash, staged: true, note: 're-run to observe getDelegateOfAtNow reflect the target' }
    writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
    log('broadcast:delegate:staged', evidence.broadcastRun.delegate)
    return
  }

  // Flip governanceVerified (Coston2 only) — ONLY after the confirmed delegate read-back.
  flip()

  // --- undelegate(): sign, then reach succeeded ONLY when getDelegateOfAtNow reads the zero address. ---
  const preUndelegate = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
  const undelegateIntent = { kind: 'undelegate' }
  const undelegatePlan = planGovernance({ intent: undelegateIntent, deployment: verified, reads: { delegate: preUndelegate.delegate }, account: ACCOUNT })
  if (!undelegatePlan.ok) throw new Error(`undelegate plan refused: ${undelegatePlan.error.code}`)
  const undelegateHash = await signCall(publicClient, walletClient, account, undelegatePlan.plan.calls[0], 'undelegate')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await readGovernanceVotes(publicClient, govC2, ACCOUNT)
    const op = reconcileGovernance(recordFor(undelegatePlan, undelegateIntent, 'gov-undelegate'), { delegate: now.delegate }, nowSec())
    if (op.state === 'succeeded') {
      evidence.broadcastRun.undelegate = { tx: undelegateHash, explorer: `${c2.explorerUrl}/tx/${undelegateHash}`, delegateReadBack: now.delegate, opState: op.state, confirmedAt: new Date().toISOString() }
      writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
      log('broadcast:undelegate:CONFIRMED', evidence.broadcastRun.undelegate)
      return
    }
    await sleep(POLL_MS)
  }
  evidence.broadcastRun.undelegate = { tx: undelegateHash, staged: true, note: 're-run to observe getDelegateOfAtNow reflect the zero address' }
  writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
  log('broadcast:undelegate:staged', evidence.broadcastRun.undelegate)
}

// Sign one built governance call: simulate (eth_call, pass the Account object) → writeContract →
// wait for the receipt. ONLY the broadcast pass calls this; the keyless read pass never does.
async function signCall(publicClient, walletClient, account, call, label) {
  const { request } = await publicClient.simulateContract({ account, address: call.address, abi: call.abi, functionName: call.functionName, args: call.args })
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log(label, { hash, block: receipt.blockNumber.toString(), status: receipt.status })
  return hash
}

// Source-flip governanceVerified false→true for COSTON2 ONLY (the write/verify net; mainnet is a
// read lens and never flips). governance.ts carries the flag on both networks, so this flips the
// FIRST occurrence — the coston2 block, which precedes `flare:` — after asserting that ordering.
// GUARDED: reached only after a confirmed delegate read-back in broadcast(). Never runs now.
function flip() {
  const src = readFileSync(GOVERNANCE_TS, 'utf8')
  const needle = 'governanceVerified: false'
  const idx = src.indexOf(needle)
  const flareIdx = src.indexOf('flare:')
  if (idx === -1) throw new Error(`no '${needle}' in governance.ts`)
  if (flareIdx !== -1 && idx > flareIdx) throw new Error('first governanceVerified:false is not the coston2 one — refusing to flip')
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
    '- `governanceVerified`: **false** on both networks (unchanged — no live round trip has confirmed it).',
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
    `- **verified gate**: governanceVerified=${p.verifiedGate.governanceVerified} → refused \`${p.verifiedGate.error}\` — no signable plan is emitted while unverified, proven against real reads`,
    `- **valid under a verified OVERRIDE** (not a source flip): plan OK, calls \`${JSON.stringify(p.validUnderOverride.calls)}\` — the mechanism is built and dormant`,
    `- **self-delegation** (to = account) → refused \`${p.selfDelegation.error}\``,
    `- **invalid (zero) target** → refused \`${p.invalidTarget.error}\``,
    `- **undelegate with no current delegate** (live zero delegate) → refused \`${p.noDelegate.error}\``,
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
  else if (MODE === 'broadcast') await broadcast()
  else throw new Error(`unknown mode ${MODE} (use: read | broadcast)`)
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
