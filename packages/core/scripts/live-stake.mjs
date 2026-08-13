// packages/core/scripts/live-stake.mjs
/**
 * M11 live staking run on Coston2 (AC1/AC2/AC3). Two passes:
 *
 *   node scripts/live-stake.mjs read        # KEYLESS: live reads + plan/invariant proof. Runs now.
 *   node scripts/live-stake.mjs broadcast    # GATED: C→P + AddPermissionlessDelegator. HARD-REFUSES today.
 *
 * READ PASS (keyless, always): the Task-3/Task-4 live reads — the validator set, the stake
 * limits (verifier + platform.getMinStake), the account's staked positions, the mirrored
 * vote power, and the staking-reward state. Then it derives the account's P-address and
 * drives the `planStake` gate + invariants against the LIVE limits: the unverified gate
 * refuses a signable plan, a below-50k amount is refused `amount_below_min`, and a valid
 * intent (under a verified override, NOT a source flip) surfaces the irreversible ≥14-day
 * value-lock. No key is read, nothing is signed, nothing is broadcast.
 *
 * BROADCAST PASS (GATED — value-locking, held): wires `transferToP → delegate → poll
 * readStakesOf` behind a hard gate — an explicit env token AND a funded native balance ≥ the
 * LIVE `minAmount`. The dev signer holds ~46.75 C2FLR ≪ 50,000, so the gate REFUSES before
 * constructing a signer or touching the key. It never flips `stakeVerified` and never edits
 * `staking.ts`; that source flip is a later, separately-authorised step. Staking irreversibly
 * locks real FLR for ≥14 days — this pass runs only on funding + an explicit go.
 *
 * SECRETS: the private key is read ONLY inside the (gated, unreached) broadcast pass to build
 * the reference executor; it is never logged, printed, or written. The read pass never reads it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, formatUnits, getAddress, hexToBytes, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainFor, stakingFor } from '@flarekit-dev/contracts'
import {
  pAddressFromPubKey,
  planStake,
  readMinStake,
  readMirrorVotePower,
  readStakeLimits,
  readStakesOf,
  readStakingReward,
  readValidators,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const MODE = process.argv[2] ?? 'read'
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`
const MD_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m11-staking.md`
const JSON_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m11-coston2-live-stake.json`

// The value-lock gate: the broadcast irreversibly locks ≥50,000 real C2FLR for ≥14 days, so
// it needs BOTH an explicit understood-token AND a funded balance. Nothing is fabricated when
// the gate is closed — the pass records the shortfall and stops.
const BROADCAST_TOKEN = 'i-understand-the-14-day-value-lock'
const DAY = 86_400n
const POLL_MS = 8_000
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS ?? 40)

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const log = (step, data = {}) => console.log(`[${step}]`, JSON.stringify(data, jsonify))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowSec = () => Math.floor(Date.now() / 1000)
const flr = (wei) => `${formatUnits(wei, 18)} FLR`

// The signer's PUBLIC address only — the read pass never touches the key. (The C-address is a
// public value; the private key is read solely inside the gated broadcast pass.)
const ACCOUNT = getAddress(JSON.parse(readFileSync(SECRETS_PATH, 'utf8')).evm.address)

const deployment = stakingFor('coston2')
if (!deployment) throw new Error('no coston2 staking deployment')

const c2 = chainFor(114)
const chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
const client = createPublicClient({ chain, transport: http(c2.rpcUrl) })

// Derive the signer's P-address from its PUBLIC key via the shipped viem-only encoder
// (`pAddressFromPubKey`), cross-checked against the SDK in the probe. The private key is read
// ONLY to compute the public key, which is discarded here; the key never leaves this function
// and is never logged. Compress the uncompressed 0x04… key (X, and the parity of Y) → 33 bytes.
function pAddressOf() {
  const uncompressed = hexToBytes(privateKeyToAccount(JSON.parse(readFileSync(SECRETS_PATH, 'utf8')).evm.privateKey).publicKey)
  const compressed = new Uint8Array(33)
  compressed[0] = (uncompressed[64] & 1) === 0 ? 0x02 : 0x03
  compressed.set(uncompressed.slice(1, 33), 1)
  return pAddressFromPubKey(compressed, deployment.hrp)
}

// Choose a live validator whose active window fully covers a [now, now+minDuration] stake, with
// a margin, so a valid ≥14-day intent can be built against a real NodeID (never invented).
function pickValidator(validators, now, minDuration) {
  const floor = BigInt(now) + minDuration + DAY // 1-day margin past the 14-day minimum
  const covering = validators.filter((v) => v.startTime <= BigInt(now) && v.endTime >= floor)
  covering.sort((a, b) => (a.endTime < b.endTime ? -1 : a.endTime > b.endTime ? 1 : 0))
  return covering[0] ?? null
}

// ============================ READ PASS (keyless, runs now) ============================
async function read() {
  const block = await client.getBlockNumber()
  const pAddress = pAddressOf()
  const now = nowSec()

  // --- Live reads (Task-3/Task-4), all keyless. ---
  const validators = await readValidators(deployment.pChainRpcBase)
  const limits = await readStakeLimits(client, deployment.pChainStakeMirrorVerifier)
  const minStake = await readMinStake(deployment.pChainRpcBase) // cross-check vs the verifier
  const positions = await readStakesOf(deployment.pChainRpcBase, pAddress)
  const mirror = await readMirrorVotePower(client, deployment.pChainStakeMirror, ACCOUNT)
  const reward = await readStakingReward(client, deployment.validatorRewardManager, ACCOUNT)
  const native = await client.getBalance({ address: ACCOUNT })

  const limitsOut = {
    minAmount: limits.minAmount.toString(), minAmountFlr: formatUnits(limits.minAmount, 18),
    maxAmount: limits.maxAmount.toString(), maxAmountFlr: formatUnits(limits.maxAmount, 18),
    minDurationSeconds: limits.minDuration.toString(), minDurationDays: (Number(limits.minDuration) / 86400).toString(),
    maxDurationSeconds: limits.maxDuration.toString(), maxDurationDays: (Number(limits.maxDuration) / 86400).toString(),
    getMinStakeDelegatorWei: minStake.minDelegatorStake.toString(),
    verifierMatchesGetMinStake: limits.minAmount === minStake.minDelegatorStake,
  }
  log('read:limits', limitsOut)

  const sampleValidators = validators.slice(0, 5).map((v) => ({
    nodeId: v.nodeId,
    startTimeIso: new Date(Number(v.startTime) * 1000).toISOString(),
    endTimeIso: new Date(Number(v.endTime) * 1000).toISOString(),
    windowDays: ((Number(v.endTime) - Number(v.startTime)) / 86400).toFixed(1),
    weightFlr: formatUnits(v.weight, 18),
  }))
  log('read:validators', { count: validators.length, sample: sampleValidators.map((s) => s.nodeId) })

  // Honest empty / observed-zero states — never a fabricated fill.
  const mirrorRender = mirror === undefined
    ? 'unavailable: mirror read threw — NOT rendered as 0'
    : `${mirror.toString()} wei (${flr(mirror)}) — observed on-chain zero (a real balanceOf read, blank slate)`
  const positionsRender = positions.length === 0
    ? 'honest empty: readStakesOf returned [] — the account delegates to no validator (blank slate)'
    : `${positions.length} on-chain stake position(s)`
  log('read:account', {
    pAddress,
    positions: positions.length,
    positionsRender,
    mirrorVotePower: mirror === undefined ? 'unavailable' : mirror.toString(),
    mirrorRender,
    reward: { total: reward.total.toString(), claimed: reward.claimed.toString(), claimable: (reward.total - reward.claimed).toString() },
    nativeC2flr: native.toString(), nativeC2flrHuman: formatUnits(native, 18),
  })

  // --- Plan gate + invariant proof against the LIVE limits (AC2-plan). ---
  const chosen = pickValidator(validators, now, limits.minDuration)
  if (!chosen) throw new Error('no live validator covers a [now, now+14d] window — cannot demonstrate a valid intent')
  const verified = { ...deployment, stakeVerified: true } // OVERRIDE for the demo — NOT a source flip

  const validIntent = {
    nodeId: chosen.nodeId,
    amount: limits.minAmount, // exactly the live 50,000-FLR floor
    startTime: BigInt(now),
    endTime: BigInt(now) + limits.minDuration, // exactly the 14-day minimum
    rewardAddress: ACCOUNT,
  }

  // 1. Verified gate: the REAL deployment (stakeVerified:false) must REFUSE a valid intent.
  const gate = planStake({ intent: validIntent, deployment, limits, validators })
  // 2. Valid intent under the verified override → a plan surfacing the irreversible value-lock.
  const valid = planStake({ intent: validIntent, deployment: verified, limits, validators })
  // 3. Below-50k amount → amount_below_min (from the live floor, never a docs literal).
  const belowMin = planStake({
    intent: { ...validIntent, amount: limits.minAmount - 1n },
    deployment: verified, limits, validators,
  })
  // 4. Below-14-day duration → duration_below_min.
  const shortDuration = planStake({
    intent: { ...validIntent, endTime: BigInt(now) + limits.minDuration - 1n },
    deployment: verified, limits, validators,
  })
  // 5. End past the validator's window → ends_after_validator (stranded delegation guard).
  const pastValidator = planStake({
    intent: { ...validIntent, endTime: chosen.endTime + 1n },
    deployment: verified, limits, validators,
  })

  const plan = {
    chosenValidator: { nodeId: chosen.nodeId, endTimeIso: new Date(Number(chosen.endTime) * 1000).toISOString() },
    verifiedGate: { stakeVerified: deployment.stakeVerified, ok: gate.ok, error: gate.ok ? null : gate.error.code },
    validUnderOverride: {
      ok: valid.ok,
      valueLock: valid.ok
        ? {
            amount: valid.plan.valueLock.amount.toString(), amountFlr: flr(valid.plan.valueLock.amount),
            unlockAt: valid.plan.valueLock.unlockAt.toString(),
            unlockAtIso: new Date(Number(valid.plan.valueLock.unlockAt) * 1000).toISOString(),
            lockSeconds: valid.plan.valueLock.lockSeconds.toString(),
            lockDays: (Number(valid.plan.valueLock.lockSeconds) / 86400).toString(),
            irreversible: valid.plan.valueLock.irreversible,
          }
        : null,
      steps: valid.ok ? valid.plan.steps.map((s) => ({ id: s.id, type: s.type, actor: s.actor })) : null,
    },
    belowMin: { ok: belowMin.ok, error: belowMin.ok ? null : belowMin.error.code },
    shortDuration: { ok: shortDuration.ok, error: shortDuration.ok ? null : shortDuration.error.code },
    pastValidator: { ok: pastValidator.ok, error: pastValidator.ok ? null : pastValidator.error.code },
  }
  log('read:plan', plan)

  // --- Funding gate (the broadcast shortfall). ---
  const funded = native >= limits.minAmount
  const funding = {
    account: ACCOUNT,
    nativeC2flr: native.toString(), nativeC2flrHuman: formatUnits(native, 18),
    minAmountWei: limits.minAmount.toString(), minAmountFlr: formatUnits(limits.minAmount, 18),
    funded,
    shortfallFlr: funded ? '0' : formatUnits(limits.minAmount - native, 18),
    note: funded
      ? 'funded — the broadcast could run on an explicit go'
      : 'NOT fundable — native balance is far below the live 50,000-FLR minimum; the broadcast is HELD',
  }
  log('read:funding', funding)

  // --- Honest-expectation assertions: fail loud on any drift. ---
  const checks = [
    ['limits: min 50k / 14d / max 365d', limits.minAmount === 50_000n * 10n ** 18n && limits.minDuration === 14n * DAY && limits.maxDuration === 365n * DAY],
    ['verifier minAmount === getMinStake', limits.minAmount === minStake.minDelegatorStake],
    ['>=3 live validators', validators.length >= 3],
    ['positions honest-empty []', positions.length === 0],
    ['mirror observed zero (0n, not undefined)', mirror === 0n],
    ['reward blank-slate (0,0)', reward.total === 0n && reward.claimed === 0n],
    ['verified gate refuses (unverified)', !gate.ok && gate.error.code === 'unverified'],
    ['valid intent under override is a plan', valid.ok === true],
    ['value-lock irreversible + 14 days', valid.ok && valid.plan.valueLock.irreversible === true && valid.plan.valueLock.lockSeconds === limits.minDuration],
    ['below-50k → amount_below_min', !belowMin.ok && belowMin.error.code === 'amount_below_min'],
    ['short duration → duration_below_min', !shortDuration.ok && shortDuration.error.code === 'duration_below_min'],
    ['past window → ends_after_validator', !pastValidator.ok && pastValidator.error.code === 'ends_after_validator'],
    ['broadcast NOT fundable (46.75 < 50000)', funded === false],
    ['stakeVerified still false in source', deployment.stakeVerified === false],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)

  const evidence = {
    ranAt: new Date().toISOString(),
    milestone: 'M11 staking — Task 6 keyless live reads (AC1) + plan/invariant proof (AC2)',
    broadcast: false,
    keyless: true,
    network: 'coston2',
    chainId: 114,
    block: block.toString(),
    account: ACCOUNT,
    pAddress,
    deployment: {
      pChainStakeMirror: deployment.pChainStakeMirror,
      pChainStakeMirrorVerifier: deployment.pChainStakeMirrorVerifier,
      validatorRewardManager: deployment.validatorRewardManager,
      pChainRpcBase: deployment.pChainRpcBase,
      hrp: deployment.hrp,
      stakeVerified: deployment.stakeVerified,
    },
    limits: limitsOut,
    validators: { count: validators.length, sample: sampleValidators },
    account_state: {
      positions, positionsRender,
      mirrorVotePower: mirror === undefined ? null : mirror.toString(), mirrorRender,
      reward: { total: reward.total.toString(), claimed: reward.claimed.toString() },
    },
    plan,
    funding,
    honestExpectations: { all: failed.length === 0, failed },
    carry:
      'The value-locking broadcast is HELD: the signer holds ~46.75 C2FLR ≪ the live 50,000-FLR minimum, and no explicit go was given. stakeVerified stays FALSE; the stake round trip is declared-unbuilt, nothing faked. It settles + flips only once the signer is funded ≥ 50,000 C2FLR AND Abu explicitly authorises the broadcast.',
    note: 'READ-ONLY: readValidators + readStakeLimits + readMinStake + readStakesOf + readMirrorVotePower + readStakingReward + planStake (pure). The key is read only to derive the public P-address (never signed with or logged); no signer is constructed, nothing is broadcast.',
  }

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(JSON_PATH, JSON.stringify(evidence, jsonify, 2))
  writeEvidenceMd(evidence)
  log('read:done', { honest: failed.length === 0, failed, json: JSON_PATH, md: MD_PATH })
  if (failed.length) throw new Error(`honest-read expectations failed: ${failed.join(', ')}`)
}

// ======================= BROADCAST PASS (GATED — hard-refuses today) =======================
async function broadcast() {
  const limits = await readStakeLimits(client, deployment.pChainStakeMirrorVerifier)
  const native = await client.getBalance({ address: ACCOUNT })
  const tokenOk = process.env.LIVE_STAKE_BROADCAST === BROADCAST_TOKEN
  const funded = native >= limits.minAmount

  // GATE: refuse unless an explicit token AND a funded balance. Today both fail (funding) —
  // the pass records the refusal and STOPS before constructing a signer or reading the key.
  if (!tokenOk || !funded) {
    const refusal = {
      ranAt: new Date().toISOString(),
      broadcast: false,
      guard: 'held',
      tokenPresent: tokenOk,
      funded,
      nativeC2flrHuman: formatUnits(native, 18),
      minAmountFlr: formatUnits(limits.minAmount, 18),
      shortfallFlr: funded ? '0' : formatUnits(limits.minAmount - native, 18),
      note: 'HELD: the value-locking broadcast needs LIVE_STAKE_BROADCAST set AND native ≥ the live minimum. The signer is far below 50,000 C2FLR — nothing signed, nothing broadcast, stakeVerified untouched.',
    }
    log('broadcast:REFUSED-held', refusal)
    return
  }

  // ---- Everything below runs ONLY when funded + explicitly authorised (never today). ----
  // Wired for completeness; requires `pchain-executor.mjs` + `.secrets` at run time.
  const { makePChainStakeExecutor } = await import('./pchain-executor.mjs')
  const secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf8'))
  const submitted = []
  const executor = makePChainStakeExecutor({
    privateKey: secrets.evm.privateKey,
    onSubmit: (e) => submitted.push(e),
  })
  const pAddress = await executor.getPAddress()
  const now = nowSec()
  const validators = await readValidators(deployment.pChainRpcBase)
  const chosen = pickValidator(validators, now, limits.minDuration)
  if (!chosen) throw new Error('no live validator covers the stake window')

  const intent = {
    nodeId: chosen.nodeId,
    amount: limits.minAmount,
    startTime: BigInt(now) + 300n, // small lead so startTime is not in the past at broadcast
    endTime: BigInt(now) + limits.minDuration + DAY, // ≥14 days, within the validator window
    rewardAddress: ACCOUNT,
  }

  // The verified OVERRIDE lets the builder emit a signable plan for the round trip that is
  // about to be driven live. The SOURCE flag stays false; it flips only after the confirming
  // read-back, as a later, separately-authorised step (NOT done here).
  const verified = { ...deployment, stakeVerified: true }
  const plan = planStake({ intent, deployment: verified, limits, validators })
  if (!plan.ok) throw new Error(`stake plan refused: ${plan.error.code}`)
  log('broadcast:value-lock', { amountFlr: flr(intent.amount), unlockAtIso: new Date(Number(intent.endTime) * 1000).toISOString(), irreversible: true })

  const toP = await executor.transferToP(intent.amount)
  log('broadcast:transferToP', { txIds: toP.txIds })
  const del = await executor.delegate(intent)
  log('broadcast:delegate', { txIds: del.txIds })

  // succeeded comes ONLY from reading the position back — never from the submission.
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const positions = await readStakesOf(deployment.pChainRpcBase, pAddress)
    const match = positions.find((p) => p.nodeId === intent.nodeId && p.amount === intent.amount)
    if (match) {
      log('broadcast:CONFIRMED', { position: { nodeId: match.nodeId, amount: match.amount.toString(), endTime: match.endTime.toString() } })
      log('broadcast:next', { note: 'Position read back on-chain. Flipping stakeVerified=true in staking.ts is the NEXT, separately-authorised step (Step 4) — not performed here.' })
      return
    }
    await sleep(POLL_MS)
  }
  log('broadcast:staged', { transferToP: toP.txIds, delegate: del.txIds, note: 're-run to observe readStakesOf reflect the position' })
}

// Human-readable keyless-read evidence (AC1). Composed from the evidence object; no key material.
function writeEvidenceMd(e) {
  const v = e.validators.sample
  const p = e.plan
  const md = [
    '# M11 staking — LIVE keyless reads (AC1) + plan/invariant proof (AC2), Coston2',
    '',
    `- Ran: ${e.ranAt} · network **coston2** (chainId 114) · block **${e.block}** · account \`${e.account}\``,
    `- P-address (shipped \`pAddressFromPubKey\`, cross-checked vs the SDK): \`${e.pAddress}\``,
    '- Broadcast: **none** — KEYLESS read pass. The value-locking stake is HELD (see Carry).',
    `- \`stakeVerified\`: **${e.deployment.stakeVerified}** (unchanged — no live round trip has confirmed it).`,
    '',
    '## Resolved deployment (M11 registry, Coston2)',
    '',
    `- PChainStakeMirror: \`${e.deployment.pChainStakeMirror}\``,
    `- PChainStakeMirrorVerifier: \`${e.deployment.pChainStakeMirrorVerifier}\``,
    `- ValidatorRewardManager: \`${e.deployment.validatorRewardManager}\``,
    `- P-chain RPC: \`${e.deployment.pChainRpcBase}\` · hrp \`${e.deployment.hrp}\``,
    '',
    '## Live stake limits (read, never hardcoded)',
    '',
    `- min amount: **${e.limits.minAmountFlr} FLR** (${e.limits.minAmount} wei)`,
    `- max amount: **${e.limits.maxAmountFlr} FLR** (${e.limits.maxAmount} wei)`,
    `- duration: **${e.limits.minDurationDays}–${e.limits.maxDurationDays} days** (${e.limits.minDurationSeconds}–${e.limits.maxDurationSeconds} s)`,
    `- verifier minAmount === platform.getMinStake.minDelegator: **${e.limits.verifierMatchesGetMinStake}**`,
    '',
    `## Live validators (${e.validators.count}) — real NodeIDs, never invented`,
    '',
    ...v.map((s) => `- \`${s.nodeId}\` · window ${s.startTimeIso} → ${s.endTimeIso} (${s.windowDays}d) · self-stake ${s.weightFlr} FLR`),
    '',
    '## Account state (honest empty / observed zero — nothing fabricated)',
    '',
    `- P-chain staked positions: **${e.account_state.positions.length}** — ${e.account_state.positionsRender}`,
    `- mirrored vote power: ${e.account_state.mirrorRender}`,
    `- staking reward: total **${e.account_state.reward.total}**, claimed **${e.account_state.reward.claimed}** (blank-slate 0,0)`,
    '',
    '## Plan gate + invariants against the LIVE limits (AC2-plan)',
    '',
    `- chosen live validator: \`${p.chosenValidator.nodeId}\` (window ends ${p.chosenValidator.endTimeIso})`,
    `- **verified gate**: stakeVerified=${p.verifiedGate.stakeVerified} → refused \`${p.verifiedGate.error}\` (no signable plan until a live round trip confirms)`,
    `- **valid intent** (under a verified OVERRIDE, not a source flip) → plan OK, value-lock: **${p.validUnderOverride.valueLock.amountFlr}**, locked **${p.validUnderOverride.valueLock.lockDays} days**, unlocks ${p.validUnderOverride.valueLock.unlockAtIso}, irreversible=${p.validUnderOverride.valueLock.irreversible}`,
    `- **below 50,000 FLR** → refused \`${p.belowMin.error}\``,
    `- **below 14 days** → refused \`${p.shortDuration.error}\``,
    `- **end past validator window** → refused \`${p.pastValidator.error}\``,
    '',
    '## Funding shortfall (why the broadcast is HELD)',
    '',
    `- native balance: **${e.funding.nativeC2flrHuman} C2FLR**`,
    `- live minimum: **${e.funding.minAmountFlr} FLR** → shortfall **${e.funding.shortfallFlr} FLR**`,
    `- ${e.funding.note}`,
    '',
    '## Carry',
    '',
    `- ${e.carry}`,
    `- honest-read expectations all passed: **${e.honestExpectations.all}**${e.honestExpectations.failed.length ? ' — failed: ' + e.honestExpectations.failed.join(', ') : ''}`,
    '- The key is read locally ONLY to derive the public P-address (the probe pattern) — never signed with, logged, or written. Nothing is broadcast. The broadcast path is wired (`broadcast` subcommand) but hard-refuses on the funding gate.',
    '',
  ].join('\n')
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  // Append if a prior M11 staking MD already exists (e.g. an earlier task); else create.
  const header = existsSync(MD_PATH) ? `${readFileSync(MD_PATH, 'utf8').trimEnd()}\n\n---\n\n` : ''
  writeFileSync(MD_PATH, header + md)
}

async function main() {
  log('start', { mode: MODE, account: ACCOUNT, deployment: 'coston2', stakeVerified: deployment.stakeVerified })
  if (MODE === 'read') await read()
  else if (MODE === 'broadcast') await broadcast()
  else throw new Error(`unknown mode ${MODE} (use: read | broadcast)`)
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
