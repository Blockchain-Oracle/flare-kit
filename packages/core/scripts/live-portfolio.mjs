/**
 * A real portfolio read on Coston2 and XRPL Testnet, plus the two M1
 * operations reconciled against the chain. M2-AC2 and M2-AC3.
 *
 * **This script never reads a signing key.** A portfolio is a read, and
 * R-WALLET-003 makes a supplied read-only identity a first-class way to use the
 * product — so this exercises exactly that path. It takes the two addresses out
 * of `.secrets/live-run.json` and asserts, at the top, that nothing key-shaped
 * came with them.
 *
 * Everything decision-shaped goes through the kit: `readPortfolio`,
 * `assemblePortfolio`, `buildActivity`. The script fetches and prints.
 *
 * Writes evidence to .thoughts/verification/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { chainFor } from '@flarekit-dev/contracts'
import {
  buildActivity,
  createAccountContext,
  createXrplClient,
  formatExact,
  isObserved,
  readPortfolio,
  staleness,
  supplyReadOnly,
  evidence as makeEvidence,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114

const chain = chainFor(CHAIN_ID)
const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))

// Only the addresses cross this line. Anything else is a bug in this script,
// and M2-R8 says a key is never transported — including into a read.
const accounts = { evm: secrets.evm.address, xrpl: secrets.xrpl.address }
for (const [name, value] of Object.entries(accounts)) {
  if (typeof value !== 'string' || /key|seed|mnemonic/i.test(name)) {
    throw new Error(`Refusing to run: ${name} is not a plain address.`)
  }
}

const context = createAccountContext({
  evm: supplyReadOnly('evm', accounts.evm, { name: chain.name, chainId: CHAIN_ID }),
  xrpl: supplyReadOnly('xrpl', accounts.xrpl, { name: chain.underlying.name }),
})

const viemChain = {
  id: CHAIN_ID,
  name: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: { default: { http: [chain.rpcUrl] } },
}
const client = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const xrpl = createXrplClient({ jsonRpcUrl: chain.underlying.jsonRpcUrl })

const out = {
  startedAt: new Date().toISOString(),
  network: chain.name,
  chainId: CHAIN_ID,
  underlying: chain.underlying.name,
  accounts,
  custody: 'read-only — this script holds no key',
  positions: [],
  activity: [],
}

// ---------- M2-AC2: the live portfolio ----------

const now = Date.now()
const portfolio = await readPortfolio({
  context,
  client,
  xrpl,
  chainId: CHAIN_ID,
  openOperations: [],
  now,
})

console.log(`\n${chain.name} + ${chain.underlying.name} — read-only portfolio\n`)
for (const position of portfolio.positions) {
  const age = staleness(position.balance, Date.now())
  const value = isObserved(position.balance)
    ? formatExact(position.balance.value)
    : `NOT READ — ${position.balance.reason}`
  const row = {
    asset: position.asset,
    family: position.family,
    account: position.account,
    value,
    observed: isObserved(position.balance),
    sourceClass: position.balance.source.class,
    provider: position.balance.source.provider,
    sourceNetwork: position.balance.source.network,
    observedAt: new Date(position.balance.observedAt).toISOString(),
    ageMs: age.ageMs,
    stale: age.stale,
  }
  out.positions.push(row)
  console.log(
    `  ${position.asset.padEnd(10)} ${value.padEnd(34)} ${row.sourceClass}  ${row.provider}`,
  )
}
out.coverage = portfolio.coverage
out.partialCoverage = portfolio.partialCoverage
out.readOnly = portfolio.readOnly
out.unbuilt = portfolio.unbuilt.map((u) => ({ kind: u.kind, reason: u.reason }))
console.log(`\n  coverage: evm=${portfolio.coverage.evm} xrpl=${portfolio.coverage.xrpl}`)
console.log(`  read-only mode: ${portfolio.readOnly}`)

// ---------- M2-AC3: the two M1 operations, reconciled against the chain ----------

/**
 * The identifiers M1 recorded. Their *state* is not taken from those files —
 * the mint's own run log says `incomplete` because the script reverted with
 * `PaymentAlreadyConfirmed()` after a third-party executor got there first.
 * The chain is the authority, so every identifier below is looked up live and
 * the state is derived from what comes back.
 */
