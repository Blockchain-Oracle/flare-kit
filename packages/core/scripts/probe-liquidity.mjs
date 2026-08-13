// packages/core/scripts/probe-liquidity.mjs
/**
 * Read-only probe of the FXRP/USD₮0 pool on Coston2 (M6, real-first). No key.
 * Prints reserves, token0 and LP totalSupply so the quote tests and the mock
 * carry measured numbers, never invented ones.
 *
 *   node scripts/probe-liquidity.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { UNIV2_FACTORY_ABI, UNIV2_PAIR_ABI, ERC20_ABI, chainFor, dexFor } from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const chain = chainFor(CHAIN_ID)
const dex = dexFor(CHAIN_ID)
const client = createPublicClient({ transport: http(chain.rpcUrl) })

const a = dex.tokens.FXRP.address
const b = dex.tokens.USDT0.address
const pair = await client.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a, b] })
const [reserve0, reserve1] = await client.readContract({ address: pair, abi: UNIV2_PAIR_ABI, functionName: 'getReserves' })
const token0 = await client.readContract({ address: pair, abi: UNIV2_PAIR_ABI, functionName: 'token0' })
const totalSupply = await client.readContract({ address: pair, abi: ERC20_ABI, functionName: 'totalSupply' })

const probe = {
  at: new Date().toISOString(),
  pair,
  token0,
  reserve0: reserve0.toString(),
  reserve1: reserve1.toString(),
  totalSupply: totalSupply.toString(),
  fxrp: a,
  usdt0: b,
}
console.log(JSON.stringify(probe, null, 2))
mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
writeFileSync(`${ROOT}/.thoughts/verification/2026-08-11-m6-probe.json`, JSON.stringify(probe, null, 2))
