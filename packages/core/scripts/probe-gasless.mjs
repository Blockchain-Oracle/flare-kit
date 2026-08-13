// packages/core/scripts/probe-gasless.mjs
// M9 Task 1 — read-only probe (no product code, no chain writes). Confirms the
// substrate for the two M9 payment rails BEFORE any contract is deployed:
//   1) FXRP token reality: decimals (must be 6), symbol, operator balance;
//   2) the two declared-gap facts — neither FXRP nor the real Coston2 USD₮0
//      implements EIP-3009 (so gasless FXRP needs the forwarder, and x402 needs a
//      self-deployed demo token). Absence is re-read here, never assumed;
//   3) operator C2FLR funding for 3 contract deploys + relayer/settle gas, and the
//      operator FXRP it must be able to hand the AC1 payer in Task 7;
//   4) the AC1 payer account — a key DISTINCT from the operator/relayer, generated
//      once and persisted to .secrets/m9-payer.json (the key is NEVER printed nor
//      written here); only its ADDRESS lands in the evidence JSON.
// Anything short lands in blockers[] for Abu to action (a `! ...` faucet trip).
//
//   node packages/core/scripts/probe-gasless.mjs
//
// Addresses inlined on purpose: this is the run that verifies them before Task 3
// makes them the @flare-kit/contracts registry's source of truth.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, erc20Abi, getAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { chainFor } from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-12-m9-probe.json`
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`
const PAYER_PATH = `${ROOT}/.secrets/m9-payer.json`

const FXRP = '0x0b6A3645c240605887a5532109323A3E12273dc7' // Coston2 FXRP (FTestXRP)
const REAL_USDT0 = '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F' // real Coston2 USD₮0

// EIP-3009 + EIP-2612 selectors. Their ABSENCE is what makes the forwarder + the
// demo token necessary; this run re-reads it rather than trusting the spec's note.
const EIP3009 = {
  transferWithAuthorization: 'e3ee160e',
  receiveWithAuthorization: 'ef55bec6',
  authorizationState: 'e94a0102',
  cancelAuthorization: '5a049a70',
}
const EIP2612 = { permit: 'd505accf', nonces: '7ecebe00', DOMAIN_SEPARATOR: '3644e515' }

// Conservative Coston2 budget: 3 contract deploys (forwarder + MockUSDT0 +
// facilitator) + a handful of config/settle txs; Coston2 gas is cheap, so 2 C2FLR is
// a generous floor. The payer's FXRP + a little C2FLR (one approval) come FROM the
// operator in Task 7, so both are demands on the operator's balance too.
const C2FLR_FOR_DEPLOYS = 2n * 10n ** 18n // 2 C2FLR floor for deploys + gas
const FXRP_FOR_PAYER = 1n * 10n ** 6n // ≥1 FXRP the operator must be able to hand the payer (6 dp)

const secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf8'))
const OPERATOR = getAddress(secrets.evm.address)

// --- payer account: distinct from the operator; generate once, persist the key to
// .secrets/m9-payer.json (never printed, never in the evidence JSON), reuse on re-run
// so the probe stays idempotent. ---
let payerAddress
let payerGenerated = false
if (existsSync(PAYER_PATH)) {
  const p = JSON.parse(readFileSync(PAYER_PATH, 'utf8'))
  payerAddress = getAddress(p.address)
} else {
  const pk = generatePrivateKey()
  const acct = privateKeyToAccount(pk)
  payerAddress = acct.address
  writeFileSync(
    PAYER_PATH,
    JSON.stringify(
      {
        note: 'M9 AC1 gasless payer — a key DISTINCT from the operator/relayer. Funded with FXRP + a little C2FLR in Task 7 (Phase A), then drained to ~0 to prove the PAYMENT is gasless. Never logged, never in --json/evidence/receipts.',
        createdAt: new Date().toISOString(),
        address: acct.address,
        privateKey: pk,
      },
      null,
      2,
    ),
  )
  payerGenerated = true
}

const c2 = chainFor(114)
const c2Chain = { id: 114, name: c2.name, nativeCurrency: c2.nativeCurrency, rpcUrls: { default: { http: [c2.rpcUrl] } } }
const coston2 = createPublicClient({ chain: c2Chain, transport: http(c2.rpcUrl) })

const bn = (v) => (typeof v === 'bigint' ? v.toString() : v)
const jsonify = (_, v) => (typeof v === 'bigint' ? v.toString() : v)
const tryRead = async (label, fn) => {
  try {
    return await fn()
  } catch (e) {
    const m = `ERR:${(e.shortMessage || e.message || '').slice(0, 120)}`
    console.log(` ! ${label}: ${m}`)
    return m
  }
}

// For each selector record two signals: `dispatched` (the PUSH4 0x63<selector>
// dispatcher pattern — the authoritative "the contract routes this function" tell)
// and `raw` (the 4 bytes appearing anywhere — a looser signal that can coincide).
// Conclusions/blockers key on `dispatched`; both are recorded for the evidence.
const scan = (code, sels) => {
  const hex = typeof code === 'string' ? code.toLowerCase() : ''
  const dispatched = {}
  const raw = {}
  for (const [name, sel] of Object.entries(sels)) {
    dispatched[name] = hex.includes('63' + sel.toLowerCase())
    raw[name] = hex.includes(sel.toLowerCase())
  }
  return { dispatched, raw, anyDispatched: Object.values(dispatched).some(Boolean) }
}

const blockers = []
const out = {
  probe: 'M9 gasless + x402 substrate + funding (Coston2)',
  ranAt: new Date().toISOString(),
  operator: OPERATOR,
  payer: payerAddress,
  payerFreshlyGenerated: payerGenerated,
  coston2: { chainId: 114, rpcUrl: c2.rpcUrl },
  fxrp: {},
  eip3009: {},
  funding: {},
  blockers,
}

async function main() {
  if (payerGenerated) console.log(' generated a fresh AC1 payer account; key persisted to .secrets/m9-payer.json (NOT printed)')
  else console.log(' reusing the existing AC1 payer account from .secrets/m9-payer.json')

  out.coston2.block = bn(await tryRead('coston2 block', () => coston2.getBlockNumber()))

  // 1) FXRP token reality
  console.log('\n=== FXRP token ===')
  const decimals = await tryRead('FXRP decimals()', () => coston2.readContract({ address: FXRP, abi: erc20Abi, functionName: 'decimals' }))
  const symbol = await tryRead('FXRP symbol()', () => coston2.readContract({ address: FXRP, abi: erc20Abi, functionName: 'symbol' }))
  const opFxrp = await tryRead('FXRP balanceOf(operator)', () => coston2.readContract({ address: FXRP, abi: erc20Abi, functionName: 'balanceOf', args: [OPERATOR] }))
  out.fxrp = {
    address: FXRP,
    decimals: bn(decimals),
    symbol,
    operatorBalance: bn(opFxrp),
    operatorBalanceHuman: typeof opFxrp === 'bigint' ? (Number(opFxrp) / 1e6).toString() : null,
  }
  console.log(' decimals', bn(decimals), 'symbol', symbol, 'operatorFXRP', out.fxrp.operatorBalanceHuman)
  if (decimals !== 6) blockers.push(`FXRP decimals ${bn(decimals)} != 6 — the plan/registry assume 6 dp`)

  // 2) declared-gap facts: no EIP-3009 (nor EIP-2612) on FXRP or the real USD₮0
  console.log('\n=== EIP-3009 / EIP-2612 substrate (expect ABSENT on both) ===')
  const fxrpCode = await tryRead('FXRP getCode', () => coston2.getCode({ address: FXRP }))
  const usdtCode = await tryRead('USD₮0 getCode', () => coston2.getCode({ address: REAL_USDT0 }))
  const fxrp3009 = scan(fxrpCode, EIP3009)
  const usdt3009 = scan(usdtCode, EIP3009)
  const fxrp2612 = scan(fxrpCode, EIP2612)
  const usdt2612 = scan(usdtCode, EIP2612)
  out.eip3009 = {
    fxrp: { eip3009: fxrp3009, eip2612: fxrp2612 },
    realUsdt0: { address: REAL_USDT0, eip3009: usdt3009, eip2612: usdt2612 },
    conclusion:
      'neither FXRP nor the real Coston2 USD₮0 dispatches any EIP-3009 selector → gasless FXRP needs the forwarder; x402 needs the self-deployed MockUSDT0 (demo token)',
  }
  console.log(' FXRP    eip3009 dispatched:', JSON.stringify(fxrp3009.dispatched))
  console.log(' USD₮0   eip3009 dispatched:', JSON.stringify(usdt3009.dispatched))
  // PRESENT would break the milestone's premise; flag it (never expected).
  if (fxrp3009.anyDispatched) blockers.push('UNEXPECTED: FXRP dispatches an EIP-3009 selector — re-examine before deploying the forwarder')
  if (usdt3009.anyDispatched)
    blockers.push('UNEXPECTED: real Coston2 USD₮0 dispatches an EIP-3009 selector — x402-on-real-USD₮0 may be possible; revisit the demo-token decision')

  // 3) funding for the deploys + the payer funding the operator must supply
  console.log('\n=== funding (re-read, never assume) ===')
  const opNative = await tryRead('operator C2FLR', () => coston2.getBalance({ address: OPERATOR }))
  const payerNative = await tryRead('payer C2FLR', () => coston2.getBalance({ address: payerAddress }))
  const payerFxrp = await tryRead('payer FXRP', () => coston2.readContract({ address: FXRP, abi: erc20Abi, functionName: 'balanceOf', args: [payerAddress] }))
  out.funding = {
    operatorC2flr: bn(opNative),
    operatorC2flrHuman: typeof opNative === 'bigint' ? (Number(opNative) / 1e18).toString() : null,
    operatorFxrpHuman: out.fxrp.operatorBalanceHuman,
    payerC2flr: bn(payerNative),
    payerC2flrHuman: typeof payerNative === 'bigint' ? (Number(payerNative) / 1e18).toString() : null,
    payerFxrp: bn(payerFxrp),
    payerFxrpHuman: typeof payerFxrp === 'bigint' ? (Number(payerFxrp) / 1e6).toString() : null,
    note: 'the payer is funded from the operator in Task 7 (Phase A); its ~0 balance here is expected, not a blocker.',
  }
  console.log(' operator C2FLR', out.funding.operatorC2flrHuman, ' FXRP', out.fxrp.operatorBalanceHuman)
  console.log(' payer    C2FLR', out.funding.payerC2flrHuman, ' FXRP', out.funding.payerFxrpHuman, '(funded in Task 7)')

  if (typeof opNative === 'bigint' && opNative < C2FLR_FOR_DEPLOYS)
    blockers.push(
      `OPERATOR C2FLR ${out.funding.operatorC2flrHuman} < ~2 for 3 deploys + relayer/settle gas + funding the payer — faucet the operator ${OPERATOR}`,
    )
  if (typeof opFxrp === 'bigint' && opFxrp < FXRP_FOR_PAYER)
    blockers.push(
      `OPERATOR FXRP ${out.fxrp.operatorBalanceHuman} < 1 — cannot fund the AC1 payer's FXRP in Task 7; acquire FXRP (FAssets mint) for ${OPERATOR}`,
    )

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(out, jsonify, 2))
  console.log('\n=== blockers ===')
  if (blockers.length === 0) console.log(' none — substrate confirmed, funding sufficient, payer established')
  else blockers.forEach((b) => console.log(' -', b))
  console.log('\nwrote', EV_PATH)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
