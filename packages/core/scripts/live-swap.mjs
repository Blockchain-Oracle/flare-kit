/**
 * A real token swap on Coston2 through the live V2 router (M5-AC1).
 *
 * Dev-only tooling. It uses viem to sign the approve and swap, which the shipped
 * package never does — core produces the honest quote and the unsigned plan, a
 * wallet signs it. Everything deciding the trade goes through the real kit:
 * `quoteSwap` (getAmountsOut, never a formula), `readAllowance` and
 * `buildSwapPlan` (an approve step only when the allowance is short).
 *
 * Writes evidence to .thoughts/verification/. Never prints a key.
 *
 *   node scripts/live-swap.mjs [amountFxrp=1] [slippageBips=300]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  ERC20_ABI,
  UNIV2_ROUTER_ABI,
  chainFor,
  dexFor,
} from '@flare-kit/contracts'
import {
  buildSwapPlan,
  formatExact,
  priceImpactBips,
  quoteSwap,
  readAllowance,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const FROM_KEY = 'FXRP'
const TO_KEY = 'USDT0'
const AMOUNT = BigInt(Math.round(Number(process.argv[2] ?? '1') * 1e6)) // FXRP has 6 dp
const SLIPPAGE_BIPS = Number(process.argv[3] ?? '300')

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const dex = dexFor(CHAIN_ID)
const evidence = {
  startedAt: new Date().toISOString(),
  network: chain.name,
  chainId: CHAIN_ID,
  router: dex.router,
  pair: [FROM_KEY, TO_KEY],
  steps: [],
}
const log = (step, data = {}) => {
  evidence.steps.push({ step, at: new Date().toISOString(), ...data })
  console.log(`[${step}]`, JSON.stringify(data))
}
const save = () => {
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(
    `${ROOT}/.thoughts/verification/2026-08-09-coston2-live-swap.json`,
    JSON.stringify(evidence, null, 2),
  )
}
const explorerTx = (hash) => `${chain.explorerUrl}/tx/${hash}`

const account = privateKeyToAccount(secrets.evm.privateKey)
const viemChain = {
  id: CHAIN_ID,
  name: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: { default: { http: [chain.rpcUrl] } },
}
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })

const from = dex.tokens[FROM_KEY]
const to = dex.tokens[TO_KEY]
const balanceOf = (token, owner) =>
  publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })

try {
  const now = Math.floor(Date.now() / 1000)
  log('signer', { address: account.address, from: from.symbol, to: to.symbol })

  const balBeforeFrom = await balanceOf(from.address, account.address)
  const balBeforeTo = await balanceOf(to.address, account.address)
  log('balances-before', {
    [from.symbol]: formatExact({ value: balBeforeFrom, decimals: from.decimals, asset: from.symbol }),
    [to.symbol]: formatExact({ value: balBeforeTo, decimals: to.decimals, asset: to.symbol }),
  })

  // 1 — the honest quote, from the router's own getAmountsOut, and the price
  // impact from a small reference probe (never a reserves formula).
  const result = await quoteSwap({
    reader: publicClient,
    chainId: CHAIN_ID,
    fromKey: FROM_KEY,
    toKey: TO_KEY,
    amountIn: AMOUNT,
    slippageBips: SLIPPAGE_BIPS,
    now,
  })
  if (result.kind !== 'quote') {
    log('no-quote', { kind: result.kind, message: result.message ?? result.reason })
    save()
    process.exit(1)
  }
  const reference = await quoteSwap({
    reader: publicClient,
    chainId: CHAIN_ID,
    fromKey: FROM_KEY,
    toKey: TO_KEY,
    amountIn: AMOUNT / 1000n > 0n ? AMOUNT / 1000n : 1n,
    slippageBips: SLIPPAGE_BIPS,
    now,
  })
  const impact = reference.kind === 'quote' ? priceImpactBips(result.quote, reference.quote) : null
  log('quote', {
    amountIn: formatExact(result.quote.amountIn),
    amountOut: formatExact(result.quote.amountOut),
    minReceived: formatExact(result.quote.minReceived),
    slippageBips: SLIPPAGE_BIPS,
    priceImpactBips: impact,
  })

  // 2 — the unsigned plan. An approve step appears only if the allowance is short.
  const allowance = await readAllowance(publicClient, CHAIN_ID, FROM_KEY, account.address)
  const plan = buildSwapPlan(
    { fromKey: FROM_KEY, toKey: TO_KEY, amountIn: AMOUNT, slippageBips: SLIPPAGE_BIPS, recipient: account.address, deadline: now + 1200 },
    result.quote,
    allowance,
    dex,
  )
  log('plan', { allowance: allowance.toString(), needsApprove: Boolean(plan.approve), router: plan.router })

  // 3 — approve, only when the plan says so, as its own transaction.
  if (plan.approve) {
    const approveHash = await walletClient.writeContract({
      address: plan.approve.token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [plan.approve.spender, plan.approve.amount],
    })
    log('approve-submitted', { tx: approveHash, link: explorerTx(approveHash) })
    const approveRcpt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
    log('approve-confirmed', { status: approveRcpt.status, block: Number(approveRcpt.blockNumber) })
    if (approveRcpt.status !== 'success') throw new Error('approve reverted')
  }

  // 4 — the swap, with amountOutMin enforced on chain by the router itself.
  const swapHash = await walletClient.writeContract({
    address: plan.router,
    abi: UNIV2_ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [plan.swap.amountIn, plan.swap.amountOutMin, plan.swap.path, plan.swap.to, plan.swap.deadline],
  })
  log('swap-submitted', { tx: swapHash, link: explorerTx(swapHash) })
  const swapRcpt = await publicClient.waitForTransactionReceipt({ hash: swapHash })
  log('swap-confirmed', { status: swapRcpt.status, block: Number(swapRcpt.blockNumber) })
  if (swapRcpt.status !== 'success') throw new Error('swap reverted (amountOutMin not met — slippage exceeded)')

  const balAfterFrom = await balanceOf(from.address, account.address)
  const balAfterTo = await balanceOf(to.address, account.address)
  const received = balAfterTo - balBeforeTo
  log('balances-after', {
    [from.symbol]: formatExact({ value: balAfterFrom, decimals: from.decimals, asset: from.symbol }),
    [to.symbol]: formatExact({ value: balAfterTo, decimals: to.decimals, asset: to.symbol }),
    receivedActual: formatExact({ value: received, decimals: to.decimals, asset: to.symbol }),
    metMinimum: received >= plan.swap.amountOutMin,
  })
  log('done', { swapTx: swapHash, link: explorerTx(swapHash) })
  save()
  console.log('\nAC1 complete.')
} catch (error) {
  log('error', { message: error instanceof Error ? error.message : String(error) })
  save()
  console.error('live-swap failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
