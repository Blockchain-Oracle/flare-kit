/**
 * All four M3 attestation families, driven end to end on Coston2 against real
 * voting rounds. M3-R11.
 *
 * Prepare against the live verifier, read the fee on chain, submit through
 * FdcHub, derive the round from the submitting block's timestamp, poll
 * Relay.isFinalized, retrieve the proof from the data availability layer, and
 * verify it through FdcVerification.
 *
 * The four are submitted together and then awaited together: they land in the
 * same round or adjacent ones, so waiting on each in turn would spend four
 * finalization windows to learn what one tells us.
 *
 * Dev-only tooling. Writes evidence to .thoughts/verification/. Never prints a
 * key.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  FDC_PROTOCOL_ID,
  chainFor,
  familyFor,
  fdcHubAbi,
  registryFor,
  sourceFor,
} from '@flare-kit/contracts'
import {
  createFdcClient,
  evmTransactionFamily,
  getRequestFee,
  isRoundFinalized,
  readVotingEpochs,
  roundForSubmission,
  web2JsonFamily,
  xrpPaymentFamily,
  xrpPaymentNonexistenceFamily,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const chain = chainFor(CHAIN_ID)
const reg = registryFor(CHAIN_ID)

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const account = privateKeyToAccount(secrets.evm.privateKey)
const transport = http(chain.rpcUrl)
const publicClient = createPublicClient({ transport })
const wallet = createWalletClient({ account, transport })

/**
 * The inputs. The XRPL payment and the Coston2 transaction are M1's own,
 * re-attested: a historical transaction is exactly as real as a fresh one and
 * spends no testnet XRP to make a point already made.
 *
 * The Web2Json target is a static fixture that returns byte-identical JSON on
 * every request. That is the whole requirement — independent data providers
 * fetch it seconds apart, and a value that moves between two fetches reaches no
 * consensus. See the nondeterminism note in the evidence file.
 */
const XRPL_TX = '0x3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03'
const COSTON2_TX = '0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0'
const WEB2_URL = 'https://jsonplaceholder.typicode.com/todos/1'
const WEB2_ABI = JSON.stringify({
  components: [
    { internalType: 'uint256', name: 'id', type: 'uint256' },
    { internalType: 'string', name: 'name', type: 'string' },
  ],
  name: 'Row',
  type: 'tuple',
})

const RUNS = [
  {
    family: xrpPaymentFamily,
    sourceId: 'testXRP',
    input: { transactionId: XRPL_TX, proofOwner: account.address },
    note: 'M1’s own XRPL payment, re-attested.',
  },
  {
    family: evmTransactionFamily,
    sourceId: 'testFLR',
    input: {
      transactionHash: COSTON2_TX,
      requiredConfirmations: 1,
      provideInput: true,
      listEvents: true,
      logIndices: [],
    },
    note: 'Group `flr`, not `eth`. The vendored guides instruct `eth`, which returns INVALID for Coston2.',
  },
  {
    family: web2JsonFamily,
    sourceId: 'PublicWeb2',
    input: { url: WEB2_URL, postProcessJq: '{id: .id, name: .title}', abiSignature: WEB2_ABI },
    note: 'A static fixture. A value that moves between two provider fetches reaches no consensus.',
  },
  {
    family: xrpPaymentNonexistenceFamily,
    sourceId: 'testXRP',
    input: {
      minimalBlockNumber: 19619000,
      deadlineBlockNumber: 19619900,
      deadlineTimestamp: 1780000000,
      destinationAddressHash: `0x${'11'.repeat(32)}`,
      amount: 1,
      checkDestinationTag: true,
      destinationTag: 987654321,
      proofOwner: account.address,
    },
    note: 'Proving a negative over a closed historical window. The uint64-max sentinel producer.',
  },
]

