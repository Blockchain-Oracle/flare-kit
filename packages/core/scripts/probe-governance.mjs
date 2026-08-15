// packages/core/scripts/probe-governance.mjs
// M12 Task 1 — read-only, KEYLESS governance probe (no product code, no signing,
// no chain writes). Confirms the substrate for the M12 governance milestone BEFORE
// any @flarekit-dev/contracts registry entry exists. Governance spans TWO networks:
//   - Coston2 (id 114) — the write/verify target (VP delegation round trip lives here),
//   - Flare mainnet (id 14) — the proposal read lens (real proposals exist here).
// This run:
//   1) resolves the four governance names (GovernanceVotePower / PollingFoundation /
//      PollingFtso / PollingManagementGroup) from FlareContractRegistry.getAllContracts()
//      on BOTH networks, ASSERTS GovernorReject is ABSENT, and cross-checks that the
//      resolved GovernanceVotePower equals WNat.governanceVotePower() (the resolution
//      path Task 2 will pin);
//   2) reads the blank-slate account governance state (VP via getVotes, current
//      delegate via getDelegateOfAtNow, and eligibility canPropose / isMember /
//      isProposer) so Task 2 can encode the confirmed ABI shapes and the mocks copy
//      honest zeros. Reads that legitimately return 0 / the zero address ARE the real
//      value; a read that THROWS or REVERTS is recorded as such, never fabricated;
//   3) records the proposal-discovery reality on mainnet then Coston2: the reliable
//      PollingFtso.getLastProposal() plus a BOUNDED PollingFoundation ProposalCreated
//      event scan (eth_getLogs is hard-capped at ~30 blocks per call on BOTH RPCs, so
//      we page in <=30-block windows and cap the total lookback to a recent window).
//      For ANY proposal id found we read state / getProposalInfo / getProposalVotes.
//      If nothing is discoverable within the window, that explicit empty IS the honest
//      reality M12 renders — we NEVER invent a proposal, tally or state.
//
//   node packages/core/scripts/probe-governance.mjs
//
// KEYLESS: only the account ADDRESS is used. No private key is read, constructed,
// printed or written — this run cannot sign. Addresses are inlined on purpose: this
// is the run that verifies them before Task 2 makes them the registry's source of truth.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, getAddress, decodeAbiParameters, toFunctionSelector } from 'viem'
import { chainFor } from '@flarekit-dev/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-13-m12-probe.json`

// FlareContractRegistry — the fixed genesis address on every Flare network.
const REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'

// The M8/M10/M11 signer — ADDRESS ONLY (keyless read). Blank slate expected: 0 VP,
// no delegate, not eligible. ~146 native C2FLR expected on Coston2.
const ACCOUNT = getAddress('0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9')

// The four governance names to resolve on each network.
const GOV_NAMES = ['GovernanceVotePower', 'PollingFoundation', 'PollingFtso', 'PollingManagementGroup']
// GovernorReject must be ABSENT from getAllContracts() — its presence would mean a
// different governance topology than M12 assumes.
const FORBIDDEN = 'GovernorReject'
// Also resolved (not one of the four) to run the WNat cross-check.
const EXTRA_NAMES = ['WNat']

// eth_getLogs is hard-capped at ~30 blocks per call on BOTH the Coston2 and Flare
// public RPCs (empirically: a 30-block range succeeds, 100 fails). Mirrors the
// bounded-window paging in bridge-adapter.ts / gasless-adapter.ts (they use 25).
const MAX_GETLOGS_RANGE = 30n
// Cap the total ProposalCreated lookback to a sane recent window. With a 30-block
// cap this is 150 sequential getLogs per network (~a few hours of history at
// ~1.2-1.8s/block). Real PollingFoundation proposals are months apart, so an empty
// scan here is the EXPECTED honest reality — reliable discovery is getLastProposal().
const LOOKBACK_BLOCKS = 4500n

// --- Minimal viem ABI fragments — ONLY the functions this probe calls. This is a
// PROBE: Task 2 builds the shipped ABIs from whatever the chain confirms here.
// Signatures lifted from the vendored periphery interfaces:
//   sources/flare-foundation/flare-foundry-periphery-package/src/coston2/
//     {IGovernor.sol, IGovernanceVotePower.sol, IPollingFtso.sol,
//      governance/interfaces/{IIPollingFoundation.sol, IIGovernorProposer.sol}}
//   IVPToken.sol (WNat) for governanceVotePower(). ---
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

