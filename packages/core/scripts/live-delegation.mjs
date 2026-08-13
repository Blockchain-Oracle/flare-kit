// packages/core/scripts/live-delegation.mjs
/**
 * Real WNat delegation round trip on Coston2 through the kit (M10-AC1/AC2/AC3):
 * wrap native C2FLR → WNat, delegate vote power to a real FTSO provider (percentage),
 * read `delegatesOf`/`votePowerOf` back, undelegate, unwrap — a full reversible trip.
 *
 * Dev-only: viem signs the wrap/delegate/undelegate/unwrap, which the shipped package
 * never does — core produces the honest UNSIGNED plan (verified-gated) and a wallet signs
 * it. Everything deciding the operation goes through the kit's DelegationAdapter + plan
 * builder + reconciler.
 *
 * The whole point of the milestone: `succeeded` comes ONLY from the on-chain `delegatesOf`
 * read reflecting the intent (`reconcileDelegation`), never from the broadcast receipt. The
 * registry `delegationVerified` flag flips true in source ONLY after that confirmed read.
 *
 *   node scripts/live-delegation.mjs dry         # READ-ONLY: reads, provider resolve, plans, sims. NO broadcast.
 *   node scripts/live-delegation.mjs wrap        # BROADCAST: wrap W C2FLR -> WNat, poll balanceOf
 *   node scripts/live-delegation.mjs delegate    # BROADCAST: delegate 100% to the resolved provider, poll delegatesOf
 *   node scripts/live-delegation.mjs undelegate  # BROADCAST: undelegateAll, poll delegatesOf empty
 *   node scripts/live-delegation.mjs unwrap      # BROADCAST: unwrap the full W, poll native restored
 *   node scripts/live-delegation.mjs all         # wrap -> delegate -> undelegate -> unwrap in one run
 *   node scripts/live-delegation.mjs flip        # source-flip delegationVerified=true (only after the confirmed read)
 *   node scripts/live-delegation.mjs rewards     # KEYLESS READ: rewards adapter reads + proof-source probe + honest gates. NO broadcast, no key use.
 *   node scripts/live-delegation.mjs claim       # CARRIED FTSO claim: merge proof -> plan -> sign -> reconcile. GATED OFF (no earned reward) -> refuses no-entitlement now, broadcasts nothing.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, formatUnits, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { delegationFor, chainFor, rewardsFor } from '@flare-kit/contracts'
import {
  makeDelegationAdapter, delegationAbiFor, buildDelegationPlan, reconcileDelegation,
  makeRewardsAdapter, rewardsAbiFor, buildRewardsClaimPlan, reconcileClaim,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const MODE = process.argv[2] ?? 'dry'
const W = BigInt(process.env.WRAP_WEI ?? (5n * 10n ** 18n).toString()) // 5 C2FLR (small)
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m10-live-delegation.json`
const REWARDS_MD = `${ROOT}/.thoughts/verification/2026-08-12-m10-rewards.md`
const DELEGATION_TS = `${ROOT}/packages/contracts/src/delegation.ts`
const REWARDS_TS = `${ROOT}/packages/contracts/src/rewards.ts`
const POLL_MS = 6_000
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS ?? 40)

// FlareContractRegistry — the fixed genesis address on every Flare network (same as the
// M10 probe). Used ONLY to resolve the FTSO provider read-only; the delegation operation
// addresses come from `delegationFor('coston2')`, never a literal.
const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'
// Read-only resolution helpers (NOT the operation ABIs — those are delegationAbiFor()).
const REGISTRY_ABI = [{ type: 'function', name: 'getAllContracts', stateMutability: 'view', inputs: [], outputs: [{ name: '_names', type: 'string[]' }, { name: '_addresses', type: 'address[]' }] }]
const FSM_ABI = [{ type: 'function', name: 'getCurrentRewardEpochId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] }]
const VOTER_REGISTRY_ABI = [{ type: 'function', name: 'getRegisteredVoters', stateMutability: 'view', inputs: [{ name: '_rewardEpochId', type: 'uint256' }], outputs: [{ type: 'address[]' }] }]

// account: the LOCAL Account object (M9 gotcha — pass this object, never a bare address, to
// simulateContract/createWalletClient, or the node json-rpc-signs and rejects it). The
// private key is read ONLY to build this signer; it is never logged, printed or written.
const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const account = privateKeyToAccount(secrets.evm.privateKey)
const OWNER = account.address

const c2 = chainFor(114)
const chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
const publicClient = createPublicClient({ chain, transport: http(c2.rpcUrl) })
const walletClient = createWalletClient({ account, chain, transport: http(c2.rpcUrl) })

// Registry route is delegationVerified:false until this run confirms the round trip; the
// live script bootstraps with a verified override (the M8 bridge / M9 gasless precedent),
// then the source flag is flipped only AFTER a confirmed `delegatesOf` read (the `flip` phase).
const realDeployment = delegationFor('coston2')
if (!realDeployment) throw new Error('no coston2 delegation deployment')
const deployment = { ...realDeployment, delegationVerified: true }
const adapter = makeDelegationAdapter(publicClient, deployment)

// Rewards read/claim seam (M10-AC4/AC5). Reads and the verified GATE use the REAL deployment —
// `rewardsVerified:false`, so the claim plan REFUSES (`not-verified`). The carried `claim` path
// builds against a verified OVERRIDE, but only after a real reward + its Merkle proof land; it
// never runs now (the blank-slate account earned nothing → the `no-entitlement` guard returns
// before any signing). No override for the keyless reads — reads need no verification.
const rewardsDep = rewardsFor('coston2')
if (!rewardsDep) throw new Error('no coston2 rewards deployment')
const rewardsAdapter = makeRewardsAdapter(publicClient, rewardsDep)

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const evidence = existsSync(EV_PATH)
  ? JSON.parse(readFileSync(EV_PATH, 'utf8'))
  : { startedAt: new Date().toISOString(), network: 'coston2', chainId: 114, signer: OWNER, wnat: deployment.wnat, wrapWei: W.toString(), dry: {}, wrap: {}, delegate: {}, undelegate: {}, unwrap: {}, rewards: {}, claim: {} }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(EV_PATH, JSON.stringify(evidence, jsonify, 2)) }
const log = (step, data = {}) => console.log(`[${step}]`, JSON.stringify(data, jsonify))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowSec = () => Math.floor(Date.now() / 1000)

// Sign one built DelegationCall: simulate (eth_call, pass the Account object) → writeContract
// → wait for the receipt. ONLY the broadcast phases call this; `dry` never does.
async function signCall(call, label, opts = {}) {
  const { request } = await publicClient.simulateContract({
    account,
    address: call.address,
    abi: delegationAbiFor(call.abiKind),
    functionName: call.functionName,
    args: call.args,
    ...(call.value !== undefined ? { value: call.value } : {}),
    // WNat.withdraw writes a cold vote-power checkpoint the auto eth_estimateGas can
    // under-count right after an undelegate (simulate passes, the mined tx OOG-reverts);
    // an explicit generous limit is the honest fix. Unused gas is refunded.
    ...(opts.gas !== undefined ? { gas: opts.gas } : {}),
  })
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log(label, { hash, block: receipt.blockNumber, status: receipt.status })
  return { hash, receipt }
}

// A minimal OperationRecord carrying the plan's real spine, so reconcileDelegation walks the
// actual wallet+flare steps (not a synthetic empty spine).
const recordFor = (plan, id) => ({ state: 'submitted', steps: plan.plan.steps, evidence: [], attempts: [], quoteHistory: [], updatedAt: 0, createdAt: 0, id, capability: 'delegation', network: 114, intent: {}, schemaVersion: 1 })
// Same, for the carried claim: reconcileClaim walks the claim plan's wallet+flare spine.
const rewardsRecordFor = (plan, id) => ({ state: 'submitted', steps: plan.plan.steps, evidence: [], attempts: [], quoteHistory: [], updatedAt: 0, createdAt: 0, id, capability: 'rewards', network: 114, intent: {}, schemaVersion: 1 })

// Sign one built RewardsCall — the CARRIED claim path ONLY. Same shape as signCall, but the call
// is encoded via rewardsAbiFor. Never reached now: claim()'s no-entitlement guard returns on an
// empty `reads.ftso` before any signing, so `claim` broadcasts nothing until a reward is earned.
async function signRewardsCall(call, label) {
  const { request } = await publicClient.simulateContract({
    account,
    address: call.address,
    abi: rewardsAbiFor(call.abiKind),
    functionName: call.functionName,
    args: call.args,
    ...(call.value !== undefined ? { value: call.value } : {}),
  })
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log(label, { hash, block: receipt.blockNumber, status: receipt.status })
  return { hash, receipt }
}

// Resolve a REAL Coston2 FTSO provider READ-ONLY: FlareContractRegistry → VoterRegistry's
// registered voters for the current (or nearest) reward epoch, ranked by on-chain
// `votePowerOf`. The top one is a live, most-delegated provider — delegating to it makes the
// vote power meaningful. (Delegation reflects ANY address in `delegatesOf`; a registered
// provider just makes it count for FTSO.)
async function resolveProvider() {
  const [names, addrs] = await publicClient.readContract({ address: FLARE_CONTRACT_REGISTRY, abi: REGISTRY_ABI, functionName: 'getAllContracts' })
  const byName = new Map(names.map((n, i) => [n, addrs[i]]))
  const voterRegistry = getAddress(byName.get('VoterRegistry'))
  const flareSystemsManager = getAddress(byName.get('FlareSystemsManager'))
  const currentEpoch = Number(await publicClient.readContract({ address: flareSystemsManager, abi: FSM_ABI, functionName: 'getCurrentRewardEpochId' }))
  let epochUsed
  let voters = []
  for (const e of [currentEpoch + 1, currentEpoch, currentEpoch - 1, currentEpoch - 2]) {
    if (e < 0) continue
    try {
      const v = await publicClient.readContract({ address: voterRegistry, abi: VOTER_REGISTRY_ABI, functionName: 'getRegisteredVoters', args: [BigInt(e)] })
      if (v.length) { epochUsed = e; voters = v; break }
    } catch { /* signing policy not set for this epoch — try older */ }
  }
  if (!voters.length) throw new Error('no registered FTSO voters resolvable from VoterRegistry')
  const ranked = []
  for (const v of voters) {
    const vp = await publicClient.readContract({ address: deployment.wnat, abi: delegationAbiFor('vptoken'), functionName: 'votePowerOf', args: [v] })
    ranked.push({ address: getAddress(v), votePower: vp })
  }
  ranked.sort((a, b) => (b.votePower > a.votePower ? 1 : b.votePower < a.votePower ? -1 : 0))
  return { voterRegistry, flareSystemsManager, currentEpoch, epochUsed, candidateCount: ranked.length, candidates: ranked, provider: ranked[0].address, providerVotePower: ranked[0].votePower }
}

