// packages/core/scripts/live-smart-account.mjs
// M13-AC4 — the live Coston2 instruction round trips.
//
//   node packages/core/scripts/live-smart-account.mjs            # KEYLESS pre-flight (default)
//   node packages/core/scripts/live-smart-account.mjs fund --broadcast
//   node packages/core/scripts/live-smart-account.mjs pay --broadcast
//   node packages/core/scripts/live-smart-account.mjs attest --broadcast
//   node packages/core/scripts/live-smart-account.mjs dispatch --broadcast
//   node packages/core/scripts/live-smart-account.mjs verify      # keyless read-back
//
// Every write mode is behind a DOUBLE guard — the `--broadcast` CLI flag AND the env token
// LIVE_SA_BROADCAST — the M12 live-script shape. Without BOTH, the run records the refusal
// and STOPS before reading the secrets file, constructing a wallet, or sending anything.
// The default pre-flight pass NEVER opens `.secrets/live-run.json`.
//
// SECRETS: the EVM private key and the XRPL seed are read only inside a guarded write mode,
// are never logged, never printed in --json, and never written to evidence.
//
// WHY THE PLAN GATE IS BYPASSED HERE: `planInstruction` refuses `unverified` until
// `smartAccountsVerified` flips, and the flag flips only after this run confirms a round
// trip. So the first run drives the adapter and the codec directly — the same
// chicken-and-egg the M10/M12 live scripts resolved the same way. Everything the plan
// checks is still checked below, out loud, before anything is signed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  formatUnits,
  getAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  buildExecuteInstructionCall,
  buildInstructionCatalogue,
  buildInstructionPayment,
  createFdcClient,
  createXrplClient,
  encodePaymentReference,
  getRequestFee,
  instructionRow,
  isRoundFinalized,
  paymentFamily,
  readDeploymentSettings,
  readPersonalAccount,
  readTransactionIdUsed,
  readVotingEpochs,
  roundForSubmission,
  smartAccountsFor,
  toPaymentProofStruct,
} from '@flare-kit/core'
import {
  FDC_PROTOCOL_ID,
  familyFor,
  fdcHubAbi,
  masterAccountControllerAbi,
  registryFor,
  sourceFor,
} from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-13-coston2-live-smart-account.json`
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`
const MODE = process.argv[2] ?? 'preflight'
const BROADCAST_TOKEN = 'i-understand-this-spends-real-xrp-and-cannot-be-undone'

const NETWORK = 'coston2'
const CHAIN_ID = 114
const RPC = 'https://coston2-api.flare.network/ext/C/rpc'
const XRPL_RPC = 'https://xrpl-testnet-api.flare.network'
// ADDRESS ONLY in the keyless pass — the seed for this account lives in `.secrets`.
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const SIGNER = getAddress('0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9')

// Run 1: the FXRP transfer. 1 FTestXRP out of the personal account, to the M9 payer address
// (a real account this project controls, so the effect read-back is unambiguous).
const TRANSFER_RECIPIENT = getAddress('0xDddF991858311597bFD3D125cb342a0d4B56ea0a')
const TRANSFER_DROPS = 1_000_000n
/** What the personal account is funded with before run 1 — the transfer amount plus slack. */
const FUND_DROPS = 2_000_000n

const jsonify = (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
const guardOk = () =>
  process.argv.includes('--broadcast') && process.env.LIVE_SA_BROADCAST === BROADCAST_TOKEN

const publicClient = createPublicClient({ transport: http(RPC, { timeout: 30_000 }) })
// Core's own XRPL reader — the same one M1's mint path uses. Reused rather than
// re-rolled: it already handles the JSON-RPC envelope and the txnNotFound subtlety.
const xrplClient = createXrplClient({ jsonRpcUrl: XRPL_RPC })
const deployment = smartAccountsFor(NETWORK)
const registry = registryFor(CHAIN_ID)
const fasset = registry.fassets.XRP

/** Opened ONLY inside a guarded write mode. Values are used, never printed. */
function secrets() {
  if (!guardOk()) throw new Error('refusing to read secrets outside a guarded broadcast mode')
  return JSON.parse(readFileSync(SECRETS_PATH, 'utf8'))
}

function record(phase, data) {
  let existing
  try {
    existing = JSON.parse(readFileSync(EV_PATH, 'utf8'))
  } catch {
    existing = { milestone: 'M13 — XRPL-controlled Smart Accounts', network: NETWORK, phases: {} }
  }
  existing.phases = { ...existing.phases, [phase]: { at: new Date().toISOString(), ...data } }
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(existing, jsonify, 2))
  console.log(`\nrecorded phase "${phase}" -> ${EV_PATH}`)
}