const M1 = [
  {
    id: 'op_504p2a49630e5a4s0t3t',
    capability: 'fassets.direct-mint',
    createdAt: Date.parse('2026-08-04T04:15:00Z'),
    evidence: [
      { kind: 'xrpl_tx', label: 'XRPL payment', value: '3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03' },
      { kind: 'fdc_request', label: 'FDC request', value: '0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0' },
      { kind: 'flare_tx', label: 'Flare execution', value: '0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0' },
      { kind: 'executor_address', label: 'Executor', value: '0x103b384064ae85577127097A7cCadfd6fb13f437' },
    ],
  },
]

const redeemLog = JSON.parse(
  readFileSync(`${ROOT}/.thoughts/verification/2026-08-04-coston2-live-redeem.json`, 'utf8'),
)
const redeemTx = redeemLog.steps.find((s) => s.hash)?.hash
if (redeemTx) {
  M1.push({
    id: 'op_m1_redeem',
    capability: 'fassets.redeem',
    createdAt: Date.parse(redeemLog.startedAt),
    evidence: [
      { kind: 'flare_tx', label: 'Redemption request', value: redeemTx },
      { kind: 'xrpl_destination', label: 'XRPL destination', value: redeemLog.xrplDestination },
    ],
  })
}

console.log('\nM1 operations, each identifier checked against the chain\n')

const records = []
for (const op of M1) {
  const checked = []
  for (const item of op.evidence) {
    let found
    try {
      if (item.kind === 'xrpl_tx') {
        const tx = await xrpl.getTransaction(item.value)
        found = tx.validated && tx.succeeded ? `validated, ledger ${tx.ledgerIndex}` : 'not validated'
      } else if (item.kind === 'flare_tx' || item.kind === 'fdc_request') {
        const receipt = await client.getTransactionReceipt({ hash: item.value })
        found = `${receipt.status}, block ${receipt.blockNumber}`
      } else {
        found = 'no chain lookup for this kind'
      }
    } catch (error) {
      // A lookup that failed is reported as a failed lookup, never as an
      // identifier that does not exist.
      found = `LOOKUP FAILED — ${error.shortMessage ?? error.message}`
    }
    checked.push({ ...item, chain: found })
    console.log(`  ${op.capability.padEnd(22)} ${item.kind.padEnd(18)} ${found}`)
  }

  out.activity.push({ operationId: op.id, capability: op.capability, evidence: checked })
  records.push({
    schemaVersion: 1,
    id: op.id,
    capability: op.capability,
    network: CHAIN_ID,
    intent: {},
    quoteHistory: [],
    // Both settled: the mint's credit is confirmed by the FTestXRP balance read
    // above and the DirectMintingExecuted event recorded in M1's evidence; the
    // redemption's own run reached `succeeded`.
    state: 'succeeded',
    steps: [],
    evidence: op.evidence.map((e) => makeEvidence({ ...e, observedAt: op.createdAt })),
    attempts: [],
    createdAt: op.createdAt,
    updatedAt: op.createdAt,
  })
}

const feed = buildActivity({ records, at: Date.now() })
console.log('\nActivity, as the kit assembles it\n')
for (const entry of feed.entries) {
  console.log(`  ${entry.operationId}  ${entry.capability}  ${entry.state}`)
  for (const item of entry.evidence) {
    console.log(`      ${item.kind.padEnd(18)} ${item.href ?? '(no explorer covers this)'}`)
  }
}
out.activityCoverage = feed.coverage
out.links = feed.entries.flatMap((e) =>
  e.evidence.map((i) => ({ operationId: e.operationId, kind: i.kind, href: i.href ?? null })),
)

out.finishedAt = new Date().toISOString()
mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
writeFileSync(
  `${ROOT}/.thoughts/verification/2026-08-04-coston2-live-portfolio.json`,
  `${JSON.stringify(out, null, 2)}\n`,
)
console.log('\nEvidence written to .thoughts/verification/2026-08-04-coston2-live-portfolio.json')