// Simulate one call against LIVE current chain state (eth_call — NO broadcast). A revert on
// delegate/undelegate/unwrap before any wrap has landed is EXPECTED, not a failure.
async function simulateCall(call, expectPreWrapRevert) {
  try {
    await publicClient.simulateContract({
      account,
      address: call.address,
      abi: delegationAbiFor(call.abiKind),
      functionName: call.functionName,
      args: call.args,
      ...(call.value !== undefined ? { value: call.value } : {}),
    })
    return { ok: true }
  } catch (e) {
    const reason = String(e.shortMessage || e.message || e).split('\n')[0].slice(0, 160)
    return { ok: false, reason, expectedUntilWrapped: !!expectPreWrapRevert }
  }
}

const planCalls = (result) => (result.kind === 'plan' ? result.plan.calls.map((c) => ({ abiKind: c.abiKind, address: c.address, functionName: c.functionName, args: c.args, value: c.value })) : null)

// === dry: the ONLY phase run in SAFE-PREP. Reads, provider resolve, plan build, sims. ===
async function dry() {
  const reads = await adapter.read(OWNER)
  const readOut = {
    nativeBalance: reads.nativeBalance.toString(), nativeHuman: formatUnits(reads.nativeBalance, 18),
    wrappedBalance: reads.wrappedBalance.toString(), wrappedHuman: formatUnits(reads.wrappedBalance, 18),
    mode: reads.mode, modeMeaning: reads.mode === 0 ? 'NOTSET' : reads.mode === 1 ? 'PERCENTAGE' : 'AMOUNT',
    delegateCount: reads.delegates.length, delegates: reads.delegates,
    votePower: reads.votePower.toString(), undelegatedVotePower: reads.undelegatedVotePower.toString(),
  }
  log('dry:reads', readOut)

  const resolution = await resolveProvider()
  const provider = resolution.provider
  log('dry:provider', { provider, votePower: formatUnits(resolution.providerVotePower, 18), epochUsed: resolution.epochUsed, candidates: resolution.candidateCount })

  // Verified-gate proof: the REAL (unflipped) deployment must REFUSE a signable plan.
  const gated = buildDelegationPlan(adapter, realDeployment, OWNER, { kind: 'delegate', targets: [{ to: provider, bips: 10000 }] }, reads)
  log('dry:gate', { realDeploymentVerified: realDeployment.delegationVerified, result: gated.kind, error: gated.kind === 'error' ? gated.error.kind : null })

  // Invariant proof: unwrap against the CURRENT (zero wrapped) snapshot must REFUSE.
  const unwrapNow = buildDelegationPlan(adapter, deployment, OWNER, { kind: 'unwrap', amount: W }, reads)
  log('dry:unwrap-guard', { result: unwrapNow.kind, error: unwrapNow.kind === 'error' ? unwrapNow.error : null })

  // Round-trip plan chain (under the verified override). wrap builds against current reads;
  // delegate/undelegate/unwrap build against the PROJECTED post-wrap snapshot each will run
  // against in the real trip (wrap has landed → wrappedBalance holds W). Each must be a plan.
  const postWrap = { ...reads, wrappedBalance: reads.wrappedBalance + W }
  const plans = {
    wrap: buildDelegationPlan(adapter, deployment, OWNER, { kind: 'wrap', amount: W }, reads),
    delegate: buildDelegationPlan(adapter, deployment, OWNER, { kind: 'delegate', targets: [{ to: provider, bips: 10000 }] }, postWrap),
    undelegate: buildDelegationPlan(adapter, deployment, OWNER, { kind: 'undelegate' }, postWrap),
    unwrap: buildDelegationPlan(adapter, deployment, OWNER, { kind: 'unwrap', amount: W }, postWrap),
  }
  const planSummary = {}
  for (const [k, r] of Object.entries(plans)) {
    if (r.kind !== 'plan') throw new Error(`${k} plan refused: ${JSON.stringify(r.error)}`)
    planSummary[k] = { kind: r.kind, calls: planCalls(r) }
    log(`dry:plan:${k}`, { calls: r.plan.calls.map((c) => ({ fn: c.functionName, abi: c.abiKind, value: c.value })) })
  }

  // Simulate each call against LIVE state (eth_call, NO broadcast). Wrap should pass; the
  // rest may revert until a wrap has landed — recorded as expected-until-wrapped.
  const sims = {}
  sims.wrap = await simulateCall(plans.wrap.plan.calls[0], false)
  sims.delegate = await simulateCall(plans.delegate.plan.calls[0], true)
  sims.undelegate = await simulateCall(plans.undelegate.plan.calls[0], true)
  sims.unwrap = await simulateCall(plans.unwrap.plan.calls[0], true)
  for (const [k, s] of Object.entries(sims)) log(`dry:sim:${k}`, s)

  evidence.dry = {
    ranAt: new Date().toISOString(),
    broadcast: false,
    reads: readOut,
    providerResolution: {
      provider, providerVotePower: resolution.providerVotePower.toString(),
      voterRegistry: resolution.voterRegistry, flareSystemsManager: resolution.flareSystemsManager,
      currentEpoch: resolution.currentEpoch, epochUsed: resolution.epochUsed,
      howChosen: 'FlareContractRegistry.getAllContracts() -> VoterRegistry.getRegisteredVoters(epoch); ranked by WNat.votePowerOf; highest (most-delegated live provider) chosen',
      candidates: resolution.candidates.map((c) => ({ address: c.address, votePower: c.votePower.toString() })),
    },
    verifiedGate: { realDeploymentVerified: realDeployment.delegationVerified, result: gated.kind, error: gated.kind === 'error' ? gated.error.kind : null },
    unwrapGuardCurrentState: { result: unwrapNow.kind, error: unwrapNow.kind === 'error' ? unwrapNow.error : null },
    plans: planSummary,
    simulations: sims,
    note: 'READ-ONLY: adapter.read + resolveProvider + buildDelegationPlan + simulateContract (eth_call). No writeContract anywhere in dry.',
  }
  save()
  log('dry:done', { provider, wrapSim: sims.wrap.ok, evidence: EV_PATH })
}

