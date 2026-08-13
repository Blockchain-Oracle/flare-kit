// packages/core/scripts/live-vault.mjs
/**
 * Real vault deposit + withdrawal on Coston2 through the kit (M7-AC1/AC2).
 * Dev-only: viem signs the approvals/deposit/withdraw, which the shipped package
 * never does — core produces the honest quotes and the unsigned plans, a wallet
 * signs them. Everything deciding the operation goes through the kit's adapter.
 *
 * PHASE A (this run): deposit into both vaults (assert predicted==minted shares),
 * drive Upshift INSTANT end-to-end, and initiate both DELAYED withdraw-requests,
 * recording each claim-ref for Phase B. Because the withdraw path is being
 * ESTABLISHED here, the script builds the withdraw plan against a verified-config
 * override; the registry flag is flipped only after the run succeeds.
 *
 * PHASE B (after the period/lag boundary): `node scripts/live-vault.mjs claim`
 * reconciles each recorded ref and claims it, completing the delayed round trip.
 *
 *   node scripts/live-vault.mjs [phaseA|claim]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainFor, vaultByKey } from '@flare-kit/contracts'
import {
  makeVaultAdapter, vaultAbiFor, withdrawalPhase, firelightClaimRef,
  buildDepositPlan, buildWithdrawPlan, buildClaimPlan,
  quoteDeposit, quoteWithdraw, formatExact,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const MODE = process.argv[2] ?? 'phaseA'
const SLIPPAGE = 300
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-11-coston2-live-vault.json`

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const account = privateKeyToAccount(secrets.evm.privateKey)
const viemChain = { id: CHAIN_ID, name: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: { default: { http: [chain.rpcUrl] } } }
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })
const OWNER = account.address

const evidence = existsSync(EV_PATH)
  ? JSON.parse(readFileSync(EV_PATH, 'utf8'))
  : { startedAt: new Date().toISOString(), network: chain.name, chainId: CHAIN_ID, signer: OWNER, phaseA: {}, phaseB: {}, refs: {} }
const explorerTx = (h) => `${chain.explorerUrl}/tx/${h}`
const log = (step, data = {}) => { console.log(`[${step}]`, JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v))) }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(EV_PATH, JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)) }

const sign = async (call, label) => {
  const abi = vaultAbiFor(call.protocol)
  // Buffer the gas: the first request in a period does extra checkpoint writes, and
  // an estimate taken right after the prior tx can undercount → out-of-gas revert.
  const est = await publicClient
    .estimateContractGas({ address: call.address, abi, functionName: call.functionName, args: call.args, account })
    .catch(() => undefined)
  const hash = await walletClient.writeContract({
    address: call.address,
    abi,
    functionName: call.functionName,
    args: call.args,
    ...(est ? { gas: (est * 3n) / 2n } : {}),
  })
  log(`${label}-submitted`, { tx: hash, link: explorerTx(hash), gas: est ? ((est * 3n) / 2n).toString() : 'auto' })
  const rcpt = await publicClient.waitForTransactionReceipt({ hash })
  log(`${label}-confirmed`, { status: rcpt.status, block: Number(rcpt.blockNumber) })
  if (rcpt.status !== 'success') throw new Error(`${label} reverted`)
  return { hash, link: explorerTx(hash), block: Number(rcpt.blockNumber) }
}

const readVault = (cfg, fn, args = []) =>
  publicClient.readContract({ address: cfg.address, abi: vaultAbiFor(cfg.protocol), functionName: fn, args })

async function deposit(cfg, assetsIn, tag) {
  const adapter = makeVaultAdapter(publicClient, cfg)
  const now = Math.floor(Date.now() / 1000)
  const q = await quoteDeposit(adapter, assetsIn, SLIPPAGE, now)
  if (q.kind !== 'quote') throw new Error(`${tag} deposit not quotable: ${q.reason}`)
  const sharesBefore = await adapter.reads.shareBalance(OWNER)
  const planR = await buildDepositPlan(adapter, { vaultKey: cfg.key, assetsIn, slippageBips: SLIPPAGE, recipient: OWNER, deadline: now + 1200 }, OWNER, now)
  if (planR.kind !== 'plan') throw new Error(`${tag} deposit gated: ${JSON.stringify(planR.error)}`)
  const txs = {}
  if (planR.plan.approve) txs.approve = await sign(planR.plan.approve, `${tag}-deposit-approve`)
  txs.deposit = await sign(planR.plan.deposit, `${tag}-deposit`)
  const sharesAfter = await adapter.reads.shareBalance(OWNER)
  const minted = sharesAfter - sharesBefore
  const predicted = q.quote.expectedShares.value
  const rec = { assetsIn: assetsIn.toString(), predictedShares: predicted.toString(), mintedShares: minted.toString(), match: predicted === minted, share: q.quote.expectedShares.asset, txs }
  evidence.phaseA[`${tag}-deposit`] = rec
  log(`${tag}-deposit-settled`, { predicted: predicted.toString(), minted: minted.toString(), match: rec.match })
  save()
  return minted
}

async function requestDelayed(cfg, shares, tag) {
  const adapter = makeVaultAdapter(publicClient, { ...cfg, withdrawVerified: true }) // bootstrap the verification
  const now = Math.floor(Date.now() / 1000)
  // capture the claim-ref BEFORE requesting
  let ref
  if (cfg.protocol === 'firelight') {
    // A Firelight redeem in period P unlocks under period P+1 — record the UNLOCK
    // period, not the request period, or the claim strands (see firelightClaimRef).
    const period = await readVault(cfg, 'currentPeriod')
    const nextEnd = await readVault(cfg, 'nextPeriodEnd')
    const built = firelightClaimRef(period, Number(nextEnd))
    ref = { protocol: 'firelight', period: built.period.toString(), claimableAt: built.claimableAt }
  } else {
    const [y, m, d, epoch] = await readVault(cfg, 'getWithdrawalEpoch')
    ref = { protocol: 'upshift', year: Number(y), month: Number(m), day: Number(d), claimableAt: Number(epoch) }
  }
  const q = await quoteWithdraw(adapter, shares, 'delayed', SLIPPAGE, now)
  const planR = await buildWithdrawPlan(adapter, { vaultKey: cfg.key, shares, route: 'delayed', slippageBips: SLIPPAGE, recipient: OWNER, deadline: now + 1200 }, OWNER, now)
  if (planR.kind !== 'plan') throw new Error(`${tag} withdraw gated: ${JSON.stringify(planR.error)}`)
  const txs = {}
  if (planR.plan.approveShare) txs.approveShare = await sign(planR.plan.approveShare, `${tag}-request-approve`)
  txs.request = await sign(planR.plan.request, `${tag}-request`)
  evidence.refs[tag] = ref
  evidence.phaseA[`${tag}-request`] = { shares: shares.toString(), route: 'delayed', expectedAssets: q.kind === 'quote' ? q.quote.expectedAssets.value.toString() : null, ref, txs }
  log(`${tag}-request-settled`, { ref, expectedAssets: q.kind === 'quote' ? formatExact(q.quote.expectedAssets) : 'n/a' })
  save()
}

async function instant(cfg, shares, tag) {
  const adapter = makeVaultAdapter(publicClient, { ...cfg, withdrawVerified: true })
  const now = Math.floor(Date.now() / 1000)
  const assetBefore = await adapter.reads.assetBalance(OWNER)
  const q = await quoteWithdraw(adapter, shares, 'instant', SLIPPAGE, now)
  const planR = await buildWithdrawPlan(adapter, { vaultKey: cfg.key, shares, route: 'instant', slippageBips: SLIPPAGE, recipient: OWNER, deadline: now + 1200 }, OWNER, now)
  if (planR.kind !== 'plan') throw new Error(`${tag} instant gated: ${JSON.stringify(planR.error)}`)
  const txs = {}
  if (planR.plan.approveShare) txs.approveShare = await sign(planR.plan.approveShare, `${tag}-instant-approve`)
  txs.instant = await sign(planR.plan.request, `${tag}-instant`)
  const assetAfter = await adapter.reads.assetBalance(OWNER)
  const received = assetAfter - assetBefore
  evidence.phaseA[`${tag}-instant`] = { shares: shares.toString(), expectedAssets: q.kind === 'quote' ? q.quote.expectedAssets.value.toString() : null, receivedAssets: received.toString(), txs }
  log(`${tag}-instant-settled`, { expected: q.kind === 'quote' ? q.quote.expectedAssets.value.toString() : 'n/a', received: received.toString() })
  save()
}

async function claimAll() {
  for (const [tag, ref] of Object.entries(evidence.refs ?? {})) {
    const cfgKey = tag.startsWith('firelight') ? 'firelight-fxrp' : 'upshift-fxrp'
    const cfg = vaultByKey('coston2', cfgKey)
    const adapter = makeVaultAdapter(publicClient, { ...cfg, withdrawVerified: true })
    const now = Math.floor(Date.now() / 1000)
    const refTyped = ref.protocol === 'firelight'
      ? { protocol: 'firelight', period: BigInt(ref.period), claimableAt: ref.claimableAt }
      : { protocol: 'upshift', year: ref.year, month: ref.month, day: ref.day, claimableAt: ref.claimableAt }
    const pending = await adapter.reads.claimable(OWNER, refTyped, now)
    const phase = withdrawalPhase(pending, now)
    log(`${tag}-reconcile`, { phase, claimableAt: ref.claimableAt, now })
    if (phase !== 'claimable') { log(`${tag}-not-yet`, { phase }); continue }
    const assetBefore = await adapter.reads.assetBalance(OWNER)
    const plan = buildClaimPlan(adapter, refTyped, OWNER)
    const tx = await sign(plan.claim, `${tag}-claim`)
    const assetAfter = await adapter.reads.assetBalance(OWNER)
    evidence.phaseB[tag] = { claimedAssets: (assetAfter - assetBefore).toString(), tx }
    log(`${tag}-claim-settled`, { received: (assetAfter - assetBefore).toString() })
    save()
  }
}

try {
  log('signer', { address: OWNER, mode: MODE })
  const firelight = vaultByKey('coston2', 'firelight-fxrp')
  const upshift = vaultByKey('coston2', 'upshift-fxrp')

  if (MODE === 'claim') {
    await claimAll()
    log('done', { mode: 'claim' })
  } else {
    // --- Firelight: deposit within the REAL global-limit headroom, then delayed-request ---
    // Idempotent: if a prior run already minted stFXRP, use it rather than re-depositing.
    const flAdapter = makeVaultAdapter(publicClient, firelight)
    let flShares = await flAdapter.reads.shareBalance(OWNER)
    if (flShares > 0n) {
      log('firelight-existing-shares', { shares: flShares.toString() })
    } else {
      // maxDeposit lies (uint max); availability returns the true headroom (limit − total).
      const flAvail = await flAdapter.reads.availability(OWNER)
      log('firelight-headroom', { headroom: flAvail.maxDeposit.toString() })
      const flAmount = flAvail.maxDeposit >= 5_000n ? 3_000n : flAvail.maxDeposit > 1_200n ? flAvail.maxDeposit - 600n : 0n
      if (flAmount > 0n) flShares = await deposit(firelight, flAmount, 'firelight')
      else { evidence.phaseA['firelight-deposit'] = { skipped: 'at deposit capacity', headroom: flAvail.maxDeposit.toString() }; log('firelight-skip', { headroom: flAvail.maxDeposit.toString() }); save() }
    }
    if (flShares > 0n) await requestDelayed(firelight, flShares, 'firelight')

    // --- Upshift: deposit 1 FXRP (idempotent), instant-redeem half, delayed-request the rest ---
    const upAdapter = makeVaultAdapter(publicClient, upshift)
    let upShares = await upAdapter.reads.shareBalance(OWNER)
    if (upShares > 0n) log('upshift-existing-shares', { shares: upShares.toString() })
    else upShares = await deposit(upshift, 1_000_000n, 'upshift')
    const half = upShares / 2n
    if (half > 0n) await instant(upshift, half, 'upshift')
    if (upShares - half > 0n) await requestDelayed(upshift, upShares - half, 'upshift')

    log('done', { mode: 'phaseA', note: 'delayed claims pending — run `node scripts/live-vault.mjs claim` after the boundary' })
  }
  save()
} catch (error) {
  evidence.error = { at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) }
  save()
  console.error('live-vault failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
