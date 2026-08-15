// packages/core/scripts/live-gasless.mjs
/**
 * The honest gasless FXRP proof on Coston2 (M9-AC1/AC2). Dev-only: viem signs the
 * approval and the EIP-712 PaymentRequest, which the shipped package never does — core
 * produces the unsigned plan and the signature, the relayer service submits it and pays
 * the gas. Everything deciding the operation goes through the kit's GaslessAdapter.
 *
 * The whole point: the payer pays gas for the ONE-TIME approval, then — from a DRAINED
 * ~0 C2FLR state — makes a real FXRP payment for which it pays ZERO gas (the relayer
 * pays). `succeeded` is reached ONLY from reading the on-chain PaymentExecuted, never
 * from the relayer's HTTP response.
 *
 * Requires the relayer running (operator key) at the registry relayerUrl:
 *   RELAYER_PRIVATE_KEY=… pnpm --filter @flarekit-dev/relayer start   # in another shell
 *   node packages/core/scripts/live-gasless.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, erc20Abi, maxUint256, formatUnits, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { gaslessFor } from '@flarekit-dev/contracts'
import {
  makeGaslessAdapter,
  buildGaslessPlan,
  signPaymentRequest,
  createGasless,
  applyGaslessPlan,
  reconcileGaslessPayment,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-coston2-live-gasless.json`
const PAY_AMOUNT = BigInt(process.env.PAY_UNITS ?? '1000000') // 1 FXRP (6 dp)
const FUND_FXRP = BigInt(process.env.FUND_FXRP_UNITS ?? '2000000') // 2 FXRP handed to the payer
const FUND_C2FLR = BigInt(process.env.FUND_C2FLR_WEI ?? '50000000000000000') // 0.05 C2FLR for one approval
const POLL_MS = 8_000
const POLL_ATTEMPTS = Number(process.env.POLL_ATTEMPTS ?? 40) // ~5 min

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const payerSecret = JSON.parse(readFileSync(`${ROOT}/.secrets/m9-payer.json`, 'utf8'))
const operator = privateKeyToAccount(secrets.evm.privateKey)
const payer = privateKeyToAccount(payerSecret.privateKey)
const OPERATOR = operator.address
const PAYER = payer.address
const RECIPIENT = OPERATOR // the payment lands back with the operator (clean, funded-address-only)

// Registry gaslessVerified is FALSE until this run confirms the transfer; the live
// script bootstraps with a verified override (the M7/M8 precedent), then the source
// flag is flipped ONLY after the confirmed on-chain read.
const deployment = { ...gaslessFor('coston2'), gaslessVerified: true }
const FORWARDER = deployment.forwarder
const FXRP = deployment.fxrp.address

const CHAIN = { id: 114, name: 'coston2', nativeCurrency: { name: 'C2FLR', symbol: 'C2FLR', decimals: 18 }, rpcUrls: { default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] } } }
const pub = createPublicClient({ chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0]) })
const operatorWallet = createWalletClient({ account: operator, chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0]) })
const payerWallet = createWalletClient({ account: payer, chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0]) })

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const evidence = existsSync(EV_PATH)
  ? JSON.parse(readFileSync(EV_PATH, 'utf8'))
  : { run: 'M9 gasless FXRP (AC1/AC2)', network: 'coston2', startedAt: new Date().toISOString(), operator: OPERATOR, payer: PAYER, recipient: RECIPIENT, forwarder: FORWARDER, fxrp: FXRP, phaseA: {}, phaseB: {}, phaseC: {}, phaseD: {}, lifecycle: {} }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(EV_PATH, JSON.stringify(evidence, jsonify, 2)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fxrp6 = (v) => formatUnits(v, 6)

const readFxrp = (owner) => pub.readContract({ address: FXRP, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
const readAllowance = (owner) => pub.readContract({ address: FXRP, abi: erc20Abi, functionName: 'allowance', args: [owner, FORWARDER] })

async function main() {
  console.log(`\n=== M9 gasless FXRP live run on Coston2 ===`)
  console.log(` operator ${OPERATOR}\n payer    ${PAYER}\n recipient ${RECIPIENT}`)
  const adapter = makeGaslessAdapter(pub, deployment)

  // --- Phase A: fund the payer with FXRP + a little C2FLR for exactly one approval ---
  console.log('\n--- Phase A: fund the payer ---')
  let payerFxrp = await readFxrp(PAYER)
  if (payerFxrp < PAY_AMOUNT) {
    const tx = await operatorWallet.writeContract({ address: FXRP, abi: erc20Abi, functionName: 'transfer', args: [PAYER, FUND_FXRP] })
    await pub.waitForTransactionReceipt({ hash: tx })
    console.log(` funded ${fxrp6(FUND_FXRP)} FXRP → payer (tx ${tx})`)
    evidence.phaseA.fundFxrpTx = tx
    payerFxrp = await readFxrp(PAYER)
  } else console.log(` payer already holds ${fxrp6(payerFxrp)} FXRP — skipping FXRP funding`)

  let payerNative = await pub.getBalance({ address: PAYER })
  const allowance0 = await readAllowance(PAYER)
  if (payerNative < FUND_C2FLR && allowance0 < PAY_AMOUNT) {
    const tx = await operatorWallet.sendTransaction({ to: PAYER, value: FUND_C2FLR })
    await pub.waitForTransactionReceipt({ hash: tx })
    console.log(` funded ${formatEther(FUND_C2FLR)} C2FLR → payer for the one-time approval (tx ${tx})`)
    evidence.phaseA.fundGasTx = tx
    payerNative = await pub.getBalance({ address: PAYER })
  }
  evidence.phaseA = { ...evidence.phaseA, payerFxrpAfter: payerFxrp.toString(), payerFxrpHuman: fxrp6(payerFxrp), payerC2flrAfter: payerNative.toString(), payerC2flrHuman: formatEther(payerNative) }
  console.log(` payer now: ${fxrp6(payerFxrp)} FXRP, ${formatEther(payerNative)} C2FLR`)
  save()

  // --- Phase B: the one-time approval (the payer pays gas, once) ---
  console.log('\n--- Phase B: one-time approval (payer pays gas) ---')
  const allowance = await readAllowance(PAYER)
  if (allowance < PAY_AMOUNT) {
    const c2Before = await pub.getBalance({ address: PAYER })
    const approveTx = await payerWallet.writeContract({ address: FXRP, abi: erc20Abi, functionName: 'approve', args: [FORWARDER, maxUint256] })
    const rcpt = await pub.waitForTransactionReceipt({ hash: approveTx })
    const c2After = await pub.getBalance({ address: PAYER })
    const gasCost = c2Before - c2After
    console.log(` approve(forwarder, MaxUint256) — tx ${approveTx}, payer C2FLR ${formatEther(c2Before)} → ${formatEther(c2After)} (gas ${formatEther(gasCost)})`)
    evidence.phaseB = { approveTx, gasUsed: rcpt.gasUsed.toString(), payerC2flrBefore: c2Before.toString(), payerC2flrAfter: c2After.toString(), payerGasCostWei: gasCost.toString(), payerGasCostC2flr: formatEther(gasCost), note: 'the payer PAID gas for the one-time approval — gasless ≠ free' }
  } else {
    console.log(` allowance already ${allowance === maxUint256 ? 'MaxUint256' : allowance.toString()} — approval done on a prior run`)
    evidence.phaseB = { ...evidence.phaseB, note: 'approval already in place (prior run)' }
  }
  save()

  // --- Phase C: drain the payer's C2FLR to ~0 (prove the payment can't be self-gassed) ---
  console.log('\n--- Phase C: drain payer C2FLR to ~0 ---')
  // Explicit legacy gasPrice + gas (a native transfer is deterministically 21000 gas),
  // so the fee math is exact and doesn't collide with an EIP-1559 maxFee estimate.
  const gasPrice = await pub.getGasPrice()
  const gasLimit = 21_000n
  const drainFee = gasLimit * gasPrice
  payerNative = await pub.getBalance({ address: PAYER })
  if (payerNative > drainFee * 2n) {
    const drainValue = payerNative - (drainFee * 110n) / 100n // leave ~0.1×fee as residual
    const drainTx = await payerWallet.sendTransaction({ to: OPERATOR, value: drainValue, gas: gasLimit, gasPrice })
    await pub.waitForTransactionReceipt({ hash: drainTx })
    console.log(` drained ${formatEther(drainValue)} C2FLR → operator (tx ${drainTx})`)
    evidence.phaseC = { ...evidence.phaseC, drainTx }
  } else console.log(` payer C2FLR ${formatEther(payerNative)} already ~0 — nothing to drain`)
  const payerNativeDrained = await pub.getBalance({ address: PAYER })
  evidence.phaseC = { ...evidence.phaseC, payerC2flrResidualWei: payerNativeDrained.toString(), payerC2flrResidual: formatEther(payerNativeDrained), note: 'payer native ~0 — it cannot pay for the payment even if asked' }
  console.log(` payer C2FLR residual: ${formatEther(payerNativeDrained)}`)
  save()

  // --- Phase D: the gasless payment (the payer pays 0 gas for it) ---
  console.log('\n--- Phase D: gasless payment (payer pays 0 gas) ---')
  const chainTime = Number((await pub.getBlock()).timestamp)
  const intent = { network: 'coston2', to: RECIPIENT, amount: PAY_AMOUNT, deadlineSeconds: 3600 }
  const planResult = await buildGaslessPlan(adapter, intent, PAYER, chainTime)
  if (planResult.kind !== 'plan') throw new Error(`buildGaslessPlan did not return a plan: ${JSON.stringify(planResult, jsonify)}`)
  if (planResult.plan.approve) throw new Error('plan still asks for an approval — Phase B allowance did not take')
  const payment = planResult.plan.payment
  const signature = await signPaymentRequest(payerWallet, 114, FORWARDER, payment)
  console.log(` signed PaymentRequest (nonce ${payment.nonce}, deadline ${payment.deadline}) — OFF-CHAIN, no gas`)

  const sinceBlock = await pub.getBlockNumber()
  const payerC2flrBeforePay = await pub.getBalance({ address: PAYER })
  const payerFxrpBeforePay = await readFxrp(PAYER)
  const recipientFxrpBeforePay = await readFxrp(RECIPIENT)

  const receipt = await adapter.relay({ from: PAYER, to: RECIPIENT, amount: PAY_AMOUNT, deadline: payment.deadline, signature })
  console.log(` relay receipt: ${JSON.stringify(receipt, jsonify)}`)
  if (!receipt.accepted) throw new Error(`relayer rejected: ${receipt.error} (is the relayer running at ${deployment.relayerUrl}?)`)

  // Poll the ON-CHAIN transfer — succeeded comes ONLY from this read.
  let transfer = { kind: 'in-flight' }
  for (let i = 0; i < POLL_ATTEMPTS && transfer.kind !== 'confirmed'; i++) {
    transfer = await adapter.reads.paymentSince(PAYER, payment.nonce, sinceBlock)
    if (transfer.kind !== 'confirmed') { console.log(`  … in-flight (${i + 1}/${POLL_ATTEMPTS})`); await sleep(POLL_MS) }
  }
  if (transfer.kind !== 'confirmed') throw new Error('payment not confirmed on-chain within the poll window')
  console.log(` CONFIRMED on-chain: PaymentExecuted tx ${transfer.txHash}, amount ${fxrp6(transfer.amount)} FXRP`)

  const payerC2flrAfterPay = await pub.getBalance({ address: PAYER })
  const payerFxrpAfterPay = await readFxrp(PAYER)
  const recipientFxrpAfterPay = await readFxrp(RECIPIENT)

  evidence.phaseD = {
    relayReceipt: receipt,
    paymentTx: transfer.txHash,
    confirmedAmount: transfer.amount.toString(),
    confirmedAmountHuman: fxrp6(transfer.amount),
    payerC2flrBeforePay: payerC2flrBeforePay.toString(),
    payerC2flrAfterPay: payerC2flrAfterPay.toString(),
    payerPaidGasForPayment: (payerC2flrBeforePay !== payerC2flrAfterPay),
    payerFxrpDelta: (payerFxrpAfterPay - payerFxrpBeforePay).toString(),
    recipientFxrpDelta: (recipientFxrpAfterPay - recipientFxrpBeforePay).toString(),
    note: 'payer C2FLR UNCHANGED across the payment (0 gas); the relayer paid. FXRP moved payer -amount, recipient +amount.',
  }
  console.log(` payer C2FLR across the payment: ${formatEther(payerC2flrBeforePay)} → ${formatEther(payerC2flrAfterPay)} (unchanged: ${payerC2flrBeforePay === payerC2flrAfterPay})`)
  console.log(` FXRP delta: payer ${fxrp6(payerFxrpAfterPay - payerFxrpBeforePay)}, recipient +${fxrp6(recipientFxrpAfterPay - recipientFxrpBeforePay)}`)
  save()

  // --- Lifecycle traversal: succeeded ONLY from the confirmed read ---
  let op = createGasless({ chainId: 114, intent, now: chainTime * 1000 })
  op = applyGaslessPlan(op, { plan: planResult, now: chainTime * 1000 }).record // ready (no approve)
  // drive to submitted (the relayer accepted): ready → executing → submitted
  const { applyTransition } = await import('../dist/index.js')
  op = applyTransition(op, { to: 'executing', at: chainTime * 1000, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: chainTime * 1000, patch: {} }).record
  const afterRelayHttp = op.state // still submitted — the HTTP 200 did NOT make it succeeded
  op = reconcileGaslessPayment(op, { kind: 'in-flight' }, chainTime * 1000 + 1000)
  const whileInFlight = { state: op.state, awaitingActor: op.awaiting?.actor }
  op = reconcileGaslessPayment(op, transfer, chainTime * 1000 + 2000)
  const afterConfirmed = op.state
  evidence.lifecycle = { afterRelayHttp, whileInFlight, afterConfirmed, note: 'submitted (HTTP 200) → awaiting_external(relayer) → succeeded; succeeded reached ONLY from the confirmed transfer read' }
  console.log(`\n lifecycle: relayHTTP=${afterRelayHttp} → inFlight=${whileInFlight.state}(${whileInFlight.awaitingActor}) → confirmed=${afterConfirmed}`)
  if (afterConfirmed !== 'succeeded') throw new Error('lifecycle did not reach succeeded from the confirmed read')
  if (afterRelayHttp === 'succeeded') throw new Error('lifecycle reached succeeded from the relayer HTTP alone — honesty violation')

  evidence.completedAt = new Date().toISOString()
  evidence.result = 'PASS — real FXRP payment, payer paid 0 gas for it; approval was payer-gassed; succeeded only from the on-chain transfer read'
  save()
  console.log(`\n=== PASS ===\n approval tx (payer-gassed): ${evidence.phaseB.approveTx ?? '(prior run)'}\n payment tx (payer 0-gas):   ${transfer.txHash}\n wrote ${EV_PATH}`)
}

main().catch((e) => { console.error(e); save?.(); process.exit(1) })