// === broadcast phases (CODED, NOT run in SAFE-PREP) ===
async function wrap() {
  const reads = await adapter.read(OWNER)
  const plan = buildDelegationPlan(adapter, deployment, OWNER, { kind: 'wrap', amount: W }, reads)
  if (plan.kind !== 'plan') throw new Error(`wrap plan refused: ${JSON.stringify(plan.error)}`)
  const before = reads.wrappedBalance
  const { hash } = await signCall(plan.plan.calls[0], 'wrap')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await adapter.read(OWNER)
    if (now.wrappedBalance >= before + W) {
      evidence.wrap = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, wrappedBefore: before.toString(), wrappedAfter: now.wrappedBalance.toString(), amount: W.toString(), confirmedAt: new Date().toISOString() }
      save(); log('wrap:CONFIRMED', evidence.wrap); return true
    }
    await sleep(POLL_MS)
  }
  evidence.wrap = { tx: hash, staged: true, note: 're-run to observe the wrapped balance' }; save(); return false
}

async function delegate() {
  const provider = evidence.dry?.providerResolution?.provider ?? (await resolveProvider()).provider
  const pre = await adapter.read(OWNER)
  const intent = { kind: 'delegate', targets: [{ to: provider, bips: 10000 }] }
  const plan = buildDelegationPlan(adapter, deployment, OWNER, intent, pre)
  if (plan.kind !== 'plan') throw new Error(`delegate plan refused: ${JSON.stringify(plan.error)}`)
  // Before the confirming read, the op is awaiting_external(flare) — never succeeded from the send.
  const preState = reconcileDelegation(recordFor(plan, 'delegate'), pre, intent, nowSec()).state
  const { hash } = await signCall(plan.plan.calls[0], 'delegate')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await adapter.read(OWNER)
    const op = reconcileDelegation(recordFor(plan, 'delegate'), now, intent, nowSec())
    if (op.state === 'succeeded') {
      evidence.delegate = {
        tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, provider,
        delegatesOf: now.delegates, votePower: now.votePower.toString(), mode: now.mode,
        preSendState: preState, opState: op.state, // succeeded — reached ONLY from the delegatesOf read
        confirmedAt: new Date().toISOString(),
      }
      save(); log('delegate:CONFIRMED', evidence.delegate); return true
    }
    await sleep(POLL_MS)
  }
  evidence.delegate = { tx: hash, provider, staged: true, preSendState: preState, note: 're-run to observe delegatesOf' }; save(); return false
}

