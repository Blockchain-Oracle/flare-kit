// packages/core/scripts/probe-bridge.mjs
// M8 Task 1 — read-only probe (no key, no writes). Confirms the LayerZero V2 OFT
// route Coston2 -> Sepolia is wired and quotable, learns the dust behaviour, and
// re-reads funding on both chains + XRPL. Assumes nothing is live until read; if a
// peer is unset or a balance is short it lands in `blockers[]` for Abu to action.
//
//   node packages/core/scripts/probe-bridge.mjs
//
// Everything here is later formalised into @flarekit-dev/contracts (Task 2); the probe
// inlines the addresses/EIDs/ABI it is verifying, on purpose — it is the thing that
// verifies them before they become the registry's source of truth.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, erc20Abi, pad, numberToHex, getAddress } from 'viem'
import { chainFor } from '@flarekit-dev/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-11-m8-bridge-probe.json`

// --- probe-verified constants (the values this run exists to confirm) ---
const COSTON2_OFT_ADAPTER = '0xCd3d2127935Ae82Af54Fc31cCD9D3440dbF46639'
const FTESTXRP = '0x0b6A3645c240605887a5532109323A3E12273dc7'
const SEPOLIA_FXRP_OFT = '0x81672c5d42f3573ad95a0bdfbe824faac547d4e6'
const COSTON2_COMPOSER = '0xa10569DFb38FE7Be211aCe4E4A566Cea387023b0'
const COSTON2_EID = 40294 // EndpointId.FLARE_V2_TESTNET
const SEPOLIA_EID = 40161 // EndpointId.SEPOLIA_V2_TESTNET
const EXECUTOR_GAS = 200_000 // lzReceive gas for a plain bridge send
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const SEPOLIA_CHAIN_ID = 11155111
const ONE_FXRP = 1_000_000n // 6 dp

// The signer whose funding gates the live run (public address; no key read here).
const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const OWNER = getAddress(secrets.evm.address)
const XRPL_ADDRESS = secrets.xrpl?.address ?? null

// --- minimal OFT ABI (the fragments Task 2 will home in bridge-abis.ts) ---
const OFT_ABI = [
  { type: 'function', stateMutability: 'view', name: 'token', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', stateMutability: 'view', name: 'peers', inputs: [{ name: 'eid', type: 'uint32' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', stateMutability: 'view', name: 'sharedDecimals', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', stateMutability: 'view', name: 'decimalConversionRate', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', stateMutability: 'view', name: 'symbol', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function', stateMutability: 'view', name: 'quoteSend',
    inputs: [
      { name: 'sendParam', type: 'tuple', components: [
        { name: 'dstEid', type: 'uint32' }, { name: 'to', type: 'bytes32' },
        { name: 'amountLD', type: 'uint256' }, { name: 'minAmountLD', type: 'uint256' },
        { name: 'extraOptions', type: 'bytes' }, { name: 'composeMsg', type: 'bytes' }, { name: 'oftCmd', type: 'bytes' },
      ] },
      { name: 'payInLzToken', type: 'bool' },
    ],
    outputs: [{ type: 'tuple', components: [{ name: 'nativeFee', type: 'uint256' }, { name: 'lzTokenFee', type: 'uint256' }] }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'quoteOFT',
    inputs: [
      { name: 'sendParam', type: 'tuple', components: [
        { name: 'dstEid', type: 'uint32' }, { name: 'to', type: 'bytes32' },
        { name: 'amountLD', type: 'uint256' }, { name: 'minAmountLD', type: 'uint256' },
        { name: 'extraOptions', type: 'bytes' }, { name: 'composeMsg', type: 'bytes' }, { name: 'oftCmd', type: 'bytes' },
      ] },
    ],
    outputs: [
      { name: 'oftLimit', type: 'tuple', components: [{ name: 'minAmountLD', type: 'uint256' }, { name: 'maxAmountLD', type: 'uint256' }] },
      { name: 'oftFeeDetails', type: 'tuple[]', components: [{ name: 'feeAmountLD', type: 'int256' }, { name: 'description', type: 'string' }] },
      { name: 'oftReceipt', type: 'tuple', components: [{ name: 'amountSentLD', type: 'uint256' }, { name: 'amountReceivedLD', type: 'uint256' }] },
    ],
  },
]

// --- type-3 executor lzReceive option encoder (verified against the on-chain quote
// not reverting; Task 3 asserts it byte-identical to the LZ utilities fixture). ---
function lzReceiveOption(gas) {
  const TYPE_3 = '0003'
  const WORKER_EXECUTOR = '01'
  const OPT_LZRECEIVE = '01'
  const gasHex = numberToHex(BigInt(gas), { size: 16 }).slice(2) // 16 bytes
  const optLen = numberToHex(16 + 1, { size: 2 }).slice(2) // optionType(1) + gas(16) = 17
  return `0x${TYPE_3}${WORKER_EXECUTOR}${optLen}${OPT_LZRECEIVE}${gasHex}`
}

// --- clients ---
const c2 = chainFor(114)
const c2Chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
const coston2 = createPublicClient({ chain: c2Chain, transport: http(c2.rpcUrl) })
const sepoliaChain = { id: SEPOLIA_CHAIN_ID, name: 'Sepolia', nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [SEPOLIA_RPC] } } }
const sepolia = createPublicClient({ chain: sepoliaChain, transport: http(SEPOLIA_RPC) })