/** Everything the plan would check, checked out loud before anything is signed. */
async function preflight() {
  const settings = await readDeploymentSettings(publicClient, deployment)
  if (!settings) throw new Error('the controller could not be read — nothing can be planned')
  const account = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  if (!account) throw new Error('the personal account could not be derived')

  const catalogue = buildInstructionCatalogue(settings)
  const row = instructionRow(catalogue, 0x01)
  const reference = encodePaymentReference({
    instructionId: 0x01,
    value: TRANSFER_DROPS,
    recipient: TRANSFER_RECIPIENT,
  })
  const destination = settings.xrplProviderWallets[0]

  const xrplInfo = await xrplClient.getAccountInfo(XRPL_OWNER)
  const xrplBalance = xrplInfo.balanceDrops

  const signerFasset = await publicClient.readContract({
    address: fasset.token,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: [SIGNER],
  })

  const out = {
    smartAccountsVerified: deployment.smartAccountsVerified,
    controller: deployment.masterAccountController,
    operatorWallet: destination,
    sourceId: settings.sourceId,
    proofWindowSeconds: settings.proofValidityDurationSeconds,
    instruction: { id: '0x01', action: row?.instruction.action, availability: row?.availability.kind },
    feeDrops: row?.feeDrops,
    reference,
    personalAccount: {
      address: account.address,
      deployed: account.deployed,
      nonce: account.nonce,
      fassetBalance: account.fassetBalance,
      needsFunding: (account.fassetBalance ?? 0n) < TRANSFER_DROPS,
    },
    signer: {
      address: SIGNER,
      fassetBalance: signerFasset,
      nativeBalance: await publicClient.getBalance({ address: SIGNER }),
    },
    xrplOwner: { address: XRPL_OWNER, balanceDrops: xrplBalance },
    plannedChain: [
      `fund the personal account with ${FUND_DROPS} units of ${fasset.symbol} (EVM transfer)`,
      `sign an XRPL Payment of ${row?.feeDrops} drops to ${destination} carrying ${reference}`,
      'request the FDC Payment attestation and retrieve the proof',
      'submit executeInstruction with the proof and the XRPL address',
      `read back: personal account deployed, InstructionExecuted, and ${TRANSFER_RECIPIENT} +${TRANSFER_DROPS}`,
    ],
  }

  console.log(JSON.stringify(out, jsonify, 2))
  console.log('\n=== readiness ===')
  console.log(` XRPL balance: ${formatUnits(xrplBalance, 6)} XRP — need ${formatUnits(row?.feeDrops ?? 0n, 6)} plus the ledger fee`)
  console.log(` signer ${fasset.symbol}: ${formatUnits(signerFasset, 6)} — need ${formatUnits(FUND_DROPS, 6)} to fund the account`)
  console.log(` personal account funded: ${(account.fassetBalance ?? 0n) >= TRANSFER_DROPS}`)
  record('preflight', out)
}