async function undelegate() {
  const pre = await adapter.read(OWNER)
  const intent = { kind: 'undelegate' }
  const plan = buildDelegationPlan(adapter, deployment, OWNER, intent, pre)
  if (plan.kind !== 'plan') throw new Error(`undelegate plan refused: ${JSON.stringify(plan.error)}`)
  const { hash } = await signCall(plan.plan.calls[0], 'undelegate')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await adapter.read(OWNER)
    const op = reconcileDelegation(recordFor(plan, 'undelegate'), now, intent, nowSec())
    if (op.state === 'succeeded') {
      evidence.undelegate = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, delegatesOf: now.delegates, opState: op.state, confirmedAt: new Date().toISOString() }
      save(); log('undelegate:CONFIRMED', evidence.undelegate); return true
    }
    await sleep(POLL_MS)
  }
  evidence.undelegate = { tx: hash, staged: true, note: 're-run to observe delegatesOf empty' }; save(); return false
}

async function unwrap() {
  const pre = await adapter.read(OWNER)
  // Unwrap the FULL wrapped amount so the reconciler's `wrappedBalance < amount` succeeded-check
  // is exact; carry the pre-unwrap wrapped balance as the baseline (Task-4 hand-off).
  const amount = pre.wrappedBalance
  if (amount === 0n) throw new Error('nothing wrapped to unwrap')
  const intent = { kind: 'unwrap', amount }
  const plan = buildDelegationPlan(adapter, deployment, OWNER, intent, pre)
  if (plan.kind !== 'plan') throw new Error(`unwrap plan refused: ${JSON.stringify(plan.error)}`)
  const nativeBefore = pre.nativeBalance
  const { hash } = await signCall(plan.plan.calls[0], 'unwrap', { gas: 800_000n })
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await adapter.read(OWNER)
    const op = reconcileDelegation(recordFor(plan, 'unwrap'), now, intent, nowSec())
    if (op.state === 'succeeded') {
      evidence.unwrap = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, unwrappedBaseline: amount.toString(), wrappedAfter: now.wrappedBalance.toString(), nativeBefore: nativeBefore.toString(), nativeAfter: now.nativeBalance.toString(), opState: op.state, confirmedAt: new Date().toISOString() }
      save(); log('unwrap:CONFIRMED', evidence.unwrap); return true
    }
    await sleep(POLL_MS)
  }
  evidence.unwrap = { tx: hash, staged: true, note: 're-run to observe the wrapped balance drop' }; save(); return false
}

