// packages/core/scripts/probe-smart-accounts.mjs
// M13 Task 1 — read-only, KEYLESS XRPL-controlled Smart Accounts probe (no product code,
// no signing, no chain writes). Confirms the substrate for M13 on BOTH networks:
//   - Coston2 (id 114) — the write/verify target,
//   - Flare mainnet (id 14) — the read lens.
// This run:
//   1) resolves MasterAccountController by NAME from FlareContractRegistry.getAllContracts()
//      on both networks and asserts it is the SAME address on both — the deployment
//      property that makes a personal account network-independent;
//   2) reads every OPERATOR-MUTABLE deployment setting (XRPL provider wallets, source id,
//      proof validity window, default + per-instruction fees, registered vaults with their
//      types, registered agent vaults, default executor). These are deliberately NOT
//      snapshotted into @flare-kit/contracts: freezing an operator's wallet list would
//      produce a plan that asks a user to sign an XRPL payment to a retired destination;
//   3) derives the personal account for the run's XRPL address on both networks, asserts
//      the two agree, and records its deployment state, nonce, pinned executor and
//      balances. A read that REVERTS is recorded as such, never fabricated as a zero;
//   4) records the smart-accounts vault namespace against @flare-kit/contracts' M7 vault
//      registry, because on Coston2 the two disagree and a plan that confused them would
//      deposit somewhere the user did not choose;
//   5) confirms the XRPL verifier serves the chain-agnostic `Payment` attestation route —
//      the family M13-R2b builds, without which no instruction can be dispatched at all.
//
//   node packages/core/scripts/probe-smart-accounts.mjs
//
// KEYLESS: only the XRPL address and the EVM account ADDRESS are used. No private key or
// XRPL seed is read, constructed, printed or written — this run cannot sign.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, getAddress, keccak256, toBytes, hexToString } from 'viem'
import {
  BUILT_IN_INSTRUCTIONS,
  VAULT_TYPE,
  masterAccountControllerAbi,
  registryFor,
  smartAccountsFor,
  vaultsFor,
  prepareRequestUrl,
} from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-13-m13-probe.json`

// FlareContractRegistry — the fixed genesis address on every Flare network.
const REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getAllContracts',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string[]' }, { type: 'address[]' }],
  },
]

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
]

// The M8-M12 XRPL testnet account — ADDRESS ONLY (keyless read).
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

const NETWORKS = [
  { key: 'coston2', chainId: 114, rpc: 'https://coston2-api.flare.network/ext/C/rpc' },
  { key: 'flare', chainId: 14, rpc: 'https://flare-api.flare.network/ext/C/rpc' },
]

const jsonify = (_k, v) => (typeof v === 'bigint' ? v.toString() : v)

/** A read that throws is recorded as a refusal, never coerced into a plausible value. */
async function attempt(label, fn) {
  try {
    return { value: await fn() }
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return { unavailable: reason, at: label }
  }
}

async function probeNetwork(network, blockers, findings) {
  const client = createPublicClient({
    transport: http(network.rpc, { timeout: 20_000, retryCount: 2 }),
  })
  const out = { chainId: network.chainId }

  // 1. Resolve the controller by name.
  const registryRead = await attempt('getAllContracts', () =>
    client.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: 'getAllContracts' }),
  )
  if (registryRead.unavailable) {
    blockers.push(`${network.key}: registry unreadable — ${registryRead.unavailable}`)
    return out
  }
  const [names, addresses] = registryRead.value
  const index = names.indexOf('MasterAccountController')
  out.registeredContractCount = names.length
  out.masterAccountController = index >= 0 ? getAddress(addresses[index]) : undefined
  if (!out.masterAccountController) {
    blockers.push(`${network.key}: MasterAccountController is NOT a registered name`)
    return out
  }
  const snapshot = getAddress(smartAccountsFor(network.key).masterAccountController)
  out.matchesSnapshot = out.masterAccountController === snapshot
  if (!out.matchesSnapshot) {
    blockers.push(
      `${network.key}: registry resolves ${out.masterAccountController} but the snapshot pins ${snapshot}`,
    )
  }

  const controller = out.masterAccountController
  const read = (functionName, args = []) =>
    attempt(functionName, () =>
      client.readContract({ address: controller, abi: masterAccountControllerAbi, functionName, args }),
    )

  // 2. Operator-mutable deployment settings.
  out.xrplProviderWallets = await read('getXrplProviderWallets')
  const sourceId = await read('getSourceId')
  out.sourceId = sourceId.value
    ? { raw: sourceId.value, decoded: hexToString(sourceId.value, { size: 32 }).replace(/\0+$/, '') }
    : sourceId
  out.paymentProofValidityDurationSeconds = await read('getPaymentProofValidityDurationSeconds')
  out.defaultInstructionFee = await read('getDefaultInstructionFee')
  out.executorInfo = await read('getExecutorInfo')

  const fees = {}
  for (const instruction of BUILT_IN_INSTRUCTIONS) {
    const key = `0x${instruction.id.toString(16).padStart(2, '0')}`
    fees[key] = await read('getInstructionFee', [BigInt(instruction.id)])
  }
  out.instructionFees = fees

  // 3. The controller's own vault namespace, with each vault's real token identity.
  const vaults = await read('getVaults')
  if (vaults.value) {
    const [ids, addrs, types] = vaults.value
    const typeName = Object.fromEntries(Object.entries(VAULT_TYPE).map(([n, v]) => [v, n]))
    out.vaults = []
    for (let i = 0; i < ids.length; i += 1) {
      const address = getAddress(addrs[i])
      const symbol = await attempt('symbol', () =>
        client.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }),
      )
      out.vaults.push({
        vaultId: ids[i],
        address,
        vaultType: Number(types[i]),
        vaultTypeName: typeName[Number(types[i])] ?? 'UNKNOWN',
        symbol: symbol.value ?? symbol,
      })
    }
  } else {
    out.vaults = vaults
  }
  out.agentVaults = await read('getAgentVaults')

  // 4. The personal account for the run's XRPL owner.
  const personalAccount = await read('getPersonalAccount', [XRPL_OWNER])
  if (personalAccount.value) {
    const address = getAddress(personalAccount.value)
    const code = await attempt('getCode', () => client.getCode({ address }))
    out.personalAccount = {
      address,
      xrplOwner: XRPL_OWNER,
      xrplOwnerHash: keccak256(toBytes(XRPL_OWNER)),
      deployed: Boolean(code.value && code.value !== '0x'),
      nonce: await read('getNonce', [address]),
      pinnedExecutor: await read('getExecutor', [address]),
      nativeBalance: await attempt('getBalance', () => client.getBalance({ address })),
    }
    const fasset = registryFor(network.chainId).fassets.XRP
    out.personalAccount.fasset = {
      symbol: fasset.symbol,
      token: fasset.token,
      balance: await attempt('fasset balanceOf', () =>
        client.readContract({
          address: fasset.token,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
      ),
    }
  } else {
    out.personalAccount = personalAccount
  }

  // 5. How the controller's vault namespace relates to the kit's M7 vault registry.
  const m7 = vaultsFor(network.key) ?? []
  const m7Addresses = new Set(m7.map((vault) => getAddress(vault.address)))
  const controllerAddresses = (out.vaults ?? [])
    .filter((vault) => vault.address)
    .map((vault) => vault.address)
  const shared = controllerAddresses.filter((address) => m7Addresses.has(address))
  out.vaultNamespace = {
    controllerVaultCount: controllerAddresses.length,
    m7VaultCount: m7.length,
    sharedAddresses: shared,
    note:
      shared.length === controllerAddresses.length
        ? 'every controller vault is also an M7 vault on this network'
        : 'the controller vault namespace DIVERGES from the M7 registry — resolve vault ids from getVaults(), never from vaults.ts',
  }
  if (shared.length !== controllerAddresses.length) {
    findings.push(
      `${network.key}: ${controllerAddresses.length - shared.length} of ${controllerAddresses.length} controller vaults are NOT in the M7 registry`,
    )
  }

  return out
}

/** The chain-agnostic `Payment` route — the family M13-R2b builds. */
async function probePaymentRoute(network, blockers) {
  const services = registryFor(network.chainId).services
  const url = prepareRequestUrl(services.verifierBaseUrl, 'xrp', 'Payment')
  const docUrl = `${services.verifierBaseUrl.replace(/\/$/, '')}/verifier/xrp/api-doc-json`
  const result = await attempt('verifier api-doc-json', async () => {
    const headers = services.publicApiKey ? { [services.apiKeyHeader]: services.publicApiKey } : {}
    const response = await fetch(docUrl, { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const document = await response.json()
    return Object.keys(document?.paths ?? {})
  })
  if (result.unavailable) {
    // An unreachable verifier says nothing about whether the route exists.
    return { prepareRequestUrl: url, routesUnavailable: result.unavailable }
  }
  const serves = result.value.includes('/verifier/xrp/Payment/prepareRequest')
  if (!serves && network.key === 'coston2') {
    blockers.push(
      'coston2: the XRPL verifier does NOT serve /verifier/xrp/Payment/prepareRequest — no instruction can be dispatched',
    )
  }
  return {
    prepareRequestUrl: url,
    servesPayment: serves,
    servesXrpPayment: result.value.includes('/verifier/xrp/XRPPayment/prepareRequest'),
  }
}

async function main() {
  const blockers = []
  const findings = []
  const out = {
    milestone: 'M13 — XRPL-controlled Smart Accounts (part one, proof-based flow)',
    probedAt: new Date().toISOString(),
    keyless: true,
    xrplOwner: XRPL_OWNER,
    networks: {},
  }

  for (const network of NETWORKS) {
    out.networks[network.key] = await probeNetwork(network, blockers, findings)
    out.networks[network.key].paymentAttestationRoute = await probePaymentRoute(network, blockers)
  }

  const coston2Account = out.networks.coston2?.personalAccount?.address
  const flareAccount = out.networks.flare?.personalAccount?.address
  out.crossNetworkIdentity = {
    coston2: coston2Account,
    flare: flareAccount,
    identical: Boolean(coston2Account) && coston2Account === flareAccount,
  }
  if (coston2Account && flareAccount && coston2Account !== flareAccount) {
    blockers.push(
      `the personal account differs by network (${coston2Account} vs ${flareAccount}) — the surface must not claim one account`,
    )
  }

  out.blockers = blockers
  out.findings = findings

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))

  console.log('=== cross-network identity ===')
  console.log(JSON.stringify(out.crossNetworkIdentity, jsonify, 2))
  console.log('\n=== findings ===')
  if (findings.length === 0) console.log(' none')
  else findings.forEach((f) => console.log(' -', f))
  console.log('\n=== blockers ===')
  if (blockers.length === 0) console.log(' none')
  else blockers.forEach((b) => console.log(' -', b))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