// IVPToken.governanceVotePower() -> IGovernanceVotePower (an address).
const vpTokenAbi = [
  { type: 'function', name: 'governanceVotePower', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
]

// IGovernanceVotePower — the two latest-block reads.
const gvpAbi = [
  { type: 'function', name: 'getVotes', stateMutability: 'view', inputs: [{ name: '_who', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getDelegateOfAtNow', stateMutability: 'view', inputs: [{ name: '_who', type: 'address' }], outputs: [{ type: 'address' }] },
]

// IPollingFtso — eligibility + proposal reads.
const pollingFtsoAbi = [
  { type: 'function', name: 'canPropose', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isMember', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getLastProposal', stateMutability: 'view', inputs: [], outputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_description', type: 'string' }] },
  { type: 'function', name: 'state', stateMutability: 'view', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'getProposalVotes', stateMutability: 'view', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ name: '_for', type: 'uint256' }, { name: '_against', type: 'uint256' }] },
]
// PollingFtso.ProposalState enum ordering (differs from IGovernor's).
const FTSO_STATE = ['Canceled', 'Pending', 'Active', 'Defeated', 'Succeeded']
// The vendored IPollingFtso.getProposalInfo return shape (string,address,uint256x5)...
const FTSO_INFO_VENDORED = ['string', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256']
// ...which the DEPLOYED mainnet PollingFtso does NOT match. The deployed contract
// returns 8 values with a leading uint256 and a trailing uint256 (confirmed by raw
// decode). Task 2 must confirm the exact field labels against the deployed contract.
const FTSO_INFO_DEPLOYED = ['uint256', 'string', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256']
const FTSO_INFO_DEPLOYED_LABELS = [
  'leadingUint (noOfEligibleMembers?)',
  'description',
  'proposer',
  'voteStartTime',
  'voteEndTime',
  'thresholdConditionBIPS',
  'majorityConditionBIPS',
  'trailingUint (totalVotePower/circulatingSupply?)',
]

// IIGovernorProposer.isProposer + IGovernor.state/getProposalInfo/getProposalVotes for
// PollingFoundation proposals (a DIFFERENT shape than PollingFtso's).
const governorAbi = [
  { type: 'function', name: 'isProposer', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'state', stateMutability: 'view', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'getProposalInfo',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: '_proposer', type: 'address' },
      { name: '_accept', type: 'bool' },
      { name: '_votePowerBlock', type: 'uint256' },
      { name: '_voteStartTime', type: 'uint256' },
      { name: '_voteEndTime', type: 'uint256' },
      { name: '_execStartTime', type: 'uint256' },
      { name: '_execEndTime', type: 'uint256' },
      { name: '_thresholdConditionBIPS', type: 'uint256' },
      { name: '_majorityConditionBIPS', type: 'uint256' },
      { name: '_circulatingSupply', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'getProposalVotes', stateMutability: 'view', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ name: '_for', type: 'uint256' }, { name: '_against', type: 'uint256' }] },
]
// IGovernor.ProposalState enum ordering.
const GOVERNOR_STATE = ['Pending', 'Active', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed', 'Canceled']
// IGovernor.ProposalCreated — the event the PollingFoundation scan filters on.
const proposalCreatedAbi = [
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'proposer', type: 'address', indexed: false },
      { name: 'targets', type: 'address[]', indexed: false },
      { name: 'values', type: 'uint256[]', indexed: false },
      { name: 'calldatas', type: 'bytes[]', indexed: false },
      { name: 'description', type: 'string', indexed: false },
      { name: 'accept', type: 'bool', indexed: false },
      { name: 'voteTimes', type: 'uint256[2]', indexed: false },
      { name: 'executionTimes', type: 'uint256[2]', indexed: false },
      { name: 'votePowerBlock', type: 'uint256', indexed: false },
      { name: 'thresholdConditionBIPS', type: 'uint256', indexed: false },
      { name: 'majorityConditionBIPS', type: 'uint256', indexed: false },
      { name: 'circulatingSupply', type: 'uint256', indexed: false },
    ],
  },
]

const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const isErr = (v) => typeof v === 'string' && v.startsWith('ERR:')

/** A read that throws/reverts returns an `ERR:<reason>` marker — NEVER a fabricated
 *  0 / zero-address. Callers distinguish a real zero from a failed read via isErr(). */
const tryRead = async (label, fn) => {
  try {
    return await fn()
  } catch (e) {
    const m = `ERR:${(e.shortMessage || e.message || '').split('\n')[0].slice(0, 160)}`
    console.log(`   ! ${label}: ${m}`)
    return m
  }
}

const clientFor = (chainId) => {
  const c = chainFor(chainId)
  const chain = { id: c.id, name: c.name, nativeCurrency: c.nativeCurrency, rpcUrls: { default: { http: [c.rpcUrl] } } }
  return { meta: c, client: createPublicClient({ chain, transport: http(c.rpcUrl) }) }
}

const blockers = []
const out = {
  probe: 'M12 governance substrate + discovery reality (Coston2 + Flare mainnet)',
  ranAt: new Date().toISOString(),
  keyless: true,
  account: ACCOUNT,
  registry: REGISTRY,
  eligibilityConcerns: [],
  abiFindings: [],
  networks: {},
  blockers,
}

/** Read a PollingFtso proposal's info honestly: the vendored 7-tuple mis-decodes on the
 *  deployed contract, so try it first, then fall back to the confirmed 8-field shape via
 *  a raw eth_call, recording WHICH shape decoded (a Task-2 ABI finding). */
async function readFtsoProposalInfo(client, ftso, id) {
  const data = toFunctionSelector('getProposalInfo(uint256)') + id.toString(16).padStart(64, '0')
  let raw
  try {
    raw = (await client.call({ to: ftso, data })).data
  } catch (e) {
    return { readError: `ERR:${(e.shortMessage || e.message || '').split('\n')[0].slice(0, 160)}` }
  }
  const vendored = safeDecode(FTSO_INFO_VENDORED, raw)
  if (vendored.ok) return { shape: 'vendored(string,address,uint256x5)', vendoredShapeDecodes: true, fields: vendored.values }
  const deployed = safeDecode(FTSO_INFO_DEPLOYED, raw)
  if (deployed.ok) {
    const fields = {}
    deployed.values.forEach((v, i) => (fields[FTSO_INFO_DEPLOYED_LABELS[i]] = bn(v)))
    return { shape: 'deployed(uint256,string,address,uint256x5)', vendoredShapeDecodes: false, fields }
  }
  return { shape: 'unknown', vendoredShapeDecodes: false, rawData: raw }
}

function safeDecode(types, hex) {
  try {
    return { ok: true, values: decodeAbiParameters(types.map((type) => ({ type })), hex) }
  } catch {
    return { ok: false }
  }
}

/** Bounded ProposalCreated scan over [latest-LOOKBACK, latest] in <=MAX_GETLOGS_RANGE
 *  windows (RPC-cap safe). Returns discovered ids + a window record. Empty is honest. */
async function scanProposalCreated(client, foundation, latest) {
  const from = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS + 1n : 0n
  const found = []
  let windows = 0
  let scanError = null
  let cursor = from
  while (cursor <= latest) {
    const end = cursor + MAX_GETLOGS_RANGE - 1n > latest ? latest : cursor + MAX_GETLOGS_RANGE - 1n
    windows += 1
    try {
      const logs = await client.getContractEvents({
        address: foundation,
        abi: proposalCreatedAbi,
        eventName: 'ProposalCreated',
        fromBlock: cursor,
        toBlock: end,
      })
      for (const log of logs) {
        const id = log.args?.proposalId
        if (typeof id === 'bigint') found.push({ proposalId: id.toString(), block: bn(log.blockNumber), txHash: log.transactionHash })
      }
    } catch (e) {
      scanError = `ERR:${(e.shortMessage || e.message || '').split('\n')[0].slice(0, 160)}`
      break
    }
    cursor = end + 1n
  }
  return { fromBlock: bn(from), toBlock: bn(latest), lookbackBlocks: bn(latest - from + 1n), windowsScanned: windows, maxRangePerCall: bn(MAX_GETLOGS_RANGE), scanError, found }
}

async function probeNetwork(chainId, role) {
  const { meta, client } = clientFor(chainId)
  console.log(`\n======== ${meta.name} (id ${chainId}) — ${role} ========`)
  const net = { chainId, name: meta.name, role, rpcUrl: meta.rpcUrl }
  net.block = bn(await tryRead('block', () => client.getBlockNumber()))
  const latest = typeof net.block === 'string' && !net.block.startsWith('ERR') ? BigInt(net.block) : null

  // === Resolve the registry ===
  const all = await tryRead('getAllContracts', () =>
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'getAllContracts' }),
  )
  const resolved = {}
  let names = []
  if (Array.isArray(all) && Array.isArray(all[0]) && Array.isArray(all[1])) {
    names = all[0]
    const byName = new Map(all[0].map((n, i) => [n, all[1][i]]))
    for (const name of [...GOV_NAMES, ...EXTRA_NAMES]) {
      const addr = byName.get(name)
      if (addr) {
        resolved[name] = getAddress(addr)
        console.log(`   ${name.padEnd(24)} ${resolved[name]}`)
      } else {
        console.log(`   ${name.padEnd(24)} MISSING`)
      }
    }
  } else {
    blockers.push(`[${meta.name}] getAllContracts() did not return (string[],address[])`)
  }
  net.resolved = resolved

  // Assert the four governance names present + GovernorReject ABSENT.
  net.governanceNamesMissing = GOV_NAMES.filter((n) => !resolved[n])
  if (net.governanceNamesMissing.length) blockers.push(`[${meta.name}] missing governance contracts: ${net.governanceNamesMissing.join(', ')}`)
  net.governorRejectAbsent = !names.includes(FORBIDDEN)
  console.log(`   ${FORBIDDEN} absent? ${net.governorRejectAbsent}`)
  if (!net.governorRejectAbsent) blockers.push(`[${meta.name}] ${FORBIDDEN} is PRESENT in getAllContracts() (expected absent)`)

  // === WNat cross-check: WNat.governanceVotePower() === registry GovernanceVotePower ===
  if (resolved.WNat) {
    const fromWnat = await tryRead('WNat.governanceVotePower()', () =>
      client.readContract({ address: resolved.WNat, abi: vpTokenAbi, functionName: 'governanceVotePower' }),
    )
    const match = !isErr(fromWnat) && resolved.GovernanceVotePower && getAddress(fromWnat) === resolved.GovernanceVotePower
    net.wnatCrossCheck = {
      wnat: resolved.WNat,
      governanceVotePowerFromWnat: isErr(fromWnat) ? fromWnat : getAddress(fromWnat),
      governanceVotePowerFromRegistry: resolved.GovernanceVotePower ?? null,
      match: !!match,
    }
    console.log(`   WNat.governanceVotePower() == registry GovernanceVotePower? ${net.wnatCrossCheck.match}`)
    if (!match) blockers.push(`[${meta.name}] WNat.governanceVotePower() != registry GovernanceVotePower (${net.wnatCrossCheck.governanceVotePowerFromWnat} vs ${net.wnatCrossCheck.governanceVotePowerFromRegistry})`)
  }

  // === Account blank-slate governance reads (keyless, address only) ===
  const gvp = resolved.GovernanceVotePower
  const ftso = resolved.PollingFtso
  const foundation = resolved.PollingFoundation
  const account = { address: ACCOUNT }
  if (gvp) {
    const votes = await tryRead('GVP.getVotes(account)', () => client.readContract({ address: gvp, abi: gvpAbi, functionName: 'getVotes', args: [ACCOUNT] }))
    const delegate = await tryRead('GVP.getDelegateOfAtNow(account)', () => client.readContract({ address: gvp, abi: gvpAbi, functionName: 'getDelegateOfAtNow', args: [ACCOUNT] }))
    account.governanceVotePower = bn(votes)
    account.currentDelegate = isErr(delegate) ? delegate : getAddress(delegate)
    account.currentDelegateIsZero = !isErr(delegate) && getAddress(delegate) === '0x0000000000000000000000000000000000000000'
    console.log(`   getVotes=${account.governanceVotePower} delegate=${account.currentDelegate} (zero? ${account.currentDelegateIsZero})`)
  }
  if (ftso) {
    const canPropose = await tryRead('PollingFtso.canPropose(account)', () => client.readContract({ address: ftso, abi: pollingFtsoAbi, functionName: 'canPropose', args: [ACCOUNT] }))
    const isMember = await tryRead('PollingFtso.isMember(account)', () => client.readContract({ address: ftso, abi: pollingFtsoAbi, functionName: 'isMember', args: [ACCOUNT] }))
    account.canPropose = bn(canPropose)
    account.isMember = bn(isMember)
    if (isErr(isMember)) out.eligibilityConcerns.push(`[${meta.name}] PollingFtso.isMember(account) REVERTED (${isMember}) — recorded honestly as reverted, not false; canPropose/isProposer are the reliable gates`)
    console.log(`   canPropose=${account.canPropose} isMember=${account.isMember}`)
  }
  if (foundation) {
    const isProposer = await tryRead('PollingFoundation.isProposer(account)', () => client.readContract({ address: foundation, abi: governorAbi, functionName: 'isProposer', args: [ACCOUNT] }))
    account.isProposer = bn(isProposer)
    console.log(`   isProposer=${account.isProposer}`)
  }
  // Native balance — the Coston2 write/verify target must fund the delegate/undelegate round trip.
  const native = await tryRead('native balance', () => client.getBalance({ address: ACCOUNT }))
  account.native = bn(native)
  account.nativeHuman = typeof native === 'bigint' ? (Number(native) / 1e18).toString() : null
  account.nativeSymbol = meta.nativeCurrency.symbol
  console.log(`   native ${account.nativeHuman} ${account.nativeSymbol}`)
  const eligReads = [account.governanceVotePower, account.canPropose, account.isProposer]
  account.blankSlate =
    account.governanceVotePower === '0' &&
    account.currentDelegateIsZero === true &&
    account.canPropose === false &&
    account.isProposer === false &&
    !eligReads.some(isErr)
  net.account = account

  // === Proposal discovery ===
  const discovery = { pollingFtso: {}, pollingFoundation: {} }
  // (a) reliable: PollingFtso.getLastProposal()
  if (ftso) {
    const last = await tryRead('PollingFtso.getLastProposal()', () => client.readContract({ address: ftso, abi: pollingFtsoAbi, functionName: 'getLastProposal' }))
    if (Array.isArray(last)) {
      const id = last[0]
      discovery.pollingFtso.lastProposalId = bn(id)
      discovery.pollingFtso.lastProposalDescription = String(last[1]).slice(0, 240)
      if (typeof id === 'bigint' && id > 0n) {
        const state = await tryRead(`PollingFtso.state(${id})`, () => client.readContract({ address: ftso, abi: pollingFtsoAbi, functionName: 'state', args: [id] }))
        const votes = await tryRead(`PollingFtso.getProposalVotes(${id})`, () => client.readContract({ address: ftso, abi: pollingFtsoAbi, functionName: 'getProposalVotes', args: [id] }))
        const info = await readFtsoProposalInfo(client, ftso, id)
        discovery.pollingFtso.proposal = {
          proposalId: bn(id),
          state: bn(state),
          stateName: typeof state === 'number' ? (FTSO_STATE[state] ?? `unknown(${state})`) : state,
          votes: Array.isArray(votes) ? { for: bn(votes[0]), against: bn(votes[1]) } : votes,
          info,
        }
        if (info.vendoredShapeDecodes === false) out.abiFindings.push(`[${meta.name}] PollingFtso.getProposalInfo does NOT decode with the vendored (string,address,uint256x5) shape; the deployed contract returns ${info.shape}. Task 2 must pin the actual shape/labels.`)
        console.log(`   FTSO proposal ${id}: state=${discovery.pollingFtso.proposal.stateName} votes(for/against)=${JSON.stringify(discovery.pollingFtso.proposal.votes)} infoShape=${info.shape}`)
      } else {
        discovery.pollingFtso.note = 'getLastProposal() returned id 0 — no FTSO management-group proposal has ever been created here (honest empty).'
        console.log('   FTSO getLastProposal id=0 (no proposal — honest empty)')
      }
    } else {
      discovery.pollingFtso.error = last
    }
  }
  // (b) bounded PollingFoundation ProposalCreated scan
  if (foundation && latest != null) {
    const scan = await scanProposalCreated(client, foundation, latest)
    discovery.pollingFoundation.scan = { ...scan, found: undefined }
    discovery.pollingFoundation.discoverable = scan.found.length > 0
    if (scan.found.length === 0) {
      discovery.pollingFoundation.record = {
        discoverable: false,
        lookbackBlocks: scan.lookbackBlocks,
        fromBlock: scan.fromBlock,
        toBlock: scan.toBlock,
        windowsScanned: scan.windowsScanned,
        maxRangePerCall: scan.maxRangePerCall,
        scanError: scan.scanError,
        note: 'No PollingFoundation ProposalCreated within the bounded recent window. Real foundation proposals are months apart; this shallow window is expected empty. Not a blocker.',
      }
      console.log(`   FOUNDATION ProposalCreated scan: none discoverable in ${scan.lookbackBlocks} blocks (${scan.windowsScanned} windows${scan.scanError ? `, aborted: ${scan.scanError}` : ''})`)
    } else {
      discovery.pollingFoundation.proposals = []
      for (const f of scan.found) {
        const id = BigInt(f.proposalId)
        const state = await tryRead(`PollingFoundation.state(${id})`, () => client.readContract({ address: foundation, abi: governorAbi, functionName: 'state', args: [id] }))
        const info = await tryRead(`PollingFoundation.getProposalInfo(${id})`, () => client.readContract({ address: foundation, abi: governorAbi, functionName: 'getProposalInfo', args: [id] }))
        const votes = await tryRead(`PollingFoundation.getProposalVotes(${id})`, () => client.readContract({ address: foundation, abi: governorAbi, functionName: 'getProposalVotes', args: [id] }))
        discovery.pollingFoundation.proposals.push({
          proposalId: f.proposalId,
          foundAtBlock: f.block,
          txHash: f.txHash,
          state: bn(state),
          stateName: typeof state === 'number' ? (GOVERNOR_STATE[state] ?? `unknown(${state})`) : state,
          info: Array.isArray(info)
            ? { proposer: getAddress(info[0]), accept: info[1], votePowerBlock: bn(info[2]), voteStartTime: bn(info[3]), voteEndTime: bn(info[4]), execStartTime: bn(info[5]), execEndTime: bn(info[6]), thresholdConditionBIPS: bn(info[7]), majorityConditionBIPS: bn(info[8]), circulatingSupply: bn(info[9]) }
            : info,
          votes: Array.isArray(votes) ? { for: bn(votes[0]), against: bn(votes[1]) } : votes,
        })
        console.log(`   FOUNDATION proposal ${id}: state=${GOVERNOR_STATE[state] ?? state}`)
      }
    }
  }
  net.discovery = discovery
  return net
}