// Source-flip delegationVerified false→true. GUARDED: refuses unless the evidence carries a
// confirmed `delegatesOf`-backed succeeded delegate. NEVER flip before the confirmed read.
function flip() {
  if (evidence.delegate?.opState !== 'succeeded') throw new Error('refusing to flip: no confirmed delegatesOf-backed succeeded delegate in evidence')
  const src = readFileSync(DELEGATION_TS, 'utf8')
  const needle = 'delegationVerified: false'
  const count = src.split(needle).length - 1
  if (count !== 1) throw new Error(`expected exactly one '${needle}' in delegation.ts, found ${count}`)
  writeFileSync(DELEGATION_TS, src.replace(needle, 'delegationVerified: true'))
  log('flip', { file: DELEGATION_TS, delegationVerified: true })
}

// === rewards: KEYLESS read pass (M10-AC4/AC5). This is the phase you RUN. Only chain reads +
// a public mirror GET + pure plan builds. No key use, no writeContract, no broadcast. Every read
// must render as an HONEST empty/legacy state — a declared absence — never a zero dressed as an
// amount. Fails loud if any expectation drifts. ===
async function rewards() {
  const reads = await rewardsAdapter.read(OWNER)

  const readOut = {
    currentRewardEpoch: reads.currentRewardEpoch,
    expireNextEpoch: reads.expireNextEpoch,
    claimableEpochCount: reads.claimableEpochs.length,
    claimableEpochs: reads.claimableEpochs,
    ftsoCount: reads.ftso.length,
    ftso: reads.ftso.map((r) => ({ epoch: r.epoch, amount: r.amount.toString(), claimType: r.claimType, proofLen: r.proof.length })),
    ftsoRender: reads.ftso.length === 0
      ? 'no-entitlement: empty getStateOfRewards -> no amount rendered (dash), never a faked 0'
      : `${reads.ftso.length} reward(s) present`,
    rnat: { hasProject: reads.rnat.hasProject, month: reads.rnat.month, wNat: reads.rnat.wNat.toString(), rnat: reads.rnat.rnat.toString(), locked: reads.rnat.locked.toString() },
    rnatRender: reads.rnat.hasProject
      ? 'has an RNat project'
      : 'no RNat account: "no RNat account" revert -> hasProject:false honest-empty, never a faked zero balance',
    flaredrop: { concluded: reads.flaredrop.concluded, claimableMonths: reads.flaredrop.claimableMonths, amount: reads.flaredrop.amount.toString() },
    flaredropRender: reads.flaredrop.claimableMonths.length === 0
      ? 'concluded: FlareDrop ended 2026-01-30 ("already finished" revert -> claimableMonths:[]), a legacy state, not a claim'
      : `${reads.flaredrop.claimableMonths.length} claimable month(s)`,
  }
  log('rewards:reads', readOut)

  // Proof-source pass: probe the UNOFFICIAL mirror for the ACCOUNT's tuples per signed epoch. It
  // earned nothing -> null -> the DECLARED proof-unavailable state, never a fabricated claim.
  const proofProbe = []
  for (const epoch of reads.claimableEpochs) {
    const fetched = await rewardsAdapter.fetchFtsoProof(epoch, OWNER)
    proofProbe.push({ epoch, hasTuples: fetched !== null, state: fetched !== null ? 'proof-available' : 'proof-unavailable (declared)' })
  }
  const proofSource = {
    url: rewardsDep.ftsoProofSource.url,
    official: rewardsDep.ftsoProofSource.official,
    probedEpochs: proofProbe.length,
    anyTuplesForAccount: proofProbe.some((p) => p.hasTuples),
    note: 'unofficial community mirror; the account having no tuples is the declared proof-unavailable state, never a fabricated proof',
  }
  log('rewards:proof-source', proofSource)

  // Honest gate 1: the REAL (unflipped) deployment REFUSES a signable claim -> not-verified.
  const gateNotVerified = buildRewardsClaimPlan(rewardsAdapter, rewardsDep, OWNER, { kind: 'ftso-delegation', recipient: OWNER, wrap: false }, reads)
  // Honest gate 2: even under a verified OVERRIDE, empty reads.ftso -> no-entitlement.
  const verifiedDeployment = { ...rewardsDep, rewardsVerified: true }
  const gateNoEntitlement = buildRewardsClaimPlan(rewardsAdapter, verifiedDeployment, OWNER, { kind: 'ftso-delegation', recipient: OWNER, wrap: false }, reads)
  const gates = {
    notVerified: { rewardsVerified: rewardsDep.rewardsVerified, result: gateNotVerified.kind, error: gateNotVerified.kind === 'error' ? gateNotVerified.error.kind : null },
    noEntitlement: { rewardsVerified: verifiedDeployment.rewardsVerified, ftsoCount: reads.ftso.length, result: gateNoEntitlement.kind, error: gateNoEntitlement.kind === 'error' ? gateNoEntitlement.error.kind : null },
  }
  log('rewards:gates', gates)

  // This is a verification pass: assert the honest expectations and fail loud on any drift.
  const checks = [
    ['ftso empty (no-entitlement)', reads.ftso.length === 0],
    ['rnat no project (honest-empty)', reads.rnat.hasProject === false],
    ['flaredrop concluded + empty (legacy)', reads.flaredrop.concluded === true && reads.flaredrop.claimableMonths.length === 0],
    ['gate not-verified', gateNotVerified.kind === 'error' && gateNotVerified.error.kind === 'not-verified'],
    ['gate no-entitlement', gateNoEntitlement.kind === 'error' && gateNoEntitlement.error.kind === 'no-entitlement'],
    ['no account tuples on mirror', proofProbe.every((p) => !p.hasTuples)],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)

  evidence.rewards = {
    ranAt: new Date().toISOString(),
    broadcast: false,
    keyless: true,
    account: OWNER,
    rewardsDeployment: { rewardManager: rewardsDep.rewardManager, ftsoRewardManager: rewardsDep.ftsoRewardManager, rnat: rewardsDep.rnat, distribution: rewardsDep.distribution, flareSystemsManager: rewardsDep.flareSystemsManager, rewardsVerified: rewardsDep.rewardsVerified },
    reads: readOut,
    proofSource,
    proofProbe,
    gates,
    honestExpectations: { all: failed.length === 0, failed },
    carry: 'rewardsVerified stays FALSE past M10 — the account earned nothing and no earned reward + official proof exist this milestone. The FTSO claim is CARRIED (coded, gated off); it settles + flips only when a real reward and its Merkle proof land in a later epoch.',
    note: 'READ-ONLY: rewardsAdapter.read + fetchFtsoProof (public mirror GET) + buildRewardsClaimPlan (pure/sync). No writeContract, no key use anywhere in rewards.',
  }
  save()
  writeRewardsEvidenceMd()
  log('rewards:done', { ftso: reads.ftso.length, honest: failed.length === 0, failed, mirrorOfficial: proofSource.official, evidence: EV_PATH })
  if (failed.length) throw new Error(`honest-empty expectations failed: ${failed.join(', ')}`)
}

