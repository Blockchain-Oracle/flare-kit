// packages/core/scripts/live-bridge.mjs
/**
 * Real cross-chain bridge + redeem on Coston2 ↔ Sepolia through the kit (M8-AC1/AC2).
 * Dev-only: viem signs the approval/send, which the shipped package never does —
 * core produces the honest quote and the unsigned plan, a wallet signs it. Everything
 * deciding the operation goes through the kit's CrossChainAdapter.
 *
 * The whole point of the milestone: DELIVERY is proven by READING the destination
 * chain (the Sepolia OFTReceived for the guid), never by dressing up the source send.
 *
 *   node scripts/live-bridge.mjs sendA      # Phase A: approve + send Coston2 → Sepolia
 *   node scripts/live-bridge.mjs deliverA    # poll Sepolia for the delivery, assert, flip-ready
 *   node scripts/live-bridge.mjs a           # sendA then deliverA in one run (default)
 *   node scripts/live-bridge.mjs sendB       # Phase B: redeem Sepolia → Coston2 → XRPL
 *   node scripts/live-bridge.mjs deliverB     # poll the composer FAssetRedeemed + XRPL
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, formatUnits, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { routeByKey, OFT_ADAPTER_ABI } from '@flare-kit/contracts'
import {
  makeBridgeAdapter, bridgeAbiFor, quoteBridge,
  buildBridgePlan, buildRedeemPlan, reconcileDelivery, reconcileBridgeRedeem,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const MODE = process.argv[2] ?? 'a'
const AMOUNT = BigInt(process.env.AMOUNT_UNITS ?? '1000000') // 1 FXRP (6dp)
const SLIPPAGE = 50
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-11-coston2-live-bridge.json`
const POLL_MS = 15_000
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS ?? 32) // ~8 min

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const account = privateKeyToAccount(secrets.evm.privateKey)
const OWNER = account.address
const XRPL_DEST = secrets.xrpl.address

// Registry routes are bridgeVerified:false until this run confirms delivery; the live
// script bootstraps with a verified override (the M7 live-vault precedent), then the
// registry flag is flipped in source only AFTER a confirmed destination read.
const bridgeRoute = { ...routeByKey('coston2', 'coston2-sepolia'), bridgeVerified: true }
const redeemRoute = { ...routeByKey('coston2', 'sepolia-coston2-redeem'), bridgeVerified: true }

const chainOf = (ep) => ({ id: ep.chainId, name: ep.key, nativeCurrency: { name: ep.nativeCurrency.symbol, symbol: ep.nativeCurrency.symbol, decimals: ep.nativeCurrency.decimals }, rpcUrls: { default: { http: [ep.rpcUrl] } } })
const publicOf = (ep) => createPublicClient({ chain: chainOf(ep), transport: http(ep.rpcUrl) })
const walletOf = (ep) => createWalletClient({ account, chain: chainOf(ep), transport: http(ep.rpcUrl) })

const coston2 = bridgeRoute.from // Coston2 endpoint
const sepolia = bridgeRoute.to // Sepolia endpoint
const coston2Public = publicOf(coston2)
const coston2Wallet = walletOf(coston2)
const sepoliaPublic = publicOf(sepolia)
const sepoliaWallet = walletOf(sepolia)

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const evidence = existsSync(EV_PATH)
  ? JSON.parse(readFileSync(EV_PATH, 'utf8'))
  : { startedAt: new Date().toISOString(), signer: OWNER, xrplDestination: XRPL_DEST, phaseA: {}, phaseB: {} }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(EV_PATH, JSON.stringify(evidence, jsonify, 2)) }
const log = (step, data = {}) => console.log(`[${step}]`, JSON.stringify(data, jsonify))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowSec = () => Math.floor(Date.now() / 1000)

async function signCall(walletClient, publicClient, call, label) {
  const { request } = await publicClient.simulateContract({
    account,
    address: call.address,
    abi: bridgeAbiFor(call.abiKind),
    functionName: call.functionName,
    args: call.args,
    ...(call.value !== undefined ? { value: call.value } : {}),
  })
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log(label, { hash, block: receipt.blockNumber, status: receipt.status })
  return { hash, receipt }
}

function guidFromReceipt(receipt) {
  const sent = parseEventLogs({ abi: OFT_ADAPTER_ABI, logs: receipt.logs, eventName: 'OFTSent' })
  return sent[0]?.args?.guid ?? null
}

// --- Phase A: bridge Coston2 -> Sepolia, prove delivery by reading Sepolia ---
async function sendA() {
  const adapter = makeBridgeAdapter(coston2Public, sepoliaPublic, bridgeRoute)
  const q = await quoteBridge({ adapter, amountIn: AMOUNT, slippageBips: SLIPPAGE, to: OWNER, now: Date.now() })
  if (q.kind !== 'quote') throw new Error(`quote unavailable: ${q.reason}`)
  log('quoteA', { nativeFee: q.quote.nativeFee.value, amountReceivedLD: q.quote.amountReceivedLD?.value, minReceived: q.quote.minReceived.value })

  const planResult = await buildBridgePlan(
    adapter,
    { routeKey: bridgeRoute.key, amountIn: AMOUNT, slippageBips: SLIPPAGE, deadline: nowSec() + 3600, recipient: OWNER },
    OWNER,
    nowSec(),
  )
  if (planResult.kind !== 'plan') throw new Error(`plan refused: ${JSON.stringify(planResult.error)}`)
  const plan = planResult.plan

  const balBefore = await sepoliaPublic.readContract({ address: sepolia.oft, abi: bridgeAbiFor('erc20'), functionName: 'balanceOf', args: [OWNER] })
  const sinceSepolia = await sepoliaPublic.getBlockNumber()

  if (plan.approve) await signCall(coston2Wallet, coston2Public, plan.approve, 'approveA')
  const { hash, receipt } = await signCall(coston2Wallet, coston2Public, plan.send, 'sendA')
  const guid = guidFromReceipt(receipt)

  evidence.phaseA = {
    ...evidence.phaseA,
    quotedFee: q.quote.nativeFee.value.toString(),
    quotedReceive: q.quote.amountReceivedLD?.value?.toString() ?? null,
    amountIn: AMOUNT.toString(),
    approveTx: plan.approve ? 'signed' : 'not-needed',
    sourceTx: hash,
    sourceExplorer: `${coston2.explorer}${hash}`,
    guid,
    layerZeroScan: `${bridgeRoute.scanUrl}${hash}`,
    sinceSepoliaBlock: sinceSepolia.toString(),
    sepoliaBalanceBefore: balBefore.toString(),
    delivered: null,
  }
  save()
  log('sendA:done', { guid, scan: evidence.phaseA.layerZeroScan })
  return { guid, sinceSepolia }
}

async function deliverA() {
  const adapter = makeBridgeAdapter(coston2Public, sepoliaPublic, bridgeRoute)
  const guid = evidence.phaseA?.guid
  const since = BigInt(evidence.phaseA?.sinceSepoliaBlock ?? '0')
  if (!guid) throw new Error('no phase A guid — run sendA first')
  let op = { state: 'submitted', awaiting: undefined }
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const delivery = await adapter.reads.delivery(guid, since)
    op = reconcileDelivery({ state: 'submitted', steps: [], evidence: [], attempts: [], quoteHistory: [], updatedAt: 0, createdAt: 0, id: 'A', capability: 'bridge', network: 114, intent: {}, schemaVersion: 1 }, delivery, nowSec())
    log('deliverA:poll', { attempt: i + 1, delivery: delivery.kind, state: op.state })
    if (delivery.kind === 'delivered') {
      const balAfter = await sepoliaPublic.readContract({ address: sepolia.oft, abi: bridgeAbiFor('erc20'), functionName: 'balanceOf', args: [OWNER] })
      const before = BigInt(evidence.phaseA.sepoliaBalanceBefore)
      const delta = balAfter - before
      evidence.phaseA.delivered = {
        amountReceivedLD: delivery.amountReceivedLD?.toString() ?? null,
        sepoliaBalanceAfter: balAfter.toString(),
        balanceDelta: delta.toString(),
        opState: op.state, // MUST be 'succeeded' — entered ONLY from this destination read
        quoteMatchesDelivered: delivery.amountReceivedLD != null && delivery.amountReceivedLD.toString() === (evidence.phaseA.quotedReceive ?? ''),
        confirmedAt: new Date().toISOString(),
      }
      save()
      log('deliverA:DELIVERED', evidence.phaseA.delivered)
      return true
    }
    await sleep(POLL_MS)
  }
  evidence.phaseA.delivered = { staged: true, note: 'delivery not observed within the poll window; re-run deliverA', lastState: op.state }
  save()
  log('deliverA:staged', { note: 'still in flight — re-run deliverA' })
  return false
}

// --- Top-up bridge: move more FXRP to Sepolia so Phase B has a full lot (10 FXRP) ---
// Records under `evidence.topup` so the verified Phase A evidence is never clobbered.
async function topup() {
  const adapter = makeBridgeAdapter(coston2Public, sepoliaPublic, bridgeRoute)
  const planResult = await buildBridgePlan(adapter, { routeKey: bridgeRoute.key, amountIn: AMOUNT, slippageBips: SLIPPAGE, deadline: nowSec() + 3600, recipient: OWNER }, OWNER, nowSec())
  if (planResult.kind !== 'plan') throw new Error(`topup plan refused: ${JSON.stringify(planResult.error)}`)
  const plan = planResult.plan
  const since = await sepoliaPublic.getBlockNumber()
  if (plan.approve) await signCall(coston2Wallet, coston2Public, plan.approve, 'topup:approve')
  const { hash, receipt } = await signCall(coston2Wallet, coston2Public, plan.send, 'topup:send')
  const guid = guidFromReceipt(receipt)
  evidence.topup = { amountIn: AMOUNT.toString(), sourceTx: hash, guid, sinceSepoliaBlock: since.toString(), delivered: false }
  save()
  log('topup:sent', { guid, amount: formatUnits(AMOUNT, 6) })
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const delivery = await adapter.reads.delivery(guid, since)
    log('topup:poll', { attempt: i + 1, delivery: delivery.kind })
    if (delivery.kind === 'delivered') {
      const bal = await sepoliaPublic.readContract({ address: sepolia.oft, abi: bridgeAbiFor('erc20'), functionName: 'balanceOf', args: [OWNER] })
      evidence.topup.delivered = true
      evidence.topup.sepoliaBalanceAfter = bal.toString()
      save()
      log('topup:DELIVERED', { sepoliaFxrp: formatUnits(bal, 6) })
      return true
    }
    await sleep(POLL_MS)
  }
  log('topup:staged', {})
  return false
}

// --- Phase B: redeem Sepolia -> Coston2 composer -> native XRP on XRPL ---
async function sendB() {
  const adapter = makeBridgeAdapter(sepoliaPublic, coston2Public, redeemRoute)
  const q = await quoteBridge({ adapter, amountIn: AMOUNT, slippageBips: SLIPPAGE, to: redeemRoute.composer, now: Date.now() })
  if (q.kind !== 'quote') throw new Error(`redeem quote unavailable: ${q.reason}`)
  log('quoteB', { nativeFee: q.quote.nativeFee.value })

  const planResult = await buildRedeemPlan(
    adapter,
    { routeKey: redeemRoute.key, amountIn: AMOUNT, slippageBips: SLIPPAGE, deadline: nowSec() + 3600, xrplDestination: XRPL_DEST },
    OWNER,
    nowSec(),
  )
  if (planResult.kind !== 'plan') throw new Error(`redeem plan refused: ${JSON.stringify(planResult.error)}`)
  const plan = planResult.plan

  const sinceCoston2 = await coston2Public.getBlockNumber()
  if (plan.approve) await signCall(sepoliaWallet, sepoliaPublic, plan.approve, 'approveB')
  const { hash, receipt } = await signCall(sepoliaWallet, sepoliaPublic, plan.send, 'sendB')
  const guid = guidFromReceipt(receipt)

  evidence.phaseB = {
    ...evidence.phaseB,
    amountIn: AMOUNT.toString(),
    approveTx: plan.approve ? 'signed' : 'not-needed (native OFT)',
    sourceTx: hash,
    sourceExplorer: `${sepolia.explorer}${hash}`,
    guid,
    layerZeroScan: `${redeemRoute.scanUrl}${hash}`,
    sinceCoston2Block: sinceCoston2.toString(),
    // Ripple-epoch second at send — the settlement read only accepts an XRPL payment
    // that post-dates this, so a pre-existing faucet tx can't be mistaken for the payout.
    sinceRipple: Math.floor(Date.now() / 1000) - 946_684_800,
    xrplDestination: XRPL_DEST,
    redeemed: null,
  }
  save()
  log('sendB:done', { guid, scan: evidence.phaseB.layerZeroScan })
  return { guid, sinceCoston2 }
}

// The XRPL settlement read — the ONLY signal that carries the redeem to succeeded
// (AC3: XRP received is asserted only from settlement evidence). It must be CORRELATED
// to THIS redemption: the redeemer's XRPL address also receives faucet drops, so a bare
// "most recent incoming Payment" would false-positive off an unrelated tx. We require an
// incoming Payment whose delivered amount matches `expectedUBA` net of the agent fee
// (settlement ≤ requested, within ~5%), and that post-dates the redemption filing
// (`sinceRipple` = the ripple-epoch second recorded at sendB). Absence → pending.
async function checkXrplSettlement(expectedUBA, sinceRipple) {
  if (!expectedUBA) return { kind: 'pending' }
  try {
    const res = await globalThis.fetch('https://xrpl-testnet-api.flare.network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'account_tx', params: [{ account: XRPL_DEST, ledger_index_min: -1, ledger_index_max: -1, limit: 10, forward: false }] }),
    })
    const data = await res.json()
    const floor = (expectedUBA * 95n) / 100n // an FAssets redemption pays ≤ requested, minus a small fee
    for (const t of data?.result?.transactions ?? []) {
      const tx = t.tx ?? t.tx_json ?? {}
      if (tx.TransactionType !== 'Payment' || tx.Destination !== XRPL_DEST || tx.Account === XRPL_DEST) continue
      if (sinceRipple && typeof tx.date === 'number' && tx.date < sinceRipple) continue // predates this redemption
      const raw = (t.meta && t.meta.delivered_amount) || tx.Amount
      if (typeof raw !== 'string') continue // non-XRP (issued-currency) payment — not our redemption
      const drops = BigInt(raw)
      if (drops <= expectedUBA && drops >= floor) {
        return { kind: 'settled', amountDrops: drops, txHash: tx.hash ?? null, from: tx.Account }
      }
    }
  } catch {
    // XRPL read failed — pending, never a fabricated failure.
  }
  return { kind: 'pending' }
}

const redeemRecord = () => ({ state: 'submitted', steps: [], evidence: [], attempts: [], quoteHistory: [], updatedAt: 0, createdAt: 0, id: 'B', capability: 'bridge_redeem', network: 114, intent: {}, schemaVersion: 1 })

async function deliverB() {
  const adapter = makeBridgeAdapter(sepoliaPublic, coston2Public, redeemRoute)
  const guid = evidence.phaseB?.guid
  const since = BigInt(evidence.phaseB?.sinceCoston2Block ?? '0')
  if (!guid) throw new Error('no phase B guid — run sendB first')
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const delivery = await adapter.reads.delivery(guid, since)
    const redemption = await adapter.reads.redemption(guid, since)
    // Only look at XRPL once the redemption is FILED — the agent pays after that.
    const settlement =
      redemption.kind === 'filed'
        ? await checkXrplSettlement(redemption.redeemedAmountUBA, evidence.phaseB?.sinceRipple ?? 0)
        : { kind: 'pending' }
    const op = reconcileBridgeRedeem(redeemRecord(), delivery, redemption, settlement, nowSec())
    log('deliverB:poll', { attempt: i + 1, delivery: delivery.kind, redemption: redemption.kind, settlement: settlement.kind, state: op.state })
    if (op.state === 'succeeded') {
      evidence.phaseB.redeemed = {
        redeemedAmountUBA: redemption.kind === 'filed' ? (redemption.redeemedAmountUBA?.toString() ?? null) : null,
        underlyingAddress: redemption.kind === 'filed' ? redemption.underlyingAddress : null,
        xrplSettlement: { amountDrops: settlement.amountDrops?.toString() ?? null, txHash: settlement.txHash, from: settlement.from },
        opState: op.state, // succeeded — reached ONLY from the XRPL settlement read
        note: 'Full end-to-end: LZ delivery → composer FAssetRedeemed → native XRP settled on XRPL.',
        confirmedAt: new Date().toISOString(),
      }
      save()
      log('deliverB:SETTLED', evidence.phaseB.redeemed)
      return true
    }
    if (redemption.kind === 'failed') {
      evidence.phaseB.redeemed = { failed: true, opState: op.state }
      save()
      log('deliverB:FAILED', {})
      return false
    }
    await sleep(POLL_MS)
  }
  evidence.phaseB.redeemed = { staged: true, note: 'settlement not observed within the poll window; re-run deliverB' }
  save()
  log('deliverB:staged', {})
  return false
}

async function dry() {
  // Read-only: quote + plan against the LIVE chain, NO signing, NO spend. Confirms
  // the whole kit path resolves before any transaction is broadcast.
  const adapter = makeBridgeAdapter(coston2Public, sepoliaPublic, bridgeRoute)
  const q = await quoteBridge({ adapter, amountIn: AMOUNT, slippageBips: SLIPPAGE, to: OWNER, now: Date.now() })
  log('dry:quote', q.kind === 'quote' ? { nativeFee: q.quote.nativeFee.value, feeAsset: q.quote.nativeFee.asset, amountReceivedLD: q.quote.amountReceivedLD?.value, minReceived: q.quote.minReceived.value } : q)
  const planResult = await buildBridgePlan(adapter, { routeKey: bridgeRoute.key, amountIn: AMOUNT, slippageBips: SLIPPAGE, deadline: nowSec() + 3600, recipient: OWNER }, OWNER, nowSec())
  log('dry:plan', planResult.kind === 'plan'
    ? { hasApprove: !!planResult.plan.approve, sendTo: planResult.plan.send.address, sendValue: planResult.plan.send.value, kind: planResult.plan.kind }
    : planResult)
}

async function dryB() {
  // Read-only redeem quote + plan against live Sepolia: validates the compose options
  // and the Sepolia→Coston2 peer wiring before any broadcast.
  const adapter = makeBridgeAdapter(sepoliaPublic, coston2Public, redeemRoute)
  const q = await quoteBridge({ adapter, amountIn: AMOUNT, slippageBips: SLIPPAGE, to: redeemRoute.composer, now: Date.now() })
  log('dryB:quote', q.kind === 'quote' ? { nativeFee: q.quote.nativeFee.value, feeAsset: q.quote.nativeFee.asset, amountReceivedLD: q.quote.amountReceivedLD?.value } : q)
  const planResult = await buildRedeemPlan(adapter, { routeKey: redeemRoute.key, amountIn: AMOUNT, slippageBips: SLIPPAGE, deadline: nowSec() + 3600, xrplDestination: XRPL_DEST }, OWNER, nowSec())
  log('dryB:plan', planResult.kind === 'plan'
    ? { hasApprove: !!planResult.plan.approve, sendTo: planResult.plan.send.address, sendValue: planResult.plan.send.value, kind: planResult.plan.kind }
    : planResult)
}

async function main() {
  log('start', { mode: MODE, signer: OWNER, amount: formatUnits(AMOUNT, 6) + ' FXRP' })
  if (MODE === 'dry') await dry()
  else if (MODE === 'dryB') await dryB()
  else if (MODE === 'topup') await topup()
  else if (MODE === 'sendA') await sendA()
  else if (MODE === 'deliverA') await deliverA()
  else if (MODE === 'a') { await sendA(); await deliverA() }
  else if (MODE === 'sendB') await sendB()
  else if (MODE === 'deliverB') await deliverB()
  else if (MODE === 'b') { await sendB(); await deliverB() }
  else throw new Error(`unknown mode ${MODE}`)
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
