// packages/core/scripts/probe-delegation.mjs
// M10 Task 1 — read-only probe (no product code, no signing, no chain writes).
// Confirms the substrate for the M10 delegation + claims milestone BEFORE any
// @flare-kit/contracts registry entry exists. M10 uses the EXISTING Coston2 Flare
// contracts (no deploy), so this run:
//   1) resolves the live addresses from FlareContractRegistry.getAllContracts()
//      and ASSERTS the core ones (WNat / RewardManager / RNat /
//      DistributionToDelegators) still resolve — a missing core contract is a
//      blocker, a differing address is recorded as the real one (Task 2 pins it);
//   2) reads the blank-slate account state (WNat vote power + delegation, reward
//      manager epoch/claim state, RNat balances, FlareDrop distribution) so Task 2
//      can encode the confirmed ABI shapes and the mocks copy honest zeros;
//   3) the ONE hard gate — native C2FLR must cover the Task 5 round trip
//      (wrap → delegate → undelegate → unwrap, a few cheap Coston2 txs). Short →
//      blocker with the exact faucet trip;
//   4) records the UNOFFICIAL FTSO reward proof-mirror reachability + whether the
//      current claimable epoch has tuples — this justifies proofSource.official:false
//      and the "declared unavailable when absent" branch (mirror down is NOT a
//      blocker; the FTSO claim is carried regardless).
// Anything short lands in blockers[] for Abu to action.
//
//   node packages/core/scripts/probe-delegation.mjs
//
// Addresses inlined on purpose: this is the run that verifies them before Task 2
// makes them the @flare-kit/contracts registry's source of truth.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, getAddress } from 'viem'
import { chainFor } from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m10-probe.json`
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`

// FlareContractRegistry — the fixed genesis address on every Flare network.
const REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'

// Expected from grounding. ASSERTED (not assumed): the probe records the ACTUAL
// resolved address and flags any drift; a differing address is fine (it's real),
// a MISSING core contract (WNat/RewardManager/RNat/DistributionToDelegators) blocks.
const EXPECTED = {
  WNat: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273',
  RewardManager: '0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454',
  RNat: '0x221D27529e7788B929E13533edc3b00ec1ac5e8A',
  DistributionToDelegators: '0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010',
}
// The names we extract from the registry (superset of the four core ones above).
const WANTED = [
  'WNat',
  'RewardManager',
  'FtsoRewardManager',
  'RNat',
  'DistributionToDelegators',
  'FlareSystemsManager',
  'ClaimSetupManager',
]
// A missing entry here is a hard blocker — the round trip cannot run without it.
const CORE = ['WNat', 'RewardManager', 'RNat', 'DistributionToDelegators']

// Native C2FLR floor: Task 5 runs wrap + delegate + undelegate + unwrap (4 cheap
// Coston2 txs). ~47 C2FLR was present at grounding; 2 C2FLR is a generous floor.
const C2FLR_FLOOR = 2n * 10n ** 18n
const FAUCET = 'https://faucet.flare.network/coston2'

// Unofficial community mirror for the Coston2 FTSO delegation-reward tuples.
// There is NO official Coston2 reward API — this justifies proofSource.official:false.
const MIRROR_BASE = 'https://gitlab.com/timivesel/ftsov2-testnet-rewards'
const MIRROR_PROJECT = 'timivesel%2Fftsov2-testnet-rewards'
const MIRROR_BRANCH = 'main'
const MIRROR_NETWORK = 'coston2'

// --- ABIs: the exact getter shapes, lifted from the vendored Flare periphery
// artifacts (sources/flare-foundation/flare-npm-periphery-package/coston2). Getting
// these right IS the probe; Task 2 pins whatever the chain confirms here. ---
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