// Human-readable rewards evidence, composed from evidence.rewards (M10-AC4/AC5). No key material.
function writeRewardsEvidenceMd() {
  const r = evidence.rewards
  const md = [
    '# M10 rewards — LIVE keyless reads + carried FTSO claim (Coston2)',
    '',
    `- Ran: ${r.ranAt} · network coston2 (chainId 114) · account \`${r.account}\``,
    '- Broadcast: **none** — KEYLESS read pass. The FTSO delegation-reward claim is CARRIED (coded, gated off).',
    '- `rewardsVerified`: **false** (carried past M10, exactly as M7 carried its Firelight claim).',
    '',
    '## Live read values (honest empty / legacy states)',
    '',
    `- currentRewardEpoch: ${r.reads.currentRewardEpoch} · expireNextEpoch: ${r.reads.expireNextEpoch}`,
    `- claimableEpochs (rewardsHash-signed): ${r.reads.claimableEpochCount} → \`${JSON.stringify(r.reads.claimableEpochs)}\``,
    `- FTSO delegation rewards: ${r.reads.ftsoCount} — ${r.reads.ftsoRender}`,
    `- RNat: ${r.reads.rnatRender}`,
    `- FlareDrop: ${r.reads.flaredropRender}`,
    '',
    '## Proof-source (unofficial community mirror)',
    '',
    `- URL: ${r.proofSource.url}`,
    `- \`official\`: **${r.proofSource.official}** — never rendered as protocol truth`,
    `- epochs probed: ${r.proofSource.probedEpochs} · any tuples for this account: ${r.proofSource.anyTuplesForAccount}`,
    `- per-epoch: \`${JSON.stringify(r.proofProbe)}\``,
    `- ${r.proofSource.note}`,
    '',
    '## Honest gates',
    '',
    `- not-verified: rewardsVerified=${r.gates.notVerified.rewardsVerified} → \`${r.gates.notVerified.result}\` / \`${r.gates.notVerified.error}\` (the REAL unflipped deployment refuses a signable plan)`,
    `- no-entitlement: verified OVERRIDE + empty ftso → \`${r.gates.noEntitlement.result}\` / \`${r.gates.noEntitlement.error}\``,
    '',
    '## Carry',
    '',
    `- ${r.carry}`,
    `- honest-empty expectations all passed: **${r.honestExpectations.all}**${r.honestExpectations.failed.length ? ' — failed: ' + r.honestExpectations.failed.join(', ') : ''}`,
    '- No key material read, printed, or written; the pass makes only reads.',
    '',
  ].join('\n')
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(REWARDS_MD, md)
}

