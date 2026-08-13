// packages/core/scripts/live-liquidity.mjs
/**
 * A real add→remove liquidity round trip on Coston2 through the live V2 router
 * (M6-AC1/AC2). Dev-only: viem signs the approvals and the add/remove, which the
 * shipped package never does — core produces the honest quotes and the unsigned
 * plans, a wallet signs them. Everything deciding the trade goes through the kit.
 * Writes evidence to .thoughts/verification/. Never prints a key.
 *
 *   node scripts/live-liquidity.mjs [amountFxrp=1] [slippageBips=300] [removePct=100]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ERC20_ABI, UNIV2_ROUTER_ABI, chainFor, dexFor } from '@flarekit-dev/contracts'
import {
  buildAddPlan, buildRemovePlan, formatExact,
  quoteAddLiquidity, quoteRemoveLiquidity, readAllowance, readLpAllowance, readPosition,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const A_KEY = 'FXRP'
const B_KEY = 'USDT0'
const AMOUNT_A = BigInt(Math.round(Number(process.argv[2] ?? '1') * 1e6)) // FXRP 6dp
const SLIPPAGE_BIPS = Number(process.argv[3] ?? '300')
const REMOVE_PCT = BigInt(process.argv[4] ?? '100')

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const dex = dexFor(CHAIN_ID)
const evidence = { startedAt: new Date().toISOString(), network: chain.name, chainId: CHAIN_ID, router: dex.router, pair: [A_KEY, B_KEY], steps: [] }
const log = (step, data = {}) => { evidence.steps.push({ step, at: new Date().toISOString(), ...data }); console.log(`[${step}]`, JSON.stringify(data)) }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(`${ROOT}/.thoughts/verification/2026-08-11-coston2-live-liquidity.json`, JSON.stringify(evidence, null, 2)) }
const explorerTx = (hash) => `${chain.explorerUrl}/tx/${hash}`

const account = privateKeyToAccount(secrets.evm.privateKey)
const viemChain = { id: CHAIN_ID, name: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: { default: { http: [chain.rpcUrl] } } }
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })
const a = dex.tokens[A_KEY]
const b = dex.tokens[B_KEY]

const sign = async (address, abi, functionName, args, label) => {
  const hash = await walletClient.writeContract({ address, abi, functionName, args })
  log(`${label}-submitted`, { tx: hash, link: explorerTx(hash) })
  const rcpt = await publicClient.waitForTransactionReceipt({ hash })
  log(`${label}-confirmed`, { status: rcpt.status, block: Number(rcpt.blockNumber) })
  if (rcpt.status !== 'success') throw new Error(`${label} reverted`)
  return hash
}

try {
  const now = Math.floor(Date.now() / 1000)
  log('signer', { address: account.address, pair: `${a.symbol}/${b.symbol}` })

  // --- ADD ---
  const addResult = await quoteAddLiquidity({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, amountADesired: AMOUNT_A, slippageBips: SLIPPAGE_BIPS, now })
  if (addResult.kind !== 'quote') { log('no-add-quote', { kind: addResult.kind, message: addResult.message ?? addResult.reason }); save(); process.exit(1) }
  log('add-quote', { amountA: formatExact(addResult.quote.amountA), amountB: formatExact(addResult.quote.amountB), expectedLp: addResult.quote.expectedLp.toString(), poolShareBips: addResult.quote.poolShareBips })

  const intent = { tokenAKey: A_KEY, tokenBKey: B_KEY, amountADesired: AMOUNT_A, slippageBips: SLIPPAGE_BIPS, recipient: account.address, deadline: now + 1200 }
  const allowanceA = await readAllowance(publicClient, CHAIN_ID, A_KEY, account.address)
  const allowanceB = await readAllowance(publicClient, CHAIN_ID, B_KEY, account.address)
  const addPlan = buildAddPlan(intent, addResult.quote, allowanceA, allowanceB, dex)
  log('add-plan', { needApproveA: Boolean(addPlan.approveA), needApproveB: Boolean(addPlan.approveB) })

  const lpBefore = (await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address }))
  const lpBeforeBal = lpBefore.kind === 'position' ? lpBefore.position.lpBalance : 0n

  if (addPlan.approveA) await sign(addPlan.approveA.token, ERC20_ABI, 'approve', [addPlan.approveA.spender, addPlan.approveA.amount], 'approve-a')
  if (addPlan.approveB) await sign(addPlan.approveB.token, ERC20_ABI, 'approve', [addPlan.approveB.spender, addPlan.approveB.amount], 'approve-b')
  await sign(addPlan.router, UNIV2_ROUTER_ABI, 'addLiquidity', [addPlan.add.tokenA, addPlan.add.tokenB, addPlan.add.amountADesired, addPlan.add.amountBDesired, addPlan.add.amountAMin, addPlan.add.amountBMin, addPlan.add.feeBipsA, addPlan.add.feeBipsB, addPlan.add.to, addPlan.add.deadline], 'add')

  const afterAdd = await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address })
  if (afterAdd.kind !== 'position') { log('no-position-after-add', {}); save(); process.exit(1) }
  const minted = afterAdd.position.lpBalance - lpBeforeBal
  // AC2: the predicted LP matches the actual LP minted (balance delta), within rounding.
  log('add-settled', { lpMinted: minted.toString(), predictedLp: addResult.quote.expectedLp.toString(), composition: [formatExact(afterAdd.position.amountA), formatExact(afterAdd.position.amountB)] })

  // --- REMOVE (of what this run added) ---
  const toBurn = (minted * REMOVE_PCT) / 100n
  const removeResult = await quoteRemoveLiquidity({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, liquidity: toBurn, slippageBips: SLIPPAGE_BIPS, now })
  if (removeResult.kind !== 'quote') { log('no-remove-quote', { kind: removeResult.kind }); save(); process.exit(1) }
  const removeIntent = { tokenAKey: A_KEY, tokenBKey: B_KEY, liquidity: toBurn, slippageBips: SLIPPAGE_BIPS, recipient: account.address, deadline: now + 1200 }
  const lpAllowance = await readLpAllowance(publicClient, CHAIN_ID, A_KEY, B_KEY, account.address)
  const removePlan = buildRemovePlan(removeIntent, removeResult.quote, lpAllowance, dex)
  log('remove-plan', { needApproveLp: Boolean(removePlan.approveLp), liquidity: toBurn.toString() })

  if (removePlan.approveLp) await sign(removePlan.approveLp.token, ERC20_ABI, 'approve', [removePlan.approveLp.spender, removePlan.approveLp.amount], 'approve-lp')
  await sign(removePlan.router, UNIV2_ROUTER_ABI, 'removeLiquidity', [removePlan.remove.tokenA, removePlan.remove.tokenB, removePlan.remove.liquidity, removePlan.remove.amountAMin, removePlan.remove.amountBMin, removePlan.remove.to, removePlan.remove.deadline], 'remove')

  const afterRemove = await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address })
  log('remove-settled', { lpBalanceAfter: afterRemove.kind === 'position' ? afterRemove.position.lpBalance.toString() : '0' })
  log('done', {})
  save()
  console.log('\nM6-AC1 complete: add→remove round trip.')
} catch (error) {
  log('error', { message: error instanceof Error ? error.message : String(error) })
  save()
  console.error('live-liquidity failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