// WNat's delegation/vote-power getters are inherited from IVPToken.
const wnatAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'delegationModeOf', stateMutability: 'view', inputs: [{ name: '_who', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'delegatesOf',
    stateMutability: 'view',
    inputs: [{ name: '_who', type: 'address' }],
    outputs: [
      { name: '_delegateAddresses', type: 'address[]' },
      { name: '_bips', type: 'uint256[]' },
      { name: '_count', type: 'uint256' },
      { name: '_delegationMode', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'votePowerOf', stateMutability: 'view', inputs: [{ name: '_owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'undelegatedVotePowerOf', stateMutability: 'view', inputs: [{ name: '_owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
]

const rewardManagerAbi = [
  { type: 'function', name: 'getCurrentRewardEpochId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
  {
    type: 'function',
    name: 'getRewardEpochIdsWithClaimableRewards',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_startEpochId', type: 'uint24' },
      { name: '_endEpochId', type: 'uint24' },
    ],
  },
  {
    type: 'function',
    name: 'getStateOfRewards',
    stateMutability: 'view',
    inputs: [{ name: '_rewardOwner', type: 'address' }],
    outputs: [
      {
        name: '_rewardStates',
        type: 'tuple[][]',
        components: [
          { name: 'rewardEpochId', type: 'uint24' },
          { name: 'beneficiary', type: 'bytes20' },
          { name: 'amount', type: 'uint120' },
          { name: 'claimType', type: 'uint8' },
          { name: 'initialised', type: 'bool' },
        ],
      },
    ],
  },
  { type: 'function', name: 'getNextClaimableRewardEpochId', stateMutability: 'view', inputs: [{ name: '_rewardOwner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getRewardEpochIdToExpireNext', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

const rnatAbi = [
  { type: 'function', name: 'getCurrentMonth', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getBalancesOf',
    stateMutability: 'view',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [
      { name: '_wNatBalance', type: 'uint256' },
      { name: '_rNatBalance', type: 'uint256' },
      { name: '_lockedBalance', type: 'uint256' },
    ],
  },
]

const distributionAbi = [
  {
    type: 'function',
    name: 'getClaimableMonths',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_startMonth', type: 'uint256' },
      { name: '_endMonth', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'getClaimableAmountOf', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }, { name: '_month', type: 'uint256' }], outputs: [{ name: '_amountWei', type: 'uint256' }] },
  { type: 'function', name: 'getCurrentMonth', stateMutability: 'view', inputs: [], outputs: [{ name: '_currentMonth', type: 'uint256' }] },
]

// --- account: ADDRESS ONLY. The private key in .secrets/live-run.json is never
// read, printed or written. No signer is constructed — this run cannot sign. ---
const secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf8'))
const ACCOUNT = getAddress(secrets.evm.address)

const c2 = chainFor(114)
const c2Chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
const coston2 = createPublicClient({ chain: c2Chain, transport: http(c2.rpcUrl) })

const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const tryRead = async (label, fn) => {
  try {
    return await fn()
  } catch (e) {
    const m = `ERR:${(e.shortMessage || e.message || '').slice(0, 140)}`
    console.log(` ! ${label}: ${m}`)
    return m
  }
}
/* global AbortController */
const timeout = (ms) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

const blockers = []
const out = {
  probe: 'M10 delegation + claims substrate + funding (Coston2)',
  ranAt: new Date().toISOString(),
  account: ACCOUNT,
  coston2: { chainId: 114, rpcUrl: c2.rpcUrl },
  registry: { address: REGISTRY, resolved: {}, drift: [], missing: [] },
  wnat: {},
  rewardManager: {},
  rnat: {},
  distribution: {},
  funding: {},
  proofSource: {},
  abiSignaturesConfirmed: {},
  blockers,
}

async function checkMirror(targetEpoch) {
  const info = {
    base: MIRROR_BASE,
    official: false,
    network: MIRROR_NETWORK,
    branch: MIRROR_BRANCH,
    layout: `rewards-data/${MIRROR_NETWORK}/<rewardEpochId>/reward-distribution-data.json`,
    note: 'Unofficial community mirror — no official Coston2 reward API exists. Absence of tuples is the honest "declared unavailable" state, NOT a blocker.',
    reachable: false,
    baseStatus: null,
    targetEpoch: targetEpoch ?? null,
    newestEpochWithData: null,
    newestEpochRewardClaims: null,
    targetEpochHasData: false,
  }
  // 1) base repo reachability
  try {
    const r = await fetch(MIRROR_BASE, { signal: timeout(12000) })
    info.reachable = r.ok
    info.baseStatus = r.status
  } catch (e) {
    info.reachable = false
    info.baseStatus = `ERR:${String(e.name || e.message)}`
  }
  if (targetEpoch == null) return info
  // 2) does the current claimable epoch (or one of the few just below it — the
  //    mirror lags finality) have reward tuples? Fetch the raw distribution file.
  const rawUrl = (epoch) =>
    `https://gitlab.com/api/v4/projects/${MIRROR_PROJECT}/repository/files/${encodeURIComponent(
      `rewards-data/${MIRROR_NETWORK}/${epoch}/reward-distribution-data.json`,
    )}/raw?ref=${MIRROR_BRANCH}`
  for (let i = 0; i < 4; i++) {
    const epoch = targetEpoch - i
    if (epoch < 0) break
    try {
      const r = await fetch(rawUrl(epoch), { signal: timeout(15000) })
      if (!r.ok) continue
      const j = JSON.parse(await r.text())
      const claims = Array.isArray(j.rewardClaims) ? j.rewardClaims.length : null
      info.newestEpochWithData = epoch
      info.newestEpochRewardClaims = claims
      if (epoch === targetEpoch) info.targetEpochHasData = true
      break
    } catch {
      /* try the next-older epoch */
    }
  }
  return info
}

async function main() {
  console.log('M10 delegation probe — read-only, address only:', ACCOUNT)
  out.coston2.block = bn(await tryRead('coston2 block', () => coston2.getBlockNumber()))

  // === Step 1: resolve addresses from FlareContractRegistry ===
  console.log('\n=== registry.getAllContracts() ===')
  const all = await tryRead('getAllContracts', () =>
    coston2.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'getAllContracts' }),
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
          console.log(` ${name.padEnd(26)} ${resolved[name]}`)
        }
      } else {
        out.registry.missing.push(name)
        console.log(` ! ${name.padEnd(26)} MISSING from registry`)
      }
    }
  } else {
    blockers.push(`FlareContractRegistry.getAllContracts() did not return (string[],address[]) — got ${JSON.stringify(all).slice(0, 120)}`)
  }
  out.registry.resolved = resolved
  // a MISSING core contract is a hard blocker
  for (const name of CORE) {
    if (!resolved[name]) blockers.push(`CORE contract ${name} missing from FlareContractRegistry — the delegation round trip cannot run`)
  }

  const WNAT = resolved.WNat
  const REWARD_MANAGER = resolved.RewardManager
  const RNAT = resolved.RNat
  const DISTRIBUTION = resolved.DistributionToDelegators

  // === Step 2: account blank-slate reads ===
  const confirm = (contract, sig) => (out.abiSignaturesConfirmed[contract] ??= []).push(sig)

  if (WNAT) {
    console.log('\n=== WNat (IVPToken getters) ===')
    const balance = await tryRead('WNat.balanceOf', () => coston2.readContract({ address: WNAT, abi: wnatAbi, functionName: 'balanceOf', args: [ACCOUNT] }))
    const mode = await tryRead('WNat.delegationModeOf', () => coston2.readContract({ address: WNAT, abi: wnatAbi, functionName: 'delegationModeOf', args: [ACCOUNT] }))
    const delegates = await tryRead('WNat.delegatesOf', () => coston2.readContract({ address: WNAT, abi: wnatAbi, functionName: 'delegatesOf', args: [ACCOUNT] }))
    const votePower = await tryRead('WNat.votePowerOf', () => coston2.readContract({ address: WNAT, abi: wnatAbi, functionName: 'votePowerOf', args: [ACCOUNT] }))
    const undelegated = await tryRead('WNat.undelegatedVotePowerOf', () => coston2.readContract({ address: WNAT, abi: wnatAbi, functionName: 'undelegatedVotePowerOf', args: [ACCOUNT] }))
    out.wnat = {
      address: WNAT,
      balanceOf: bn(balance),
      balanceHuman: typeof balance === 'bigint' ? (Number(balance) / 1e18).toString() : null,
      delegationModeOf: bn(mode),
      delegationModeMeaning: mode === 0n ? 'NOTSET (0)' : mode === 1n ? 'PERCENTAGE (1)' : mode === 2n ? 'AMOUNT (2)' : bn(mode),
      delegatesOf: Array.isArray(delegates)
        ? { delegateAddresses: delegates[0], bips: delegates[1].map(bn), count: bn(delegates[2]), delegationMode: bn(delegates[3]) }
        : delegates,
      votePowerOf: bn(votePower),
      undelegatedVotePowerOf: bn(undelegated),
    }
    console.log(' balance', out.wnat.balanceHuman, 'WNAT | mode', out.wnat.delegationModeMeaning, '| delegateCount', out.wnat.delegatesOf?.count, '| votePower', bn(votePower))
    if (typeof balance !== 'string') confirm('WNat', 'balanceOf(address)->uint256')
    if (typeof mode !== 'string') confirm('WNat', 'delegationModeOf(address)->uint256')
    if (Array.isArray(delegates)) confirm('WNat', 'delegatesOf(address)->(address[],uint256[],uint256,uint256)')
    if (typeof votePower !== 'string') confirm('WNat', 'votePowerOf(address)->uint256')
    if (typeof undelegated !== 'string') confirm('WNat', 'undelegatedVotePowerOf(address)->uint256')
  }

  if (REWARD_MANAGER) {
    console.log('\n=== RewardManager ===')
    const currentEpoch = await tryRead('RewardManager.getCurrentRewardEpochId', () => coston2.readContract({ address: REWARD_MANAGER, abi: rewardManagerAbi, functionName: 'getCurrentRewardEpochId' }))
    const claimable = await tryRead('RewardManager.getRewardEpochIdsWithClaimableRewards', () => coston2.readContract({ address: REWARD_MANAGER, abi: rewardManagerAbi, functionName: 'getRewardEpochIdsWithClaimableRewards' }))
    const state = await tryRead('RewardManager.getStateOfRewards', () => coston2.readContract({ address: REWARD_MANAGER, abi: rewardManagerAbi, functionName: 'getStateOfRewards', args: [ACCOUNT] }))
    const nextClaimable = await tryRead('RewardManager.getNextClaimableRewardEpochId', () => coston2.readContract({ address: REWARD_MANAGER, abi: rewardManagerAbi, functionName: 'getNextClaimableRewardEpochId', args: [ACCOUNT] }))
    const expireNext = await tryRead('RewardManager.getRewardEpochIdToExpireNext', () => coston2.readContract({ address: REWARD_MANAGER, abi: rewardManagerAbi, functionName: 'getRewardEpochIdToExpireNext' }))
    out.rewardManager = {
      address: REWARD_MANAGER,
      getCurrentRewardEpochId: bn(currentEpoch),
      getRewardEpochIdsWithClaimableRewards: Array.isArray(claimable) ? { startEpochId: bn(claimable[0]), endEpochId: bn(claimable[1]) } : claimable,
      getStateOfRewards: JSON.parse(JSON.stringify(state, jsonify)),
      getStateOfRewardsIsEmpty: Array.isArray(state) ? state.every((row) => Array.isArray(row) && row.length === 0) : null,
      getNextClaimableRewardEpochId: bn(nextClaimable),
      getRewardEpochIdToExpireNext: bn(expireNext),
    }
    console.log(' currentEpoch', bn(currentEpoch), '| claimableRange', JSON.stringify(out.rewardManager.getRewardEpochIdsWithClaimableRewards), '| stateEmpty', out.rewardManager.getStateOfRewardsIsEmpty, '| nextClaimable', bn(nextClaimable))
    if (typeof currentEpoch !== 'string') confirm('RewardManager', 'getCurrentRewardEpochId()->uint24')
    if (Array.isArray(claimable)) confirm('RewardManager', 'getRewardEpochIdsWithClaimableRewards()->(uint24,uint24)')
    if (Array.isArray(state)) confirm('RewardManager', 'getStateOfRewards(address)->tuple[][](uint24,bytes20,uint120,uint8,bool)')
    if (typeof nextClaimable !== 'string') confirm('RewardManager', 'getNextClaimableRewardEpochId(address)->uint256')
    if (typeof expireNext !== 'string') confirm('RewardManager', 'getRewardEpochIdToExpireNext()->uint256')
  }

  if (RNAT) {
    console.log('\n=== RNat ===')
    const month = await tryRead('RNat.getCurrentMonth', () => coston2.readContract({ address: RNAT, abi: rnatAbi, functionName: 'getCurrentMonth' }))
    const balances = await tryRead('RNat.getBalancesOf', () => coston2.readContract({ address: RNAT, abi: rnatAbi, functionName: 'getBalancesOf', args: [ACCOUNT] }))
    out.rnat = {
      address: RNAT,
      getCurrentMonth: bn(month),
      getBalancesOf: Array.isArray(balances) ? { wNatBalance: bn(balances[0]), rNatBalance: bn(balances[1]), lockedBalance: bn(balances[2]) } : balances,
    }
    console.log(' currentMonth', bn(month), '| balances', JSON.stringify(out.rnat.getBalancesOf))
    if (typeof month !== 'string') confirm('RNat', 'getCurrentMonth()->uint256')
    if (Array.isArray(balances)) confirm('RNat', 'getBalancesOf(address)->(uint256,uint256,uint256)')
  }

  if (DISTRIBUTION) {
    console.log('\n=== DistributionToDelegators (FlareDrop — legacy, concluded 2026-01-30) ===')
    const months = await tryRead('Distribution.getClaimableMonths', () => coston2.readContract({ address: DISTRIBUTION, abi: distributionAbi, functionName: 'getClaimableMonths' }))
    const currentMonth = await tryRead('Distribution.getCurrentMonth', () => coston2.readContract({ address: DISTRIBUTION, abi: distributionAbi, functionName: 'getCurrentMonth' }))
    let claimableAmount = null
    // getClaimableAmountOf only makes sense inside the claimable range; probe the
    // range end if we got one. Legacy/empty/revert is the EXPECTED honest state.
    if (Array.isArray(months)) {
      const endMonth = months[1]
      claimableAmount = await tryRead('Distribution.getClaimableAmountOf(endMonth)', () => coston2.readContract({ address: DISTRIBUTION, abi: distributionAbi, functionName: 'getClaimableAmountOf', args: [ACCOUNT, endMonth] }))
    }
    out.distribution = {
      address: DISTRIBUTION,
      getClaimableMonths: Array.isArray(months) ? { startMonth: bn(months[0]), endMonth: bn(months[1]) } : months,
      getCurrentMonth: bn(currentMonth),
      getClaimableAmountOfEndMonth: bn(claimableAmount),
      note: 'FlareDrop concluded 2026-01-30 — empty/legacy/revert here is the expected honest state, NOT a blocker.',
    }
    console.log(' claimableMonths', JSON.stringify(out.distribution.getClaimableMonths), '| currentMonth', bn(currentMonth), '| claimableAmount(endMonth)', bn(claimableAmount))
    if (Array.isArray(months)) confirm('DistributionToDelegators', 'getClaimableMonths()->(uint256,uint256)')
    if (typeof currentMonth !== 'string') confirm('DistributionToDelegators', 'getCurrentMonth()->uint256')
    if (typeof claimableAmount === 'bigint') confirm('DistributionToDelegators', 'getClaimableAmountOf(address,uint256)->uint256')
  }

  // === Step 3: funding — the one hard gate ===
  console.log('\n=== funding (native C2FLR — the hard gate) ===')
  const native = await tryRead('native C2FLR', () => coston2.getBalance({ address: ACCOUNT }))
  out.funding = {
    account: ACCOUNT,
    nativeC2flr: bn(native),
    nativeC2flrHuman: typeof native === 'bigint' ? (Number(native) / 1e18).toString() : null,
    floorC2flr: C2FLR_FLOOR.toString(),
    floorHuman: (Number(C2FLR_FLOOR) / 1e18).toString(),
    covers: 'wrap + delegate + undelegate + unwrap (4 cheap Coston2 txs)',
  }
  console.log(' native C2FLR', out.funding.nativeC2flrHuman, '(floor', out.funding.floorHuman + ')')
  if (typeof native !== 'bigint') {
    blockers.push(`native C2FLR read failed (${native}) — cannot confirm the account can afford the round trip; retry the probe`)
  } else if (native < C2FLR_FLOOR) {
    blockers.push(`native C2FLR ${out.funding.nativeC2flrHuman} < floor ${out.funding.floorHuman} for the wrap→delegate→undelegate→unwrap round trip — FAUCET ${ACCOUNT} at ${FAUCET}`)
  }

  // === Step 4: FTSO proof-mirror reachability ===
  console.log('\n=== FTSO reward proof-mirror (unofficial; official:false) ===')
  // The claimable-range end is the freshest epoch worth checking; fall back to
  // current-1 if the range getter reverted.
  let targetEpoch = null
  const cr = out.rewardManager?.getRewardEpochIdsWithClaimableRewards
  if (cr && typeof cr === 'object' && cr.endEpochId != null) targetEpoch = Number(cr.endEpochId)
  else if (out.rewardManager?.getCurrentRewardEpochId && !String(out.rewardManager.getCurrentRewardEpochId).startsWith('ERR')) targetEpoch = Number(out.rewardManager.getCurrentRewardEpochId) - 1
  out.proofSource = await checkMirror(targetEpoch)
  console.log(' reachable', out.proofSource.reachable, '| targetEpoch', out.proofSource.targetEpoch, '| targetEpochHasData', out.proofSource.targetEpochHasData, '| newestEpochWithData', out.proofSource.newestEpochWithData, `(${out.proofSource.newestEpochRewardClaims} claims)`)
  console.log(' NOTE: mirror unreachable / no tuples is a recorded fact, NOT a blocker.')

  // === Step 5: write evidence + gate ===
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))
  console.log('\n=== blockers ===')
  if (blockers.length === 0) console.log(' none — addresses resolve, account blank-slate confirmed, funding sufficient for the round trip')
  else blockers.forEach((b) => console.log(' -', b))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