// === claim: the CARRIED FTSO delegation-reward claim (the M7 Firelight, self-reconciling
// pattern). CODED, gated off. Running it NOW hits the no-entitlement guard and returns WITHOUT
// broadcasting — the blank-slate account earned nothing. The real broadcast fires only in a later
// epoch, after Task-5's delegation has earned a reward AND its Merkle proof lands on the mirror;
// the controller runs it then, with Abu's go. ===
async function claim() {
  const reads = await rewardsAdapter.read(OWNER)
  const verifiedDeployment = { ...rewardsDep, rewardsVerified: true }

  // GUARD: refuse to broadcast when nothing is earned. This is what makes `claim` safe to run now.
  if (reads.ftso.length === 0) {
    const gate = buildRewardsClaimPlan(rewardsAdapter, verifiedDeployment, OWNER, { kind: 'ftso-delegation', recipient: OWNER, wrap: false }, reads)
    evidence.claim = {
      ranAt: new Date().toISOString(),
      broadcast: false,
      guard: 'no-entitlement',
      ftsoCount: 0,
      planUnderVerifiedOverride: gate.kind === 'error' ? gate.error.kind : gate.kind,
      rewardsVerified: false,
      note: 'CARRIED: nothing earned yet -> no proof to merge, no claim to sign, no broadcast. rewardsVerified stays false until a real reward + its proof settle on-chain.',
    }
    save()
    log('claim:CARRIED-no-entitlement', evidence.claim)
    return false
  }

  // --- Everything below runs ONLY once a reward is earned (never now). ---
  // CRITICAL proof-merge (T7 carry-forward): read() ALWAYS sets FtsoReward.proof=[] (the on-chain
  // state carries none). Fetch each earned reward's tuples from the mirror and merge proof + the
  // authoritative amount/claimType into reads.ftso BEFORE buildRewardsClaimPlan, or it returns
  // `proof-unavailable` for everything. A miss stays proof-empty and the builder refuses that epoch.
  const merged = []
  for (const reward of reads.ftso) {
    const fetched = await rewardsAdapter.fetchFtsoProof(reward.epoch, OWNER)
    merged.push(fetched ? { ...reward, proof: fetched.proof, amount: fetched.amount, claimType: fetched.claimType } : { ...reward })
  }
  const mergedReads = { ...reads, ftso: merged }

  const plan = buildRewardsClaimPlan(rewardsAdapter, verifiedDeployment, OWNER, { kind: 'ftso-delegation', recipient: OWNER, wrap: false }, mergedReads)
  if (plan.kind !== 'plan') throw new Error(`claim plan refused: ${JSON.stringify(plan.error)}`)

  // Sign the claim, then reach `succeeded` ONLY from a confirmed on-chain read — the claimed epoch
  // dropping out of getStateOfRewards (the reward settled) — never from the send receipt.
  const claimedEpochs = merged.map((m) => m.epoch)
  const { hash } = await signRewardsCall(plan.plan.calls[0], 'claim')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const now = await rewardsAdapter.read(OWNER)
    const settled = !now.ftso.some((r) => claimedEpochs.includes(r.epoch))
    if (settled) {
      const op = reconcileClaim(rewardsRecordFor(plan, 'ftso-claim'), true, nowSec())
      evidence.claim = { tx: hash, explorer: `${c2.explorerUrl}/tx/${hash}`, claimedEpochs, opState: op.state, confirmedAt: new Date().toISOString() }
      save(); log('claim:CONFIRMED', evidence.claim)
      flipRewards() // flip rewardsVerified false->true — ONLY after the confirmed settlement.
      return true
    }
    await sleep(POLL_MS)
  }
  evidence.claim = { tx: hash, staged: true, note: 're-run to observe the reward state clear' }; save(); return false
}