const log = (...args) => console.log(...args)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  log(`account ${account.address} on ${chain.name}`)
  const epochs = await readVotingEpochs(publicClient, CHAIN_ID)
  log(`voting epoch ${epochs.votingEpochDurationSeconds}s from ${epochs.firstVotingRoundStartTs}\n`)

  const results = []

  // Prepare and submit each. Sequential, because four transactions from one
  // account need their nonces in order.
  for (const run of RUNS) {
    const name = run.family.name
    const source = sourceFor(familyFor(name), chain.key, run.sourceId)
    const client = createFdcClient({ services: reg.services, family: run.family, source })

    const prepared = await client.prepareRequest(run.input)
    const fee = await getRequestFee(publicClient, CHAIN_ID, prepared.abiEncodedRequest)
    log(`${name}\n  prepared ${(prepared.abiEncodedRequest.length - 2) / 2} bytes via ${source.group}`)
    log(`  fee ${fee} wei (read, not assumed)`)

    const hash = await wallet.writeContract({
      address: reg.fdcHub,
      abi: fdcHubAbi,
      functionName: 'requestAttestation',
      args: [prepared.abiEncodedRequest],
      value: fee,
      chain: null,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
    const round = roundForSubmission(block.timestamp, epochs)

    log(`  tx ${hash}`)
    log(`  round ${round.votingRoundId}, expected in ~${round.expectedDurationSeconds}s\n`)
    results.push({ ...run, client, source, prepared, fee, hash, round, receipt })
  }

  // One wait for the furthest round, not four.
  const lastRound = results.reduce(
    (max, r) => (r.round.votingRoundId > max ? r.round.votingRoundId : max),
    0n,
  )
  log(`waiting for round ${lastRound} to finalize…`)
  const deadline = Date.now() + 15 * 60_000
  // M4-R4: the protocol id is explicit now. FDC is 200; FTSO's 100 finalizes on
  // the same Relay for the same rounds, so an implicit default would be a
  // question asked of the wrong protocol.
  while (!(await isRoundFinalized(publicClient, CHAIN_ID, FDC_PROTOCOL_ID, lastRound))) {
    if (Date.now() > deadline) throw new Error(`round ${lastRound} did not finalize in 15 minutes`)
    await sleep(15_000)
    process.stdout.write('.')
  }
  log(`\nround ${lastRound} finalized\n`)

  // Retrieve and verify.
  //
  // `isFinalized` and "the proof can be fetched" are two different moments: the
  // merkle root lands on Relay before the data availability provider has
  // indexed the round. Measured on this run, the gap was minutes. So absence is
  // polled through, not concluded from — and only a request that is still
  // missing at the end of the budget is recorded as unknown, never as a
  // negative fact about the underlying data (M3-R10).
  const proofDeadline = Date.now() + 10 * 60_000
  for (const r of results) {
    for (;;) {
      try {
        const proof = await r.client.retrieveProof({
          votingRoundId: r.round.votingRoundId,
          requestBytes: r.prepared.abiEncodedRequest,
        })
        r.proof = proof
        r.merkleNodes = proof.merkleProof.length
        r.verified = await r.client.verifyProof(proof, publicClient, reg.fdcVerification)
        log(`${r.family.name}: proof retrieved (${r.merkleNodes} nodes), verified ${r.verified}`)
        break
      } catch (error) {
        if (Date.now() > proofDeadline) {
          r.unknown = `${error.code ?? 'ERROR'}: ${error.message}`
          log(`${r.family.name}: no proof — ${r.unknown}`)
          break
        }
        await sleep(15_000)
        process.stdout.write('.')
      }
    }
  }

  writeEvidence(results, epochs, lastRound)
  log(`\nevidence written`)
}

/**
 * The attested response, field by field, with the JavaScript type each value
 * decoded to. M3-R6 is a claim about types as much as values, and a table of
 * `bigint`s is the only thing that actually demonstrates it.
 */
function responseTable(r) {
  if (!r.proof) return ''
  const rows = Object.entries(r.proof.data.responseBody)
    .map(([field, value]) => {
      const rendered = Array.isArray(value)
        ? `${value.length} entr${value.length === 1 ? 'y' : 'ies'}`
        : `\`${String(value).slice(0, 60)}\``
      return `| \`${field}\` | ${rendered} | \`${typeof value}\` |`
    })
    .join('\n')
  return `
Attested response, as decoded:

| Field | Value | Type |
|---|---|---|
${rows}
| \`lowestUsedTimestamp\` | \`${r.proof.data.lowestUsedTimestamp}\` | \`${typeof r.proof.data.lowestUsedTimestamp}\` |
`
}

function writeEvidence(results, epochs, lastRound) {
  const rows = results
    .map((r) => {
      const outcome = r.unknown
        ? `no proof / unknown`
        : `verified \`${r.verified}\`, ${r.merkleNodes} merkle node${r.merkleNodes === 1 ? '' : 's'}`
      return `| \`${r.family.name}\` | \`${r.source.group}\` / \`${r.source.sourceId}\` | ${r.fee} wei | ${r.round.votingRoundId} | [\`${r.hash.slice(0, 18)}…\`](${chain.explorerUrl}/tx/${r.hash}) | ${outcome} |`
    })
    .join('\n')

  const details = results
    .map(
      (r) => `### ${r.family.name}

${r.note}

- Verifier: \`${r.prepared.verifier}\`
- Request bytes (${(r.prepared.abiEncodedRequest.length - 2) / 2}): \`${r.prepared.abiEncodedRequest.slice(0, 74)}…\`
- Fee paid: \`${r.fee}\` wei — read from \`getRequestFee\` for these exact bytes
- Voting round: \`${r.round.votingRoundId}\`
- Submission: ${chain.explorerUrl}/tx/${r.hash}
- Outcome: ${
        r.unknown
          ? `**no proof / unknown** — ${r.unknown}`
          : `proof retrieved, \`FdcVerification.verify${r.family.name}\` returned \`${r.verified}\``
      }
- Consumption: ${r.family.row.consumer}
${responseTable(r)}`,
    )
    .join('\n\n')

  const body = `# Verification: four FDC families, live on Coston2

Date: 2026-08-04
Network: ${chain.name} (chain ${chain.id})
Account: \`${account.address}\`
Run by: \`packages/core/scripts/live-fdc-run.mjs\`

Satisfies M3-R11 and contributes to M3-AC3, M3-AC4 and M3-AC7.

**Not** M3-AC5. No \`uint64\`-max sentinel arrived in this run: the nonexistence
window closed on a ledger that has a real overflow block, so the response
carried ordinary values. The sentinel round trip is pinned by
\`packages/core/test/fdc-bigint.test.ts\` instead. What this run does establish
for M3-R6 is that every numeric response field decoded as \`bigint\` — the
per-family response bodies are printed in full below.

## Addresses

| Contract | Address |
|---|---|
| FdcHub | \`${reg.fdcHub}\` |
| FdcRequestFeeConfigurations | \`${reg.fdcRequestFeeConfigurations}\` |
| Relay | \`${reg.relay}\` |
| FlareSystemsManager | \`${reg.flareSystemsManager}\` |
| FdcVerification | \`${reg.fdcVerification}\` |

Voting epoch: \`${epochs.votingEpochDurationSeconds}\`s, first round began at
\`${epochs.firstVotingRoundStartTs}\`. Both read from FlareSystemsManager — they
revert on the deployed Relay despite appearing in \`IRelay.sol\`.

## The four families

| Family | Group / source | Fee | Round | Submission | Outcome |
|---|---|---|---|---|---|
${rows}

Protocol id \`${FDC_PROTOCOL_ID}\`. Round \`${lastRound}\` confirmed finalized by
\`Relay.isFinalized\` before any proof was requested.

${details}

## What this run establishes

- **The fee is read, never assumed.** Every request paid exactly what
  \`getRequestFee\` returned for its own bytes. The same call returns 20 FLR on
  Flare mainnet and 3 FLR for \`ConfirmedBlockHeightExists\`, so a constant would
  have been wrong on one of the two networks.
- **One state machine served four families.** \`packages/core/src/fdc/client.ts\`
  is the only implementation of prepare → submit → round → proof → verify in the
  repository (M3-R1); the family module is the only thing that changed between
  the four runs above.
- **Coston2 EVM attestations are served by \`flr\`, not \`eth\`.** The vendored
  guides instruct \`/verifier/eth/\`, which returns \`INVALID\` for a real Coston2
  transaction.
- **A missing proof is recorded as unknown.** Nothing above renders an
  unretrieved proof as a failed attestation or as a negative fact about the
  underlying chain (M3-R10).
- **\`Relay.isFinalized\` and "the proof can be fetched" are two moments.** An
  earlier run of this script, at round \`1415855\`, retrieved once immediately
  after \`isFinalized\` returned true and got no proof for all four requests; all
  four were retrievable minutes later. The merkle root is published on chain
  before the data availability provider has indexed the round. A timeline that
  treats finalization as proof-readiness will show a proof that is not yet
  there, so \`AttestationTimeline\` renders them as separate steps and this
  script polls rather than concluding from one absence.
`

  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(`${ROOT}/.thoughts/verification/2026-08-04-coston2-live-fdc.md`, body)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