async function fund() {
  const { evm } = secrets()
  const wallet = createWalletClient({
    account: privateKeyToAccount(evm.privateKey),
    transport: http(RPC),
  })
  const account = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  const hash = await wallet.writeContract({
    address: fasset.token,
    abi: [
      {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [{ type: 'address' }, { type: 'uint256' }],
        outputs: [{ type: 'bool' }],
      },
    ],
    functionName: 'transfer',
    args: [account.address, FUND_DROPS],
    chain: null,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  // viem RESOLVES for a mined-but-reverted transaction; only `status` proves it worked.
  if (receipt.status !== 'success') throw new Error(`funding transfer reverted: ${hash}`)
  const after = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  record('fund', {
    hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    personalAccountBalanceAfter: after?.fassetBalance,
  })
}

async function pay() {
  const { xrpl: xrplSecret } = secrets()
  const settings = await readDeploymentSettings(publicClient, deployment)
  const catalogue = buildInstructionCatalogue(settings)
  const row = instructionRow(catalogue, 0x01)
  const reference = encodePaymentReference({
    instructionId: 0x01,
    value: TRANSFER_DROPS,
    recipient: TRANSFER_RECIPIENT,
  })

  const info = await xrplClient.getAccountInfo(XRPL_OWNER)
  const ledgerIndex = await xrplClient.getCurrentLedgerIndex()

  const unsigned = buildInstructionPayment({
    account: XRPL_OWNER,
    destination: settings.xrplProviderWallets[0],
    amountDrops: row.feeDrops,
    reference,
    sequence: info.sequence,
    lastLedgerSequence: ledgerIndex + 20,
    feeDrops: 12n,
  })

  // The XRPL wallet is constructed here and nowhere else; the seed never leaves this scope.
  const { Wallet } = await import('xrpl')
  const wallet = Wallet.fromSeed(xrplSecret.seed)
  const { tx_blob, hash } = wallet.sign(unsigned)
  const submitted = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'submit', params: [{ tx_blob }] }),
  }).then((r) => r.json())

  const engineResult = submitted?.result?.engine_result
  record('pay', {
    xrplTransactionId: hash,
    engineResult,
    destination: unsigned.Destination,
    amountDrops: unsigned.Amount,
    reference,
    // The submission result is NOT validation. `verify` reads the ledger back.
    note: 'engine_result tesSUCCESS means accepted for processing, not validated.',
  })
  // A tef/tec/tem rejection means the payment will never apply. Continuing to `attest`
  // against a transaction that does not exist would waste the FDC request fee and produce
  // a confusing failure two phases later, so stop here with the reason.
  if (engineResult !== 'tesSUCCESS') {
    throw new Error(
      `the XRPL submission was rejected with ${engineResult ?? 'no engine_result'} — nothing was paid`,
    )
  }
}

function paymentClient() {
  return createFdcClient({
    family: paymentFamily,
    source: sourceFor(familyFor('Payment'), NETWORK, registry.services.xrplSourceId),
    services: registry.services,
  })
}

/**
 * Prepare the `Payment` attestation for the XRPL payment and submit the request on chain.
 * This is a WRITE — `requestAttestation` is payable and costs the request fee (1000 wei on
 * Coston2), which is READ from the contract rather than assumed.
 */
