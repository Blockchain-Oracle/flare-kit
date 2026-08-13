// packages/core/scripts/probe-stake.mjs
// M11 Task 1 — read-only staking probe (no product code, no signing, no writes).
// Confirms the substrate for the M11 staking milestone BEFORE any @flare-kit/contracts
// registry entry or adapter exists. M11 mirrors EXISTING Coston2 P-chain stake back
// onto the C-chain (no deploy), so this run:
//   1) resolves + ASSERTS the three EVM contracts from FlareContractRegistry
//      (PChainStakeMirror / PChainStakeMirrorVerifier / ValidatorRewardManager) —
//      a differing address is recorded as the real one (Task 2 pins it), a MISSING
//      one is a hard blocker;
//   2) reads the four verifier limits (min/max stake duration + min/max amount) and
//      the P-chain platform.getMinStake, and ASSERTS them against the milestone
//      grounding (14d / 365d / 50k / 200M / 1M) — these gate every write and must be
//      read live, never hardcoded from the docs;
//   3) captures the EXACT P-chain JSON-RPC request/response SHAPES via plain fetch
//      (getCurrentValidators / getMinStake / getStake) — Task 3's SDK-free
//      pchain-rpc.ts parses these raw shapes, so they are recorded precisely with
//      >=3 real Coston2 NodeIDs + their stake windows;
//   4) reads the blank-slate account state (mirrored balance, validator reward state,
//      P-chain stake) so the mocks copy honest zeros and never fabricate a 0n;
//   5) records WHICH PChainStakeMirror read selector actually works — the ABI is NOT
//      vendored, so this provenance decides what the adapter may call.
// Anything short lands in blockers[]; expected-but-notable findings land in concerns[].
//
//   node packages/core/scripts/probe-stake.mjs
//
// The signer key in .secrets/live-run.json is read ONLY to derive the public key for
// the P-chain bech32 address (a public value). The key is never printed, logged, put
// in `out`, or written. No signer is constructed — this run cannot sign.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Network } from '@flarenetwork/flare-tx-sdk'
import { chainFor } from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m11-probe.json`
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`

// FlareContractRegistry — the fixed genesis address on every Flare network.
const REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'

// Expected from grounding (Flare developer-hub solidity reference + earlier research).
// ASSERTED, not assumed: the probe records the ACTUAL resolved address and flags drift.
const EXPECTED = {
  PChainStakeMirror: '0xd2a1Bb23eB350814a30Dd6f9de78Bb2C8fdD9F1D',
  PChainStakeMirrorVerifier: '0xd61d6bEfB3B5C3e1D13b43C46CC1cebA3505a7aF',
  ValidatorRewardManager: '0x33913AcE907F682E305f36d7538D3cCd37E2cA5B',
}
const WANTED = Object.keys(EXPECTED)
// All three are core to M11: a missing one is a hard blocker.
const CORE = WANTED

// Milestone grounding — ASSERTED against the live reads (never the source of truth).
const GWEI = 1_000_000_000n // 1 Gwei = 1e9 wei; the mirror/verifier amounts are Gwei.
const NFLR = 1_000_000_000n // P-chain amounts are nFLR (1e-9 FLR).
const EXPECT = {
  minStakeDurationSeconds: 1_209_600n, // 14 days
  maxStakeDurationSeconds: 31_536_000n, // 365 days
  minStakeAmountFlr: 50_000n, // -> minStakeAmountGwei
  maxStakeAmountFlr: 200_000_000n, // -> maxStakeAmountGwei
  minDelegatorStakeFlr: 50_000n, // -> getMinStake.minDelegatorStake (nFLR)
  minValidatorStakeFlr: 1_000_000n, // -> getMinStake.minValidatorStake (nFLR)
}

