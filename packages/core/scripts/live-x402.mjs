// packages/core/scripts/live-x402.mjs
/**
 * The real x402 loop on Coston2 (M9-AC3). Dev-only: viem signs the EIP-3009
 * authorization, which the shipped package never does — core parses the 402, produces
 * the signature and the X-Payment header, the server settles via the facilitator and
 * pays the gas. Everything deciding the flow goes through the kit.
 *
 * The whole point: SETTLEMENT (the facilitator transaction) and the RESOURCE (HTTP 200
 * + body) are recorded as TWO INDEPENDENT facts; the asset is MockUSDT0, labelled a demo
 * token throughout. `succeeded` is reached only from the observed settlement + delivery.
 *
 * Requires the x402 server running (operator key) at the registry serverUrl:
 *   X402_PRIVATE_KEY=… pnpm --filter @flare-kit/x402-server start   # in another shell
 *   node packages/core/scripts/live-x402.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createPublicClient, createWalletClient, http, erc20Abi, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { x402For } from '@flare-kit/contracts'
import {
  eip3009Domain,
  signAuthorization,
  parseChallenge,
  encodeXPayment,
  readXPaymentResponse,
  createX402,
  applyX402Challenge,
  reconcileX402,
  applyTransition,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-coston2-live-x402.json`

const payerSecret = JSON.parse(readFileSync(`${ROOT}/.secrets/m9-payer.json`, 'utf8'))
const payer = privateKeyToAccount(payerSecret.privateKey)
const PAYER = payer.address

// Registry x402Verified is FALSE until this run confirms the settlement; the live script
// bootstraps with a verified override, then flips the source flag ONLY after the read.
const deployment = { ...x402For('coston2'), x402Verified: true }
const TOKEN = deployment.token.address
const SERVER = deployment.serverUrl
const RESOURCE = deployment.resourcePath
const DOMAIN = eip3009Domain(deployment.token.eip712Name, deployment.token.eip712Version, 114, TOKEN)

const CHAIN = { id: 114, name: 'coston2', nativeCurrency: { name: 'C2FLR', symbol: 'C2FLR', decimals: 18 }, rpcUrls: { default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] } } }
const pub = createPublicClient({ chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0]) })
const payerWallet = createWalletClient({ account: payer, chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0]) })

const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const evidence = existsSync(EV_PATH) ? JSON.parse(readFileSync(EV_PATH, 'utf8')) : { run: 'M9 x402 (AC3)', network: 'coston2', startedAt: new Date().toISOString(), payer: PAYER, token: TOKEN, tokenLabel: `${deployment.token.symbol} (demo)`, facilitator: deployment.facilitator }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(EV_PATH, JSON.stringify(evidence, jsonify, 2)) }
const readToken = (owner) => pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
const u6 = (v) => formatUnits(v, 6)

async function main() {
  console.log(`\n=== M9 x402 live run on Coston2 ===\n payer ${PAYER}\n server ${SERVER}${RESOURCE}\n token ${TOKEN} (${deployment.token.symbol}, demo)`)

  // --- 1) GET the resource → 402 challenge ---
  const receivedAt = Date.now()
  const res402 = await fetch(`${SERVER}${RESOURCE}`)
  if (res402.status !== 402) throw new Error(`expected 402, got ${res402.status} (is the x402 server running at ${SERVER}?)`)
  const challenge = parseChallenge(await res402.json(), receivedAt)
  console.log(`\n 402 received: pay ${u6(challenge.maxAmountRequired)} ${deployment.token.symbol} (demo=${challenge.demoToken}) to ${challenge.payTo}`)
  if (!challenge.demoToken) throw new Error('challenge.demoToken is false — the asset must be the labelled demo token')
  evidence.challenge = { asset: challenge.asset, demoToken: challenge.demoToken, maxAmountRequired: challenge.maxAmountRequired.toString(), payTo: challenge.payTo, facilitator: challenge.facilitator, expiresAt: challenge.expiresAt }
  save()

  const payerBefore = await readToken(PAYER)
  const payeeBefore = await readToken(challenge.payTo)

  // --- 2) sign the EIP-3009 authorization (off-chain, no gas) ---
  const nowSec = Math.floor(Date.now() / 1000)
  const nonce = `0x${randomBytes(32).toString('hex')}`
  const auth = { from: PAYER, to: challenge.payTo, value: challenge.maxAmountRequired, validAfter: BigInt(nowSec - 60), validBefore: BigInt(nowSec + challenge.maxTimeoutSeconds), nonce }
  const sig = await signAuthorization(payerWallet, DOMAIN, auth)
  const header = encodeXPayment(auth, sig, challenge.token)
  console.log(` signed EIP-3009 authorization (nonce ${nonce.slice(0, 12)}…) — OFF-CHAIN, payer pays 0 gas`)

  // --- 3) re-request with X-Payment → the server settles + delivers ---
  const resOk = await fetch(`${SERVER}${RESOURCE}`, { headers: { 'X-Payment': header } })
  const resourceBody = await resOk.json()
  const xprHeader = resOk.headers.get('X-Payment-Response')
  if (resOk.status !== 200) throw new Error(`settle/resource failed: HTTP ${resOk.status} ${JSON.stringify(resourceBody)}`)
  const settlement = xprHeader ? readXPaymentResponse(xprHeader) : null
  if (!settlement) throw new Error('no X-Payment-Response settlement header')
  console.log(`\n SETTLEMENT (fact 1): tx ${settlement.txHash}, paymentId ${settlement.paymentId}`)
  console.log(` RESOURCE   (fact 2): HTTP ${resOk.status}, body ${JSON.stringify(resourceBody).slice(0, 100)}`)

  // --- 4) confirm the settlement ON-CHAIN (two independent facts, both verified) ---
  const receipt = await pub.getTransactionReceipt({ hash: settlement.txHash })
  const payerAfter = await readToken(PAYER)
  const payeeAfter = await readToken(challenge.payTo)
  console.log(` on-chain: settle tx status ${receipt.status}; token ${deployment.token.symbol} payer ${u6(payerAfter - payerBefore)}, payee +${u6(payeeAfter - payeeBefore)}`)
  if (receipt.status !== 'success') throw new Error(`settlement tx status ${receipt.status}`)

  evidence.settlement = { txHash: settlement.txHash, paymentId: settlement.paymentId, txStatus: receipt.status, tokenPayerDelta: (payerAfter - payerBefore).toString(), tokenPayeeDelta: (payeeAfter - payeeBefore).toString() }
  evidence.resource = { httpStatus: resOk.status, body: resourceBody, note: 'settlement (fact 1) and resource (fact 2) are independent — recorded separately' }
  save()

  // --- 5) lifecycle: succeeded ONLY from settled + delivered ---
  let op = createX402({ chainId: 114, intent: { network: 'coston2', resource: RESOURCE }, now: receivedAt })
  op = applyX402Challenge(op, { plan: { challenge, authorization: auth }, now: receivedAt }).record
  op = applyTransition(op, { to: 'executing', at: receivedAt, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: receivedAt, patch: {} }).record
  const afterSubmit = op.state
  // pending settlement → awaiting_external(provider)
  op = reconcileX402(op, { kind: 'pending' }, { kind: 'undelivered' }, receivedAt + 1000)
  const whileSettling = { state: op.state, actor: op.awaiting?.actor }
  // settled + delivered → succeeded
  op = reconcileX402(op, { kind: 'settled', txHash: settlement.txHash, paymentId: settlement.paymentId }, { kind: 'delivered', body: resourceBody }, receivedAt + 2000)
  const afterConfirmed = op.state
  evidence.lifecycle = { afterSubmit, whileSettling, afterConfirmed, note: 'submitted → awaiting_external(provider) → succeeded; succeeded only from settled + delivered. partially_succeeded (settled + resource failed) is unit-tested (x402-states.test.ts) — the fixture delivers atomically, so it is not live-reproducible here.' }
  console.log(`\n lifecycle: submit=${afterSubmit} → settling=${whileSettling.state}(${whileSettling.actor}) → confirmed=${afterConfirmed}`)
  if (afterConfirmed !== 'succeeded') throw new Error('lifecycle did not reach succeeded from settled + delivered')
  if (afterSubmit === 'succeeded') throw new Error('lifecycle reached succeeded from submit alone — honesty violation')

  evidence.completedAt = new Date().toISOString()
  evidence.result = 'PASS — real facilitator settlement + resource delivery, recorded as two independent facts; asset is the demo token throughout; succeeded only from settled + delivered'
  save()
  console.log(`\n=== PASS ===\n settlement tx: ${settlement.txHash}\n paymentId:     ${settlement.paymentId}\n wrote ${EV_PATH}`)
}

main().catch((e) => { console.error(e); save?.(); process.exit(1) })