const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const tryRead = async (label, fn) => {
  try { return await fn() } catch (e) { const m = `ERR:${(e.shortMessage || e.message || '').slice(0, 120)}`; console.log(` ! ${label}: ${m}`); return m }
}

const blockers = []
const out = {
  probe: 'M8 cross-chain (LayerZero V2 OFT) Coston2 -> Sepolia',
  ranAt: new Date().toISOString(),
  signer: OWNER,
  coston2: { chainId: 114, eid: COSTON2_EID, rpcUrl: c2.rpcUrl },
  sepolia: { chainId: SEPOLIA_CHAIN_ID, eid: SEPOLIA_EID, rpcUrl: SEPOLIA_RPC },
  addresses: { oftAdapter: COSTON2_OFT_ADAPTER, ftestxrp: FTESTXRP, sepoliaFxrpOft: SEPOLIA_FXRP_OFT, composer: COSTON2_COMPOSER },
  reads: {},
  funding: {},
  blockers,
}

const rd = (address, functionName, args = [], client = coston2, abi = OFT_ABI) =>
  client.readContract({ address, abi, functionName, args })

async function main() {
  out.coston2.block = bn(await tryRead('coston2 block', () => coston2.getBlockNumber()))
  out.sepolia.block = bn(await tryRead('sepolia block', () => sepolia.getBlockNumber()))

  // --- 1) Coston2 OFT adapter reality ---
  console.log('\n=== Coston2 OFT Adapter ===')
  const token = await tryRead('token()', () => rd(COSTON2_OFT_ADAPTER, 'token'))
  const tokenMatches = typeof token === 'string' && token.toLowerCase() === FTESTXRP.toLowerCase()
  const peer = await tryRead('peers(SEPOLIA_EID)', () => rd(COSTON2_OFT_ADAPTER, 'peers', [SEPOLIA_EID]))
  const peerSet = typeof peer === 'string' && /^0x/.test(peer) && !/^0x0{64}$/.test(peer)
  const sharedDecimals = await tryRead('sharedDecimals()', () => rd(COSTON2_OFT_ADAPTER, 'sharedDecimals'))
  const decimalConversionRate = await tryRead('decimalConversionRate()', () => rd(COSTON2_OFT_ADAPTER, 'decimalConversionRate'))
  out.reads.coston2Adapter = { token, tokenMatchesFTestXRP: tokenMatches, peer: bn(peer), peerSet, sharedDecimals: bn(sharedDecimals), decimalConversionRate: bn(decimalConversionRate) }
  console.log(' token', token, 'matches FTestXRP:', tokenMatches)
  console.log(' peer(40161)', bn(peer), 'set:', peerSet)
  console.log(' sharedDecimals', bn(sharedDecimals), 'decimalConversionRate', bn(decimalConversionRate))

  if (!tokenMatches) blockers.push(`Coston2 OFT adapter token() (${token}) != FTestXRP ${FTESTXRP}`)
  if (!peerSet) blockers.push(`Coston2 OFT adapter peers(${SEPOLIA_EID}) is unset — a Coston2 -> Sepolia send would revert`)

  // --- 2) quoteSend / quoteOFT for 1 FXRP to the signer on Sepolia ---
  console.log('\n=== quote 1 FXRP -> Sepolia ===')
  const options = lzReceiveOption(EXECUTOR_GAS)
  const sendParam = {
    dstEid: SEPOLIA_EID,
    to: pad(OWNER, { size: 32 }),
    amountLD: ONE_FXRP,
    minAmountLD: ONE_FXRP,
    extraOptions: options,
    composeMsg: '0x',
    oftCmd: '0x',
  }
  console.log(' extraOptions', options)
  const fee = await tryRead('quoteSend(sp,false)', () => rd(COSTON2_OFT_ADAPTER, 'quoteSend', [sendParam, false]))
  const oft = await tryRead('quoteOFT(sp)', () => rd(COSTON2_OFT_ADAPTER, 'quoteOFT', [sendParam]))
  const nativeFee = fee && typeof fee === 'object' ? fee.nativeFee : null
  const receipt = Array.isArray(oft) ? oft[2] : null
  const limit = Array.isArray(oft) ? oft[0] : null
  const amountReceivedLD = receipt ? receipt.amountReceivedLD : null
  out.reads.quote = {
    extraOptions: options,
    amountSentLD: bn(ONE_FXRP),
    nativeFee: bn(nativeFee),
    nativeFeeC2FLR: nativeFee != null ? (Number(nativeFee) / 1e18).toString() : null,
    amountReceivedLD: bn(amountReceivedLD),
    dustRemoved: amountReceivedLD != null ? bn(ONE_FXRP - BigInt(amountReceivedLD)) : null,
    oftLimit: limit ? { minAmountLD: bn(limit.minAmountLD), maxAmountLD: bn(limit.maxAmountLD) } : null,
    lzTokenFee: fee && typeof fee === 'object' ? bn(fee.lzTokenFee) : null,
  }
  console.log(' nativeFee', bn(nativeFee), 'C2FLR ~', out.reads.quote.nativeFeeC2FLR)
  console.log(' amountReceivedLD', bn(amountReceivedLD), 'dustRemoved', out.reads.quote.dustRemoved)
  if (nativeFee == null) blockers.push('quoteSend did not return a nativeFee — options encoding or route wiring is wrong')

  // --- 3) Sepolia destination OFT responds (the delivery-read target) ---
  console.log('\n=== Sepolia FXRP OFT (delivery-read target) ===')
  const sToken = await tryRead('sepolia token()', () => rd(SEPOLIA_FXRP_OFT, 'token', [], sepolia))
  const sDecimals = await tryRead('sepolia decimals()', () => rd(SEPOLIA_FXRP_OFT, 'decimals', [], sepolia))
  const sSymbol = await tryRead('sepolia symbol()', () => rd(SEPOLIA_FXRP_OFT, 'symbol', [], sepolia))
  out.reads.sepoliaOft = { token: sToken, decimals: bn(sDecimals), symbol: sSymbol }
  console.log(' token', sToken, 'decimals', bn(sDecimals), 'symbol', sSymbol)
  if (typeof sSymbol !== 'string' || sSymbol.startsWith('ERR')) blockers.push('Sepolia FXRP OFT did not respond to reads — cannot confirm delivery from it')

  // --- 4) funding (re-read, never assume) ---
  console.log('\n=== funding (re-read) ===')
  const fxrpBal = await tryRead('coston2 FXRP balanceOf', () => coston2.readContract({ address: FTESTXRP, abi: erc20Abi, functionName: 'balanceOf', args: [OWNER] }))
  const c2Native = await tryRead('coston2 native', () => coston2.getBalance({ address: OWNER }))
  const sepEth = await tryRead('sepolia ETH', () => sepolia.getBalance({ address: OWNER }))
  out.funding = {
    coston2Fxrp: bn(fxrpBal), coston2FxrpHuman: typeof fxrpBal === 'bigint' ? (Number(fxrpBal) / 1e6).toString() : null,
    coston2Native: bn(c2Native), coston2NativeHuman: typeof c2Native === 'bigint' ? (Number(c2Native) / 1e18).toString() : null,
    sepoliaEth: bn(sepEth), sepoliaEthHuman: typeof sepEth === 'bigint' ? (Number(sepEth) / 1e18).toString() : null,
    xrplAddress: XRPL_ADDRESS, xrplAccountPresentInSecrets: !!XRPL_ADDRESS,
  }
  console.log(' FXRP', out.funding.coston2FxrpHuman, ' C2FLR', out.funding.coston2NativeHuman, ' SepoliaETH', out.funding.sepoliaEthHuman)
  console.log(' XRPL', XRPL_ADDRESS ?? '(none)')

  // Phase A (the AC1 gate: Coston2 -> Sepolia bridge) needs Coston2 FXRP + C2FLR only.
  if (typeof fxrpBal === 'bigint' && fxrpBal < ONE_FXRP) blockers.push(`PHASE-A: Coston2 FXRP balance ${out.funding.coston2FxrpHuman} < 1 FXRP — cannot bridge`)
  if (typeof c2Native === 'bigint' && c2Native < 2n * 10n ** 17n) blockers.push(`PHASE-A: Coston2 C2FLR ${out.funding.coston2NativeHuman} may be short for fee+gas`)
  // Phase B (the return-leg redeem, Sepolia -> Coston2) needs Sepolia ETH; a zero here
  // does NOT block Phase A. Scoped so a faucet trip is a Phase-B unblock, not a stopper.
  if (typeof sepEth === 'bigint' && sepEth === 0n) blockers.push(`PHASE-B: Sepolia ETH is 0 — the return-leg redeem (Task 6 Phase B) needs Sepolia gas/fee. Faucet the signer ${OWNER}. Does NOT block the Phase A bridge.`)
  if (!XRPL_ADDRESS) blockers.push('PHASE-B: no XRPL account in .secrets for the redeem payout')

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))
  console.log('\n=== blockers ===')
  if (blockers.length === 0) console.log(' none — route wired, quotable, dust known, funding recorded')
  else blockers.forEach((b) => console.log(' -', b))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => { console.error(e); process.exit(1) })