// --- ABIs: minimal fragments. The Flare periphery ABIs are NOT vendored in this repo,
// so getting these right IS the probe; Task 2 pins whatever the chain confirms. ---
const registryAbi = [
  {
    type: 'function',
    name: 'getAllContracts',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_names', type: 'string[]' },
      { name: '_addresses', type: 'address[]' },
    ],
  },
]
// PChainStakeMirrorVerifier public immutables -> auto getters (uint256 decodes any width).
const uintGetter = (name) => ({
  type: 'function',
  name,
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'uint256' }],
})
const verifierAbi = [
  'minStakeDurationSeconds',
  'maxStakeDurationSeconds',
  'minStakeAmountGwei',
  'maxStakeAmountGwei',
].map(uintGetter)
// PChainStakeMirror candidate read selectors — try both, record which one works.
const addrUint = (name) => ({
  type: 'function',
  name,
  stateMutability: 'view',
  inputs: [{ name: '_owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
})
const mirrorAbi = [addrUint('balanceOf'), addrUint('votePowerOf')]
// ValidatorRewardManager.getStateOfRewards — docs confirm (totalReward, claimedReward);
// claimable = total - claimed.
const vrmAbi = [
  {
    type: 'function',
    name: 'getStateOfRewards',
    stateMutability: 'view',
    inputs: [{ name: '_beneficiary', type: 'address' }],
    outputs: [
      { name: '_totalReward', type: 'uint256' },
      { name: '_claimedReward', type: 'uint256' },
    ],
  },
]

// --- account: ADDRESS for reads; the private key is used ONLY to derive the public
// key for the P-chain bech32 address, then discarded. Never printed or stored. ---
const secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf8'))
const ACCOUNT = getAddress(secrets.evm.address)
let PCHAIN_ADDR
{
  const pub = privateKeyToAccount(secrets.evm.privateKey).publicKey // uncompressed 0x04..
  const bech = Network.COSTON2.getPAddress(pub) // costwo1...  (derives via SDK bech32)
  PCHAIN_ADDR = `P-${bech}` // chain-prefixed form the P-chain RPC expects
}
delete secrets.evm.privateKey // belt-and-braces: never let the key reach `out`/logs

const c2 = chainFor(114)
const c2Chain = {
  id: 114,
  name: c2.name,
  nativeCurrency: c2.nativeCurrency,
  rpcUrls: { default: { http: [c2.rpcUrl] } },
}
const coston2 = createPublicClient({ chain: c2Chain, transport: http(c2.rpcUrl) })
// Network is configuration: derive the P-chain endpoint from the C-chain RPC origin so
// switching testnet<->mainnet needs no source rewrite.
const P_RPC = `${new URL(c2.rpcUrl).origin}/ext/bc/P`

const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const flrFromGwei = (gwei) => (gwei / GWEI).toString()
const flrFromNflr = (nflr) => (BigInt(nflr) / NFLR).toString()
const tryRead = async (label, fn) => {
  try {
    return await fn()
  } catch (e) {
    const m = `ERR:${(e.shortMessage || e.message || '').slice(0, 140)}`
    console.log(` ! ${label}: ${m}`)
    return m
  }
}
/* global AbortController, URL */
const timeout = (ms) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}
const pchain = async (method, params = {}) => {
  const r = await fetch(P_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: timeout(60000),
  })
  const j = await r.json()
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 140)}`)
  return j.result
}

const blockers = []
const concerns = []
const assertions = []
const assert = (name, ok, detail) => {
  assertions.push({ name, ok, detail })
  console.log(`  ${ok ? 'OK ' : 'XX '} ${name} — ${detail}`)
  if (!ok) concerns.push(`ASSERTION FAILED: ${name} — ${detail}`)
}

const out = {
  probe:
    'M11 staking substrate — addresses, verifier limits, P-chain reality (Coston2)',
  ranAt: new Date().toISOString(),
  account: ACCOUNT,
  pChainAddress: PCHAIN_ADDR,
  coston2: { chainId: 114, cChainRpc: c2.rpcUrl, pChainRpc: P_RPC },
  registry: { address: REGISTRY, resolved: {}, drift: [], missing: [] },
  verifierLimits: {},
  minStake: {},
  mirror: {},
  validatorRewardManager: {},
  validators: {},
  accountStake: {},
  funding: {},
  rpcShapes: {},
  assertions,
  concerns,
  blockers,
}

async function main() {
  console.log('M11 staking probe — read-only, address only:', ACCOUNT)
  console.log('P-chain address:', PCHAIN_ADDR)
  out.coston2.block = bn(await tryRead('coston2 block', () => coston2.getBlockNumber()))

  // === Step 1: resolve addresses from FlareContractRegistry ===
  console.log('\n=== registry.getAllContracts() ===')
  const all = await tryRead('getAllContracts', () =>
    coston2.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: 'getAllContracts',
    }),
  )
  const resolved = {}
  if (Array.isArray(all) && Array.isArray(all[0]) && Array.isArray(all[1])) {
    const [names, addrs] = all
    const byName = new Map(names.map((n, i) => [n, addrs[i]]))
    for (const name of WANTED) {
      const addr = byName.get(name)
      if (addr) {
        resolved[name] = getAddress(addr)
        const exp = EXPECTED[name]
        if (exp && getAddress(exp) !== getAddress(addr)) {
          const drift = `${name}: registry ${getAddress(addr)} != expected ${getAddress(exp)} (registry is authoritative — Task 2 pins the actual)`
          out.registry.drift.push(drift)
          console.log(` ~ ${drift}`)
        } else {
          console.log(` ${name.padEnd(28)} ${resolved[name]}`)
        }
      } else {
        out.registry.missing.push(name)
        console.log(` ! ${name.padEnd(28)} MISSING from registry`)
      }
    }
  } else {
    blockers.push(
      `FlareContractRegistry.getAllContracts() did not return (string[],address[]) — got ${JSON.stringify(all).slice(0, 120)}`,
    )
  }
  out.registry.resolved = resolved
  for (const name of CORE)
    if (!resolved[name])
      blockers.push(
        `CORE contract ${name} missing from FlareContractRegistry — M11 cannot mirror stake without it`,
      )
  console.log('\n=== assertions: registry ===')
  for (const name of WANTED)
    assert(
      `registry.${name}`,
      resolved[name] === getAddress(EXPECTED[name]),
      `${resolved[name] ?? 'MISSING'} vs expected ${getAddress(EXPECTED[name])}`,
    )

  const VERIFIER = resolved.PChainStakeMirrorVerifier
  const MIRROR = resolved.PChainStakeMirror
  const VRM = resolved.ValidatorRewardManager

  // === Step 2a: PChainStakeMirrorVerifier limits ===
  if (VERIFIER) {
    console.log('\n=== PChainStakeMirrorVerifier limits ===')
    const read = async (fn) =>
      tryRead(`Verifier.${fn}`, () =>
        coston2.readContract({ address: VERIFIER, abi: verifierAbi, functionName: fn }),
      )
    const minDur = await read('minStakeDurationSeconds')
    const maxDur = await read('maxStakeDurationSeconds')
    const minAmt = await read('minStakeAmountGwei')
    const maxAmt = await read('maxStakeAmountGwei')
    out.verifierLimits = {
      address: VERIFIER,
      minStakeDurationSeconds: bn(minDur),
      maxStakeDurationSeconds: bn(maxDur),
      minStakeAmountGwei: bn(minAmt),
      maxStakeAmountGwei: bn(maxAmt),
      minStakeDurationDays:
        typeof minDur === 'bigint' ? (Number(minDur) / 86400).toString() : null,
      maxStakeDurationDays:
        typeof maxDur === 'bigint' ? (Number(maxDur) / 86400).toString() : null,
      minStakeAmountFlr: typeof minAmt === 'bigint' ? flrFromGwei(minAmt) : null,
      maxStakeAmountFlr: typeof maxAmt === 'bigint' ? flrFromGwei(maxAmt) : null,
      note: 'amounts are Gwei (1e9 wei); FLR = Gwei / 1e9. Getters are public immutables (uint256).',
    }
    console.log(
      ' limits',
      JSON.stringify({
        minDur: bn(minDur),
        maxDur: bn(maxDur),
        minFlr: out.verifierLimits.minStakeAmountFlr,
        maxFlr: out.verifierLimits.maxStakeAmountFlr,
      }),
    )
    console.log('\n=== assertions: verifier limits ===')
    assert(
      'minStakeDurationSeconds=14d',
      minDur === EXPECT.minStakeDurationSeconds,
      `${bn(minDur)} (expect 1209600)`,
    )
    assert(
      'maxStakeDurationSeconds=365d',
      maxDur === EXPECT.maxStakeDurationSeconds,
      `${bn(maxDur)} (expect 31536000)`,
    )
    assert(
      'minStakeAmount=50k FLR',
      typeof minAmt === 'bigint' && minAmt === EXPECT.minStakeAmountFlr * GWEI,
      `${bn(minAmt)} Gwei = ${out.verifierLimits.minStakeAmountFlr} FLR (expect 50000)`,
    )
    assert(
      'maxStakeAmount=200M FLR',
      typeof maxAmt === 'bigint' && maxAmt === EXPECT.maxStakeAmountFlr * GWEI,
      `${bn(maxAmt)} Gwei = ${out.verifierLimits.maxStakeAmountFlr} FLR (expect 200000000)`,
    )
  }

  // === Step 2b: PChainStakeMirror read selector (provenance — ABI not vendored) ===
  if (MIRROR) {
    console.log(
      '\n=== PChainStakeMirror (mirrored vote power) — probe both selectors ===',
    )
    const balanceOf = await tryRead('Mirror.balanceOf', () =>
      coston2.readContract({
        address: MIRROR,
        abi: mirrorAbi,
        functionName: 'balanceOf',
        args: [ACCOUNT],
      }),
    )
    const votePowerOf = await tryRead('Mirror.votePowerOf', () =>
      coston2.readContract({
        address: MIRROR,
        abi: mirrorAbi,
        functionName: 'votePowerOf',
        args: [ACCOUNT],
      }),
    )
    const balanceOk = typeof balanceOf === 'bigint'
    const votePowerOk = typeof votePowerOf === 'bigint'
    const working = balanceOk
      ? 'balanceOf(address)->uint256'
      : votePowerOk
        ? 'votePowerOf(address)->uint256'
        : null
    out.mirror = {
      address: MIRROR,
      workingSelector: working,
      balanceOf: bn(balanceOf),
      votePowerOf: bn(votePowerOf),
      provenance:
        'ABI NOT vendored; selectors probed live. balanceOf and votePowerOf both tried against the blank-slate signer. Record which decodes cleanly — the adapter/Task 3 must call the working one.',
    }
    console.log(
      ' balanceOf',
      bn(balanceOf),
      '| votePowerOf',
      bn(votePowerOf),
      '| working:',
      working,
    )
    console.log('\n=== assertions: mirror ===')
    assert(
      'mirror read works (>=1 selector)',
      !!working,
      `working=${working ?? 'NONE'} (balanceOf=${bn(balanceOf)}, votePowerOf=${bn(votePowerOf)})`,
    )
    assert(
      'mirror blank-slate (0 mirrored)',
      balanceOk && balanceOf === 0n,
      `balanceOf=${bn(balanceOf)}`,
    )
    if (!votePowerOk)
      concerns.push(
        `PChainStakeMirror.votePowerOf reverts (${bn(votePowerOf)}); the working mirror read is balanceOf(address) — the adapter/Task 3 MUST use balanceOf.`,
      )
  }

  // === Step 2c: ValidatorRewardManager reward state ===
  if (VRM) {
    console.log('\n=== ValidatorRewardManager.getStateOfRewards ===')
    const state = await tryRead('VRM.getStateOfRewards', () =>
      coston2.readContract({
        address: VRM,
        abi: vrmAbi,
        functionName: 'getStateOfRewards',
        args: [ACCOUNT],
      }),
    )
    const total = Array.isArray(state) ? state[0] : null
    const claimed = Array.isArray(state) ? state[1] : null
    out.validatorRewardManager = {
      address: VRM,
      getStateOfRewards: Array.isArray(state)
        ? {
            totalReward: bn(total),
            claimedReward: bn(claimed),
            claimable: bn(total - claimed),
          }
        : state,
      signature:
        'getStateOfRewards(address)->(uint256 _totalReward,uint256 _claimedReward); claimable = total - claimed (per developer-hub claiming-rewards guide).',
    }
    console.log(' totalReward', bn(total), '| claimedReward', bn(claimed))
    console.log('\n=== assertions: validator rewards ===')
    assert(
      'VRM reward state blank-slate',
      Array.isArray(state) && total === 0n && claimed === 0n,
      `total=${bn(total)}, claimed=${bn(claimed)}`,
    )
  }

  // === Step 3: P-chain JSON-RPC reads (raw shapes for Task 3's pchain-rpc.ts) ===
  console.log('\n=== P-chain JSON-RPC (plain fetch) ===')
  // 3a getMinStake
  const minStake = await tryRead('platform.getMinStake', () =>
    pchain('platform.getMinStake'),
  )
  if (minStake && typeof minStake === 'object') {
    out.minStake = {
      raw: minStake,
      minValidatorStakeNflr: minStake.minValidatorStake,
      minDelegatorStakeNflr: minStake.minDelegatorStake,
      minValidatorStakeFlr: flrFromNflr(minStake.minValidatorStake),
      minDelegatorStakeFlr: flrFromNflr(minStake.minDelegatorStake),
      note: 'P-chain amounts are nFLR (1e-9 FLR); FLR = value / 1e9.',
    }
    console.log(' getMinStake', JSON.stringify(minStake))
    console.log('\n=== assertions: getMinStake ===')
    assert(
      'getMinStake.minDelegatorStake=50k FLR',
      BigInt(minStake.minDelegatorStake) === EXPECT.minDelegatorStakeFlr * NFLR,
      `${minStake.minDelegatorStake} nFLR = ${out.minStake.minDelegatorStakeFlr} FLR (expect 50000)`,
    )
    assert(
      'getMinStake.minValidatorStake=1M FLR',
      BigInt(minStake.minValidatorStake) === EXPECT.minValidatorStakeFlr * NFLR,
      `${minStake.minValidatorStake} nFLR = ${out.minStake.minValidatorStakeFlr} FLR (expect 1000000)`,
    )
  }

  // 3b getCurrentValidators — capture >=3 real NodeIDs with their stake windows.
  const cv = await tryRead('platform.getCurrentValidators', () =>
    pchain('platform.getCurrentValidators'),
  )
  const validators = cv && Array.isArray(cv.validators) ? cv.validators : null
  if (validators) {
    const sample = validators.slice(0, 3).map((v) => ({
      nodeID: v.nodeID,
      txID: v.txID,
      startTime: v.startTime,
      endTime: v.endTime,
      startTimeIso: new Date(Number(v.startTime) * 1000).toISOString(),
      endTimeIso: new Date(Number(v.endTime) * 1000).toISOString(),
      stakeDurationDays: ((Number(v.endTime) - Number(v.startTime)) / 86400).toFixed(1),
      weightNflr: v.weight,
      weightFlr: flrFromNflr(v.weight),
      delegationFee: v.delegationFee,
      uptime: v.uptime,
      connected: v.connected,
      delegatorCount: v.delegatorCount,
      delegatorWeightNflr: v.delegatorWeight,
    }))
    out.validators = {
      count: validators.length,
      sample,
      validatorFields: Object.keys(validators[0]),
    }
    console.log(
      ' validators:',
      validators.length,
      '| sample NodeIDs:',
      sample.map((s) => s.nodeID).join(', '),
    )
    console.log('\n=== assertions: validators ===')
    assert('>=3 real validators', validators.length >= 3, `count=${validators.length}`)
    assert(
      'NodeIDs well-formed',
      sample.every(
        (s) => typeof s.nodeID === 'string' && s.nodeID.startsWith('NodeID-'),
      ),
      sample.map((s) => s.nodeID).join(', '),
    )
  } else {
    blockers.push(
      `platform.getCurrentValidators returned no validators array (${JSON.stringify(cv).slice(0, 120)})`,
    )
  }

  // 3c getStake for the signer's P-chain address — expect blank-slate.
  const stake = await tryRead('platform.getStake', () =>
    pchain('platform.getStake', { addresses: [PCHAIN_ADDR] }),
  )
  if (stake && typeof stake === 'object') {
    out.accountStake = {
      pChainAddress: PCHAIN_ADDR,
      raw: stake,
      staked: stake.staked,
      stakedFlr: flrFromNflr(stake.staked ?? '0'),
      stakedOutputCount: Array.isArray(stake.stakedOutputs)
        ? stake.stakedOutputs.length
        : null,
    }
    console.log(' getStake', JSON.stringify(stake))
    console.log('\n=== assertions: account P-chain stake ===')
    assert(
      'account P-chain stake blank-slate',
      stake.staked === '0' &&
        Array.isArray(stake.stakedOutputs) &&
        stake.stakedOutputs.length === 0,
      `staked=${stake.staked}, outputs=${Array.isArray(stake.stakedOutputs) ? stake.stakedOutputs.length : 'n/a'}`,
    )
  }

  // Record the exact RPC shapes so Task 3's SDK-free parser has ground truth.
  out.rpcShapes = {
    endpoint: P_RPC,
    envelope:
      'JSON-RPC 2.0: POST {jsonrpc:"2.0",id:1,method,params}; result under .result, errors under .error.',
    'platform.getMinStake': {
      params: {},
      resultKeys:
        minStake && typeof minStake === 'object' ? Object.keys(minStake) : null,
      units: 'nFLR (1e-9 FLR), string-encoded',
    },
    'platform.getCurrentValidators': {
      params: '{} (or {nodeIDs:[...]} to filter)',
      validatorFields: validators ? Object.keys(validators[0]) : null,
      units: 'weight/delegatorWeight in nFLR; startTime/endTime unix seconds (string)',
    },
    'platform.getStake': {
      params: { addresses: ['P-costwo1…'] },
      resultKeys: stake && typeof stake === 'object' ? Object.keys(stake) : null,
      units: 'staked in nFLR (string); stakedOutputs=[] when none',
    },
  }

  // === Step 4: funding note (not a Task-1 gate; a downstream live-run note) ===
  console.log('\n=== funding (native C2FLR) ===')
  const native = await tryRead('native C2FLR', () =>
    coston2.getBalance({ address: ACCOUNT }),
  )
  out.funding = {
    account: ACCOUNT,
    nativeC2flr: bn(native),
    nativeC2flrHuman:
      typeof native === 'bigint' ? (Number(native) / 1e18).toString() : null,
    minDelegatorStakeFlr: out.minStake.minDelegatorStakeFlr ?? '50000',
    note: 'Read-only probe: native balance is informational here. A REAL Coston2 stake needs >= minDelegatorStake (50,000 FLR); the dev signer is far below that — flag for the live-run task, not a Task-1 blocker.',
  }
  console.log(
    ' native C2FLR',
    out.funding.nativeC2flrHuman,
    '| min delegator stake',
    out.funding.minDelegatorStakeFlr,
    'FLR',
  )
  if (typeof native === 'bigint' && native < EXPECT.minDelegatorStakeFlr * 10n ** 18n) {
    concerns.push(
      `Native C2FLR ${out.funding.nativeC2flrHuman} < minDelegatorStake ${out.funding.minDelegatorStakeFlr} FLR. A live Coston2 stake round-trip is NOT fundable at the current balance — surface for the live-run task.`,
    )
  }

  // === Step 5: write evidence ===
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))
  const failed = assertions.filter((a) => !a.ok)
  console.log('\n=== summary ===')
  console.log(
    ` assertions: ${assertions.length - failed.length}/${assertions.length} passed`,
  )
  if (blockers.length === 0) console.log(' blockers: none')
  else blockers.forEach((b) => console.log(' BLOCKER -', b))
  if (concerns.length) concerns.forEach((c) => console.log(' concern -', c))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
