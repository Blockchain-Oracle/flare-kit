/**
 * A real FTestXRP redemption on Coston2, paid out in XRP by an agent.
 *
 * Dev-only tooling. Everything decision-shaped goes through the kit:
 * `quoteRedeem`, `startRedeem`, `reconcileRedeem`. The script only signs and
 * polls — it never decides what state the operation is in.
 *
 * Writes evidence to .thoughts/verification/. Never prints a key.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { assetManagerAbi, fassetAbi, chainFor, registryFor } from '@flare-kit/contracts'
import { createFlareKit, attachRedemptionRequest, formatExact } from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const LOTS = Number(process.argv[2] ?? 1)
const ZERO = '0x0000000000000000000000000000000000000000'

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const reg = registryFor(CHAIN_ID)
const deployment = reg.fassets.XRP
const account = privateKeyToAccount(secrets.evm.privateKey)

const viemChain = {
  id: CHAIN_ID, name: chain.name, nativeCurrency: chain.nativeCurrency,
  rpcUrls: { default: { http: [chain.rpcUrl] } },
}
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })

const evidence = {
  startedAt: new Date().toISOString(), network: chain.name, chainId: CHAIN_ID,
  redeemer: account.address, xrplDestination: secrets.xrpl.address, lots: LOTS, steps: [],
}
const log = (step, data = {}) => {
  evidence.steps.push({ step, at: new Date().toISOString(), ...data })
  console.log(`[${step}]`, JSON.stringify(data))
}
const save = () => {
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(
    `${ROOT}/.thoughts/verification/2026-08-04-coston2-live-redeem.json`,
    JSON.stringify(evidence, null, 2),
  )
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const kit = await createFlareKit({ client: publicClient, chainId: CHAIN_ID })
  const balanceBefore = await publicClient.readContract({
    address: deployment.token, abi: fassetAbi, functionName: 'balanceOf', args: [account.address],
  })
  log('start', {
    kit: kit.label, isMock: kit.isMock,
    fAsset: kit.redeemState.fAssetSymbol,
    balanceBefore: `${Number(balanceBefore) / 1e6}`,
    lotSizeXRP: Number(kit.redeemState.lotSizeUBA) / 1e6,
  })

  const intent = { lots: LOTS, redeemerUnderlyingAddress: secrets.xrpl.address }
  const quote = kit.quoteRedeem(intent, Date.now(), {
    fAssetBalance: { value: balanceBefore, decimals: 6, asset: kit.redeemState.fAssetSymbol },
  })
  log('quote', {
    burned: formatExact(quote.burned), fee: formatExact(quote.fee),
    receives: formatExact(quote.receives), canProceed: quote.canProceed,
    blockedReason: quote.blockedReason ?? null,
    ifAgentDoesNotPay: quote.ifAgentDoesNotPay,
  })
  if (!quote.canProceed) throw new Error(`quote refused: ${quote.blockedReason}`)

  let operation = kit.startRedeem(intent)
  log('operation-created', { id: operation.id, state: operation.state })

  // No executor named, so no native value rides along.
  const hash = await walletClient.writeContract({
    address: deployment.assetManager, abi: assetManagerAbi, functionName: 'redeem',
    args: [BigInt(LOTS), secrets.xrpl.address, ZERO], value: 0n,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log('redeem-submitted', {
    hash, status: receipt.status, explorer: `${chain.explorerUrl}/tx/${hash}`,
  })

  let requested
  for (const entry of receipt.logs) {
    try {
      const d = decodeEventLog({ abi: assetManagerAbi, data: entry.data, topics: entry.topics })
      if (d.eventName === 'RedemptionRequested') requested = d.args
      if (d.eventName?.startsWith('Redemption')) {
        log('event', {
          name: d.eventName,
          args: JSON.parse(JSON.stringify(d.args, (_k, v) => (typeof v === 'bigint' ? String(v) : v))),
        })
      }
    } catch { /* not one of ours */ }
  }
  if (!requested) throw new Error('no RedemptionRequested event in the receipt')

  operation = attachRedemptionRequest(operation, {
    requestId: String(requested.requestId),
    agentVault: requested.agentVault,
    paymentAddress: requested.paymentAddress,
    at: Date.now(),
  })
  log('operation-submitted', {
    state: operation.state,
    requestId: String(requested.requestId),
    agent: requested.agentVault,
    agentPaysFrom: requested.paymentAddress,
    deadlineUnix: String(requested.lastUnderlyingTimestamp),
  })

  // The agent has ~15 minutes. Reconciliation is the kit's job, not ours.
  const until = Date.now() + 16 * 60_000
  while (Date.now() < until) {
    operation = await kit.reconcileRedeem(operation)
    log('reconcile', {
      state: operation.state,
      awaiting: operation.awaiting?.actor ?? null,
      actions: (operation.recovery ?? []).map((a) => a.id),
    })
    if (['succeeded', 'partially_succeeded', 'failed'].includes(operation.state)) break
    if (operation.state === 'action_required') break
    await sleep(30_000)
  }

  const balanceAfter = await publicClient.readContract({
    address: deployment.token, abi: fassetAbi, functionName: 'balanceOf', args: [account.address],
  })
  log('balances', {
    beforeUBA: String(balanceBefore), afterUBA: String(balanceAfter),
    burnedUBA: String(balanceBefore - balanceAfter),
  })
  evidence.finalState = operation.state
  evidence.outcome = operation.state === 'succeeded' ? 'succeeded' : `stopped-at-${operation.state}`
} catch (error) {
  evidence.outcome = 'incomplete'
  evidence.error = String(error).split('\n').slice(0, 5).join(' ')
  console.error('RUN FAILED:', evidence.error)
} finally {
  evidence.finishedAt = new Date().toISOString()
  save()
  console.log('\nevidence -> .thoughts/verification/2026-08-04-coston2-live-redeem.json')
}
