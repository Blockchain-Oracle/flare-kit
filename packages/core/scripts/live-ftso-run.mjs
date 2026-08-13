/**
 * Every FTSO capability, driven end to end against the live deployment. M4-R11.
 *
 * **The read half needs no key and spends nothing.** Enumeration, fee quotation,
 * the batched read, anchor retrieval, on-chain verification, the tamper cases,
 * the retention bisection, secure randomness and the custom feed set are all
 * `eth_call` or HTTP. That is deliberate: a developer must be able to reproduce
 * the whole evidence set without holding a key or spending testnet funds.
 *
 * **The one spending step is opt-in and off by default.** A real
 * `offerIncentive` costs about 0.37 C2FLR and is irreversible, so it runs only
 * with `--submit-incentive`, and only that flag reads the signing key. Without
 * it the offer is still quoted and dry-run against the contract, which
 * establishes the price is right without moving anything.
 *
 * Dev-only tooling. Writes evidence to `.thoughts/verification/`. Never prints
 * a key.
 *
 *   node scripts/live-ftso-run.mjs                     # read-only, no key
 *   node scripts/live-ftso-run.mjs --network flare     # mainnet custom feeds
 *   node scripts/live-ftso-run.mjs --submit-incentive  # SPENDS ~0.37 C2FLR
 */
import { createPublicClient, http } from 'viem'
import { chainFor } from '@flare-kit/contracts'
import {
  probeCatalogue,
  probeCustomFeeds,
  probeIncentive,
  probeProof,
  probeRandom,
  probeReads,
  probeRetentionFloor,
} from './live-ftso-probes.mjs'
import { writeReport } from './live-ftso-report.mjs'

const ROOT = '/Users/abu/dev/hackathon/flare'
const argv = process.argv.slice(2)
const NETWORK = argv.includes('--network') ? argv[argv.indexOf('--network') + 1] : 'coston2'
const SUBMIT = argv.includes('--submit-incentive')
const CHAIN_ID = NETWORK === 'flare' ? 14 : 114

/** Funded on Coston2. Used only as a `from` for dry runs; the key stays unread. */
const PAYER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const chain = chainFor(CHAIN_ID)
const reader = createPublicClient({ transport: http(chain.rpcUrl) })

const say = (...parts) => console.log(...parts)
const ctx = { reader, chainId: CHAIN_ID, payer: PAYER, say }

async function main() {
  say(
    SUBMIT
      ? `FTSO live run — ${chain.name} (${CHAIN_ID}), WITH a real incentive submission`
      : `FTSO live run — ${chain.name} (${CHAIN_ID}), read-only, no key required`,
  )
  const results = { network: chain.name, chainId: CHAIN_ID, ranAt: new Date().toISOString() }

  say('catalogue…')
  results.catalogue = await probeCatalogue(ctx)
  say('reads…')
  results.reads = await probeReads(ctx)
  say('anchor proof…')
  results.proof = await probeProof(ctx)
  say('retention floor…')
  results.retention = await probeRetentionFloor(ctx, BigInt(results.proof.votingRoundId))
  say('secure random…')
  results.random = await probeRandom(ctx)
  say('incentive quote…')
  results.incentive = await probeIncentive(ctx)
  say('custom feeds…')
  results.customFeeds = await probeCustomFeeds(ctx)

  // The only branch that spends, and the only one that reads the signing key.
  // Imported lazily so a read-only run never loads it.
  if (SUBMIT) {
    const { submitIncentive } = await import('./live-ftso-submit.mjs')
    results.incentive.submission = await submitIncentive({
      root: ROOT,
      chainId: CHAIN_ID,
      reader,
      quote: results.incentive.quote,
    })
    results.incentive.submitted = true
  }

  writeReport(ROOT, results)
  say(SUBMIT ? '\nEvidence written, incentive submitted.' : '\nEvidence written. offerIncentive NOT submitted.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