async function attest() {
  const { evm } = secrets()
  const evidence = JSON.parse(readFileSync(EV_PATH, 'utf8'))
  const transactionId = evidence.phases?.pay?.xrplTransactionId
  if (!transactionId) throw new Error('no XRPL payment recorded — run `pay` first')

  const client = paymentClient()
  const prepared = await client.prepareRequest({ transactionId: `0x${transactionId}` })
  const fee = await getRequestFee(publicClient, CHAIN_ID, prepared.abiEncodedRequest)

  const wallet = createWalletClient({
    account: privateKeyToAccount(evm.privateKey),
    transport: http(RPC),
  })
  const hash = await wallet.writeContract({
    address: registry.fdcHub,
    abi: fdcHubAbi,
    functionName: 'requestAttestation',
    args: [prepared.abiEncodedRequest],
    value: fee,
    chain: null,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`requestAttestation reverted: ${hash}`)
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
  const epochs = await readVotingEpochs(publicClient, CHAIN_ID)
  const round = roundForSubmission(block.timestamp, epochs)

  record('attest', {
    transactionId,
    hash,
    feeWei: fee,
    requestHash: prepared.requestHash,
    abiEncodedRequest: prepared.abiEncodedRequest,
    votingRoundId: round.votingRoundId,
    expectedDurationSeconds: round.expectedDurationSeconds,
  })
}

async function dispatch() {
  const { evm } = secrets()
  const evidence = JSON.parse(readFileSync(EV_PATH, 'utf8'))
  const { votingRoundId, abiEncodedRequest } = evidence.phases?.attest ?? {}
  if (!abiEncodedRequest) throw new Error('no submitted attestation recorded — run `attest` first')

  const round = BigInt(votingRoundId)
  const deadline = Date.now() + 20 * 60_000
  while (!(await isRoundFinalized(publicClient, CHAIN_ID, FDC_PROTOCOL_ID, round))) {
    if (Date.now() > deadline) throw new Error(`round ${round} did not finalize in 20 minutes`)
    await new Promise((r) => setTimeout(r, 15_000))
    process.stdout.write('.')
  }

  // Relay finality and proof RETRIEVABILITY are two different moments: the data
  // availability layer indexes the round minutes later. Never conclude "no proof" from a
  // single absence — poll.
  const client = paymentClient()
  let proof
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      proof = await client.retrieveProof({ votingRoundId: round, requestBytes: abiEncodedRequest })
      break
    } catch {
      await new Promise((r) => setTimeout(r, 15_000))
      process.stdout.write('.')
    }
  }
  if (!proof) throw new Error(`the proof for round ${round} was not retrievable within 10 minutes`)

  const wallet = createWalletClient({
    account: privateKeyToAccount(evm.privateKey),
    transport: http(RPC),
  })
  const call = buildExecuteInstructionCall(deployment, toPaymentProofStruct(proof), XRPL_OWNER)
  const hash = await wallet.writeContract({
    address: call.address,
    abi: masterAccountControllerAbi,
    functionName: 'executeInstruction',
    args: call.args,
    value: call.value,
    chain: null,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`executeInstruction reverted: ${hash}`)

  // Decode InstructionExecuted out of the receipt rather than asserting it happened. A
  // successful receipt says the transaction did not revert; only the event says the
  // controller dispatched THIS instruction for THIS payment.
  let instructionExecuted
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: masterAccountControllerAbi, ...log })
      if (decoded.eventName === 'InstructionExecuted') {
        instructionExecuted = {
          personalAccount: decoded.args.personalAccount,
          transactionId: decoded.args.transactionId,
          paymentReference: decoded.args.paymentReference,
          instructionId: decoded.args.instructionId,
        }
      }
    } catch {
      // Not one of ours — the receipt carries the FAsset transfer's logs too.
    }
  }

  record('dispatch', {
    hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    standardPaymentReference: proof.data.responseBody.standardPaymentReference,
    // Absent means the event was NOT found. The evidence must not imply otherwise.
    instructionExecuted: instructionExecuted ?? null,
    instructionExecutedDecoded: Boolean(instructionExecuted),
  })
}

/** The only thing that may conclude the instruction worked. */
async function verify() {
  const evidence = JSON.parse(readFileSync(EV_PATH, 'utf8'))
  const account = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  const recipientBalance = await publicClient.readContract({
    address: fasset.token,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: [TRANSFER_RECIPIENT],
  })
  const txId = evidence.phases?.pay?.xrplTransactionId
  const replayed = txId
    ? await readTransactionIdUsed(publicClient, deployment, `0x${txId}`)
    : undefined

  record('verify', {
    personalAccountDeployed: account?.deployed,
    personalAccountBalance: account?.fassetBalance,
    recipient: TRANSFER_RECIPIENT,
    recipientBalance,
    transactionIdUsed: replayed,
    note:
      'succeeded requires BOTH the InstructionExecuted event (dispatch phase) and this ' +
      'balance read-back. Neither alone is sufficient.',
  })
}

const MODES = { preflight, fund, pay, attest, dispatch, verify }

async function main() {
  const run = MODES[MODE]
  if (!run) throw new Error(`unknown mode "${MODE}" — one of ${Object.keys(MODES).join(', ')}`)
  const writes = MODE === 'fund' || MODE === 'pay' || MODE === 'attest' || MODE === 'dispatch'
  if (writes && !guardOk()) {
    console.log(
      `REFUSED: "${MODE}" moves real value. It needs BOTH the --broadcast flag and\n` +
        `LIVE_SA_BROADCAST=${BROADCAST_TOKEN}\n` +
        'The secrets file was not opened and nothing was sent.',
    )
    process.exit(0)
  }
  await run()
}

void main().catch((e) => {
  // Message and stack only. A thrown object could carry a wallet or a signed blob on its
  // properties, and `console.error(e)` would print the lot — this is the one place in the
  // script where key material could reach stdout.
  console.error(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e))
  process.exit(1)
})
