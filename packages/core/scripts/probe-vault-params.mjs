// packages/core/scripts/probe-vault-params.mjs
// Read-only: capture the exact vault parameters the MOCK must reproduce, and
// confirm they reproduce the Phase A pairs (991577 shares / 497500 instant /
// 498759 delayed / 3000 firelight). No key, no writes.
import { createPublicClient, http } from 'viem'
import { chainFor, vaultByKey } from '@flare-kit/contracts'
import { vaultAbiFor } from '../dist/index.js'

const CHAIN_ID = 114
const chain = chainFor(CHAIN_ID)
const viemChain = { id: CHAIN_ID, name: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: { default: { http: [chain.rpcUrl] } } }
const client = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const read = (cfg, fn, args = []) => client.readContract({ address: cfg.address, abi: vaultAbiFor(cfg.protocol), functionName: fn, args }).catch((e) => `ERR:${(e.shortMessage || e.message || '').slice(0, 60)}`)

const fl = vaultByKey('coston2', 'firelight-fxrp')
const up = vaultByKey('coston2', 'upshift-fxrp')

const block = await client.getBlockNumber()
console.log('block', bn(block))

console.log('\n=== FIRELIGHT (self-share stFXRP) ===')
for (const [label, fn, args] of [
  ['rate convertToAssets(1e6)', 'convertToAssets', [1_000_000n]],
  ['previewDeposit(3000)', 'previewDeposit', [3_000n]],
  ['previewRedeem(3000)', 'previewRedeem', [3_000n]],
  ['maxDeposit(owner)', 'maxDeposit', ['0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9']],
  ['depositLimit', 'depositLimit', []],
  ['totalAssets', 'totalAssets', []],
  ['totalSupply', 'totalSupply', []],
  ['currentPeriod', 'currentPeriod', []],
  ['currentPeriodEnd', 'currentPeriodEnd', []],
  ['nextPeriodEnd', 'nextPeriodEnd', []],
]) {
  console.log(` ${label}:`, bn(await read(fl, fn, args)))
}

console.log('\n=== UPSHIFT (separate LP vFXRP) ===')
for (const [label, fn, args] of [
  ['previewDeposit(asset,1e6) -> [shares, assetsAfterFee]', 'previewDeposit', [up.asset.address, 1_000_000n]],
  ['previewRedemption(495788, instant=true) -> [gross, net]', 'previewRedemption', [495_788n, true]],
  ['previewRedemption(495789, instant=false) -> [gross, net]', 'previewRedemption', [495_789n, false]],
  ['rate previewRedemption(1e6, false) -> [gross, net]', 'previewRedemption', [1_000_000n, false]],
  ['convertToShares(1e6)', 'convertToShares', [1_000_000n]],
  ['convertToAssets(1e6)', 'convertToAssets', [1_000_000n]],
  ['instantRedemptionFee', 'instantRedemptionFee', []],
  ['withdrawalFee', 'withdrawalFee', []],
  ['maxWithdrawalAmount', 'maxWithdrawalAmount', []],
  ['withdrawalsPaused', 'withdrawalsPaused', []],
  ['lagDuration', 'lagDuration', []],
  ['getWithdrawalEpoch -> [y,m,d,epoch]', 'getWithdrawalEpoch', []],
  ['totalSupply', 'totalSupply', []],
  ['totalAssets', 'totalAssets', []],
]) {
  console.log(` ${label}:`, bn(await read(up, fn, args)))
}