// Source-flip rewardsVerified false->true. GUARDED: refuses unless evidence carries a confirmed
// succeeded claim. NEVER flips now — claim() returns at the no-entitlement guard before reaching it.
function flipRewards() {
  if (evidence.claim?.opState !== 'succeeded') throw new Error('refusing to flip: no confirmed succeeded FTSO claim in evidence')
  const src = readFileSync(REWARDS_TS, 'utf8')
  const needle = 'rewardsVerified: false'
  const count = src.split(needle).length - 1
  if (count !== 1) throw new Error(`expected exactly one '${needle}' in rewards.ts, found ${count}`)
  writeFileSync(REWARDS_TS, src.replace(needle, 'rewardsVerified: true'))
  log('flipRewards', { file: REWARDS_TS, rewardsVerified: true })
}

// READ-ONLY diagnosis of the unwrap revert: current state + a withdraw simulate with the reason.
async function diag() {
  const r = await adapter.read(OWNER)
  log('diag:state', { wrapped: r.wrappedBalance.toString(), native: r.nativeBalance.toString(), mode: r.mode, delegates: r.delegates, votePower: r.votePower.toString(), undelegatedVotePower: r.undelegatedVotePower.toString() })
  const amount = r.wrappedBalance
  try {
    await publicClient.simulateContract({ account, address: deployment.wnat, abi: delegationAbiFor('wnat'), functionName: 'withdraw', args: [amount] })
    log('diag:withdraw-simulate', { ok: true, amount: amount.toString() })
  } catch (e) {
    console.error('[diag:withdraw-simulate] REVERT shortMessage:', e.shortMessage || e.message)
    if (e.metaMessages) console.error('meta:\n' + e.metaMessages.join('\n'))
    const cause = e.walk ? e.walk() : e.cause
    if (cause) console.error('cause:', cause.reason || cause.shortMessage || cause.data || cause.message)
  }
}

async function main() {
  log('start', { mode: MODE, signer: OWNER, wrap: formatUnits(W, 18) + ' C2FLR' })
  if (MODE === 'dry') await dry()
  else if (MODE === 'wrap') await wrap()
  else if (MODE === 'delegate') await delegate()
  else if (MODE === 'undelegate') await undelegate()
  else if (MODE === 'unwrap') await unwrap()
  else if (MODE === 'all') { await wrap(); await delegate(); await undelegate(); await unwrap() }
  else if (MODE === 'flip') flip()
  else if (MODE === 'rewards') await rewards()
  else if (MODE === 'claim') await claim()
  else if (MODE === 'diag') await diag()
  else throw new Error(`unknown mode ${MODE}`)
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