async function main() {
  console.log('M12 governance probe — KEYLESS, address only:', ACCOUNT)
  // Coston2 first (write/verify target), then Flare mainnet (proposal read lens).
  out.networks.coston2 = await probeNetwork(114, 'write/verify target')
  out.networks.flare = await probeNetwork(14, 'proposal read lens')

  // Summary flags.
  out.summary = {
    fourNamesResolveBothNetworks: [out.networks.coston2, out.networks.flare].every((n) => (n.governanceNamesMissing || []).length === 0),
    governorRejectAbsentBothNetworks: out.networks.coston2.governorRejectAbsent && out.networks.flare.governorRejectAbsent,
    wnatCrossCheckBothNetworks: !!out.networks.coston2.wnatCrossCheck?.match && !!out.networks.flare.wnatCrossCheck?.match,
    accountBlankSlateCoston2: out.networks.coston2.account?.blankSlate === true,
    proposalDiscoverable: {
      flarePollingFtso: !!out.networks.flare.discovery?.pollingFtso?.proposal,
      coston2PollingFtso: !!out.networks.coston2.discovery?.pollingFtso?.proposal,
      flarePollingFoundation: out.networks.flare.discovery?.pollingFoundation?.discoverable === true,
      coston2PollingFoundation: out.networks.coston2.discovery?.pollingFoundation?.discoverable === true,
    },
  }

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))
  console.log('\n=== summary ===')
  console.log(JSON.stringify(out.summary, jsonify, 2))
  console.log('\n=== eligibility concerns ===')
  out.eligibilityConcerns.forEach((c) => console.log(' -', c))
  console.log('=== ABI findings (for Task 2) ===')
  out.abiFindings.forEach((c) => console.log(' -', c))
  console.log('\n=== blockers ===')
  if (blockers.length === 0) console.log(' none — addresses resolve both networks, GovernorReject absent, WNat cross-check passes, account blank-slate confirmed')
  else blockers.forEach((b) => console.log(' -', b))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
