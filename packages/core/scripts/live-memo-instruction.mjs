// packages/core/scripts/live-memo-instruction.mjs
// M14-AC4 — the live Coston2 memo-instruction round trip.
//
//   node packages/core/scripts/live-memo-instruction.mjs             # KEYLESS pre-flight
//   node packages/core/scripts/live-memo-instruction.mjs pay --broadcast
//   node packages/core/scripts/live-memo-instruction.mjs attest --broadcast
//   node packages/core/scripts/live-memo-instruction.mjs relay --broadcast
//   node packages/core/scripts/live-memo-instruction.mjs verify       # keyless read-back
//
// DOUBLE GUARD on every write: the `--broadcast` flag AND the env token
// LIVE_MEMO_BROADCAST. Without BOTH, the run records the refusal and STOPS before reading
// the secrets file, constructing a wallet, or sending anything. The default pre-flight pass
// never opens `.secrets/live-run.json`.
//
// SECRETS: the EVM private key and the XRPL seed are read only inside a guarded write mode,
// are never logged, never printed, and never written to evidence.
//
// WHAT THIS RUN DRIVES, and why each leg is the one the milestone claims:
//
//   pay     — an XRPL payment to the CORE VAULT (not an operator wallet) carrying a `0xFF`
//             memo: the whole PackedUserOperation inline. The operation transfers FTestXRP
//             out of the personal account, chosen because its effect is a balance anyone can
//             read back without trusting this script.
//   attest  — the `XRPPayment` attestation, with `proofOwner` BOUND TO OUR OWN EOA. That
//             binding is the milestone's central claim: it makes us the only account that
//             can submit, which is what turns "watch for an event somebody else's relayer
//             may never emit" into a known outcome.
//   relay   — `executeDirectMinting` submitted BY US. `PaymentAlreadyConfirmed` is absorbed
//             as a normal condition, not a failure.
//   verify  — `UserOperationExecuted` AND the transfer's observable effect. Both, because a
//             rate-limited mint MINES SUCCESSFULLY AND MINTS NOTHING, so a receipt proves
//             nothing on its own.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  bindProofToRelayer,
  buildMemoPayment,
  buildUserOperation,
  classifySelfRelayRevert,
  createFdcClient,
  createXrplClient,
  getRequestFee,
  interpretSelfRelayReceipt,
  isRoundFinalized,
  planMemoInstruction,
  planSelfRelay,
  readDirectMintProtocolState,
  readPersonalAccount,
  readTransactionIdUsed,
  readVotingEpochs,
  roundForSubmission,
  smartAccountsFor,
  totalCallValue,
  xrpPaymentFamily,
} from '@flarekit-dev/core'
import {
  FDC_PROTOCOL_ID,
  assetManagerAbi,
  familyFor,
  fdcHubAbi,
  masterAccountControllerAbi,
  registryFor,
  sourceFor,
} from '@flarekit-dev/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-15-coston2-live-memo.json`
const SECRETS_PATH = `${ROOT}/.secrets/live-run.json`
const MODE = process.argv[2] ?? 'preflight'
const BROADCAST_TOKEN = 'i-understand-this-spends-real-xrp-and-cannot-be-undone'

const NETWORK = 'coston2'
const CHAIN_ID = 114
const RPC = 'https://coston2-api.flare.network/ext/C/rpc'
const XRPL_RPC = 'https://xrpl-testnet-api.flare.network'
/** ADDRESS ONLY in the keyless pass — the seed for this account lives in `.secrets`. */
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const SIGNER = getAddress('0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9')

/**
 * The operation: move 1 FTestXRP out of the personal account to the M9 payer — a real
 * address this project controls, so the effect read-back is unambiguous and lands somewhere
 * accounted for. M13's live run used the same recipient for the same reason.
 */
const TRANSFER_RECIPIENT = getAddress('0xdddf991858311597bfd3d125cb342a0d4b56ea0a')
/**
 * 0.4 FTestXRP — deliberately WITHIN the balance the account already holds (0.5).
 *
 * The first attempt at this run moved 1.0, spending the mint it arrives with, and the plan
 * gate refused it: the pre-signature simulation runs against the account as it stands BEFORE
 * the payment. On chain that operation would have succeeded, because `_distributeFAssets`
 * credits the account before `MemoInstructions.execute` runs — the simulation is wrong in the
 * safe direction there, and the refusal message now says so.
 *
 * This run keeps the operation inside what the simulation can genuinely validate, so AC4
 * exercises the whole chain with the gate PASSING rather than bypassed. The mint still lands;
 * it simply is not what this transfer spends.
 */
const TRANSFER_UBA = 400_000n
/**
 * The whole XRPL payment, in drops. XRP drops and FTestXRP UBA are both 6-decimal, so this
 * is 2 XRP arriving as 2_000_000 UBA. Against Coston2's live settings (feeBIPS 25, minimum
 * 100_000) the protocol takes max(5_000, 100_000) = 100_000 and credits 1_900_000 — well
 * clear of the minimum, which is the one threshold where a payment is burned in full.
 */
const PAYMENT_DROPS = 2_000_000n

const jsonify = (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
const guardOk = () =>
  process.argv.includes('--broadcast') && process.env.LIVE_MEMO_BROADCAST === BROADCAST_TOKEN

const publicClient = createPublicClient({ transport: http(RPC, { timeout: 30_000 }) })
const xrplClient = createXrplClient({ jsonRpcUrl: XRPL_RPC })
const deployment = smartAccountsFor(NETWORK)
const registry = registryFor(CHAIN_ID)
const fasset = registry.fassets.XRP

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

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
    existing = {
      milestone: 'M14 — Smart Accounts part two, the direct-minting memo flow',
      network: NETWORK,
      chainId: CHAIN_ID,
      phases: {},
    }
  }
  existing.phases = { ...existing.phases, [phase]: { at: new Date().toISOString(), ...data } }
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(EV_PATH, JSON.stringify(existing, jsonify, 2))
  console.log(`\nrecorded phase "${phase}" -> ${EV_PATH}`)
}

const readEvidence = () => JSON.parse(readFileSync(EV_PATH, 'utf8'))

const balanceOf = (who) =>
  publicClient.readContract({
    address: fasset.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [who],
  })

/**
 * Everything the gate needs, read live, plus the gate's own verdict.
 *
 * Shared by the pre-flight and the pay phase so the memo that is SIGNED is the memo that was
 * SHOWN — building it twice from the same inputs is how the two drift.
 */
async function buildPlan() {
  const protocol = await readDirectMintProtocolState({ client: publicClient, chainId: CHAIN_ID })
  const account = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  if (!account) throw new Error('the personal account could not be derived')
  if (account.nonce === undefined) throw new Error('the account nonce could not be read')

  const callData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [TRANSFER_RECIPIENT, TRANSFER_UBA],
  })
  const intent = {
    calls: [{ target: fasset.token, value: 0n, data: callData }],
    // The PAYER framing: this is the payment we are about to sign, used exactly as given.
    totalUBA: PAYMENT_DROPS,
    nonce: account.nonce,
  }

  const replayed = undefined
  const fees = {
    feeBIPS: protocol.feeSettings.mintingFeeBIPS,
    minimumFeeUBA: protocol.feeSettings.minimumMintingFeeUBA,
    assetManagerExecutorFeeUBA: protocol.feeSettings.executorFeeUBA,
  }

  // R7 — simulate the inner call BEFORE anything is signed. The controller runs
  // `_personalAccount.call{value: msg.value}(userOp.callData)`, so the honest simulation is
  // that exact call with `from` set to the controller: the only caller the account accepts.
  // A revert here is a refusal; a simulation that cannot be performed is a stated warning
  // and never a silent pass.
  // Built with the SAME builder the plan uses internally, so what is simulated is what will
  // be dispatched rather than a re-encoding that could differ.
  const userOperation = buildUserOperation({
    sender: account.address,
    nonce: account.nonce,
    calls: intent.calls,
  })
  let simulation
  try {
    await publicClient.call({
      account: deployment.masterAccountController,
      to: account.address,
      data: userOperation.callData,
      value: totalCallValue(intent.calls),
    })
    simulation = { ok: true }
  } catch (error) {
    simulation = { ok: false, reason: String(error?.shortMessage ?? error?.message).slice(0, 200) }
  }

  const planResult = planMemoInstruction({
    deployment,
    personalAccount: account,
    fees,
    intent,
    replayed,
    ...(simulation ? { simulation } : {}),
  })

  return { protocol, account, fees, intent, planResult, simulation }
}

async function preflight() {
  const { protocol, account, fees, planResult, simulation } = await buildPlan()
  const xrplInfo = await xrplClient.getAccountInfo(XRPL_OWNER)

  const summary = {
    xrplOwner: { address: XRPL_OWNER, balanceDrops: xrplInfo.balanceDrops },
    signer: { address: SIGNER, nativeWei: await publicClient.getBalance({ address: SIGNER }) },
    personalAccount: {
      address: account.address,
      deployed: account.deployed,
      nonce: account.nonce,
      pinnedExecutor: account.pinnedExecutor,
      fassetBalance: account.fassetBalance,
    },
    coreVault: protocol.xrplDestination,
    fassetSymbol: protocol.fAssetSymbol,
    fees,
    mintingPaused: protocol.mintingPaused,
    emergencyPaused: protocol.emergencyPaused,
    paymentDrops: PAYMENT_DROPS,
    transfer: { token: fasset.token, to: TRANSFER_RECIPIENT, uba: TRANSFER_UBA },
    simulation,
    gate: planResult.ok
      ? {
          ok: true,
          opcode: `0x${planResult.plan.opcode.toString(16).toUpperCase()}`,
          memoBytes: (planResult.plan.memo.length - 2) / 2,
          memo: planResult.plan.memo,
          totalUBA: planResult.plan.totalUBA,
          mintingFeeUBA: planResult.plan.mintingFeeUBA,
          creditedUBA: planResult.plan.creditedUBA,
          attachValueWei: planResult.plan.attachValueWei,
          warnings: planResult.plan.warnings,
        }
      : { ok: false, refusal: planResult.refusal },
    recipientBalanceBefore: await balanceOf(TRANSFER_RECIPIENT),
  }

  record('preflight', summary)
  console.log(JSON.stringify(summary, jsonify, 2))
  if (!planResult.ok) {
    console.log(`\nGATE REFUSED: ${planResult.refusal.code} — nothing will be signed.`)
  }
}

/** Sign and submit the XRPL payment carrying the memo. THE IRREVERSIBLE STEP. */
async function pay() {
  const { xrpl: xrplSecret } = secrets()
  const { protocol, planResult } = await buildPlan()
  if (!planResult.ok) throw new Error(`the gate refuses this operation: ${planResult.refusal.code}`)

  const info = await xrplClient.getAccountInfo(XRPL_OWNER)
  const ledgerIndex = await xrplClient.getCurrentLedgerIndex()
  const unsigned = buildMemoPayment({
    account: XRPL_OWNER,
    destination: protocol.xrplDestination,
    amountDrops: PAYMENT_DROPS,
    memo: planResult.plan.memo,
    sequence: info.sequence,
    lastLedgerSequence: ledgerIndex + 40,
    ledgerFeeDrops: 12n,
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
  console.log(`submitted ${hash} — engine_result ${engineResult}`)
  if (engineResult && !String(engineResult).startsWith('tes')) {
    throw new Error(`the ledger refused the payment: ${engineResult}`)
  }

  // Validated is not the same as submitted. Poll until the ledger says so.
  let state
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((r) => setTimeout(r, 4_000))
    state = await xrplClient.getTransaction(hash)
    if (state?.validated) break
    process.stdout.write('.')
  }

  record('pay', {
    xrplTransactionId: hash,
    validated: state?.validated ?? false,
    succeeded: state?.succeeded ?? false,
    destination: unsigned.Destination,
    amountDrops: unsigned.Amount,
    memo: planResult.plan.memo,
    memoBytes: (planResult.plan.memo.length - 2) / 2,
    opcode: `0x${planResult.plan.opcode.toString(16).toUpperCase()}`,
    expectedCreditedUBA: planResult.plan.creditedUBA,
  })
}

function xrpPaymentClient() {
  return createFdcClient({
    family: xrpPaymentFamily,
    source: sourceFor(familyFor('XRPPayment'), NETWORK, registry.services.xrplSourceId),
    services: registry.services,
  })
}

/** Request the XRPPayment attestation, BOUND TO OUR EOA. */
async function attest() {
  const { evm } = secrets()
  const evidence = readEvidence()
  const transactionId = evidence.phases?.pay?.xrplTransactionId
  if (!transactionId) throw new Error('no XRPL payment recorded — run `pay` first')

  // The binding. `bindProofToRelayer` refuses the zero address, because an unbound proof is
  // submittable by anyone and the whole point of self-relaying is to know the outcome.
  const bound = bindProofToRelayer({ transactionId: `0x${transactionId}`, relayer: SIGNER })
  console.log(bound.notes.join('\n'))

  const client = xrpPaymentClient()
  const prepared = await client.prepareRequest(bound.request)
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
  const round = roundForSubmission(block.timestamp, await readVotingEpochs(publicClient, CHAIN_ID))

  record('attest', {
    transactionId,
    proofOwner: bound.request.proofOwner,
    hash,
    feeWei: fee,
    requestHash: prepared.requestHash,
    abiEncodedRequest: prepared.abiEncodedRequest,
    votingRoundId: round.votingRoundId,
  })
}

/** Retrieve the proof and SELF-RELAY the mint. */
async function relay() {
  const { evm } = secrets()
  const evidence = readEvidence()
  const { votingRoundId, abiEncodedRequest, transactionId } = evidence.phases?.attest ?? {}
  if (!abiEncodedRequest) throw new Error('no submitted attestation recorded — run `attest` first')

  const round = BigInt(votingRoundId)
  const deadline = Date.now() + 25 * 60_000
  while (!(await isRoundFinalized(publicClient, CHAIN_ID, FDC_PROTOCOL_ID, round))) {
    if (Date.now() > deadline) throw new Error(`round ${round} did not finalize in 25 minutes`)
    await new Promise((r) => setTimeout(r, 15_000))
    process.stdout.write('.')
  }

  // Finality and RETRIEVABILITY are different moments — the data availability layer indexes
  // the round minutes later. Never conclude "no proof" from a single absence.
  const client = xrpPaymentClient()
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
  if (!proof) throw new Error(`the proof for round ${round} was not retrievable`)

  const txId = `0x${String(transactionId).toLowerCase()}`
  if ((await readTransactionIdUsed(publicClient, deployment, txId)) === true) {
    record('relay', {
      transactionId: txId,
      relayedByUs: false,
      note:
        'This payment was already consumed before we submitted. With proofOwner bound to our ' +
        'EOA nobody else could have used THIS proof, so the payment was confirmed by another ' +
        'route. Absorbed as a normal condition; run `verify` to read what actually happened.',
    })
    console.log('already consumed — not sending. Run `verify`.')
    return
  }

  const memo = evidence.phases?.pay?.memo
  const selfRelay = planSelfRelay({
    assetManager: fasset.assetManager,
    proof,
    relayer: SIGNER,
    memo,
    valueWei: 0n,
  })
  if (!selfRelay.ok) {
    record('relay', { transactionId: txId, relayedByUs: false, refusal: selfRelay.refusal })
    throw new Error(`self-relay refused: ${selfRelay.refusal.code} — ${selfRelay.refusal.message}`)
  }
  console.log(selfRelay.plan.notes.join('\n'))

  const wallet = createWalletClient({
    account: privateKeyToAccount(evm.privateKey),
    transport: http(RPC),
  })

  let hash
  try {
    hash = await wallet.writeContract({
      address: selfRelay.plan.call.address,
      abi: assetManagerAbi,
      functionName: selfRelay.plan.call.functionName,
      args: selfRelay.plan.call.args,
      value: selfRelay.plan.call.value,
      chain: null,
    })
  } catch (error) {
    // A revert is classified, never rendered as a bare failure. PaymentAlreadyConfirmed in
    // particular is a normal condition to absorb.
    const name = error?.cause?.data?.errorName ?? error?.walk?.()?.data?.errorName
    const outcome = classifySelfRelayRevert(name, error?.cause?.data?.args)
    record('relay', { transactionId: txId, relayedByUs: false, outcome, errorName: name ?? null })
    console.log(`relay did not send: ${outcome.kind} — ${outcome.reason ?? ''}`)
    return
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const events = []
  for (const log of receipt.logs) {
    for (const abi of [masterAccountControllerAbi, assetManagerAbi]) {
      try {
        const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics })
        events.push({ eventName: decoded.eventName, args: decoded.args, address: log.address })
        break
      } catch {
        /* not this ABI's event */
      }
    }
  }

  // The receipt STATUS is not consulted for the outcome: a rate-limited mint mines
  // successfully and mints nothing. The events decide.
  const outcome = interpretSelfRelayReceipt(
    events.map((e) => ({ eventName: e.eventName, args: e.args ?? {} })),
  )

  record('relay', {
    transactionId: txId,
    relayedByUs: true,
    hash,
    receiptStatus: receipt.status,
    gasUsed: receipt.gasUsed,
    events: events.map((e) => ({ eventName: e.eventName, address: e.address, args: e.args })),
    outcome,
  })
  console.log(`relay outcome: ${outcome.kind}`)
}

/** Keyless read-back: the event AND the observable effect. Both are required. */
async function verify() {
  const evidence = readEvidence()
  const account = await readPersonalAccount(publicClient, deployment, XRPL_OWNER, fasset.token)
  const before = evidence.phases?.preflight?.recipientBalanceBefore
  const recipientNow = await balanceOf(TRANSFER_RECIPIENT)
  const moved = before === undefined ? undefined : recipientNow - BigInt(before)

  // Read `UserOperationExecuted` FROM THE CHAIN, not only from our own relay receipt.
  //
  // The first version of this phase looked only at the receipt we produced, and reported
  // `succeeded: false` for a run whose every number was correct — because a third party
  // relayed it first and we therefore had no receipt to decode. That was the script being
  // wrong about the chain.
  //
  // Binding `proofOwner` makes OUR PROOF ours alone; it does not make the PAYMENT ours. The
  // XRPL transaction is public, so anyone may request their own attestation of it with their
  // own proofOwner and submit that. Whether we relayed is a genuinely separate fact from
  // whether the operation ran — M13 learned the same thing about `executeInstruction` — so
  // both are recorded and neither is inferred from the other.
  // Coston2's public RPC caps `eth_getLogs` at 30 blocks per request, so the range is walked
  // BACKWARD from the head in windows: the mint we are looking for is the most recent one,
  // and scanning from the newest end finds it in a handful of calls instead of hundreds.
  const event = masterAccountControllerAbi.find(
    (f) => f.type === 'event' && f.name === 'UserOperationExecuted',
  )
  const WINDOW = 30n
  const head = await publicClient.getBlockNumber()
  let onChain
  let scanned = 0n
  for (let end = head; end > head - 3_000n && !onChain; end -= WINDOW) {
    const start = end - WINDOW + 1n
    const logs = await publicClient.getLogs({
      address: deployment.masterAccountController,
      event,
      args: { personalAccount: account?.address },
      fromBlock: start < 0n ? 0n : start,
      toBlock: end,
    })
    onChain = logs.at(-1)
    scanned += WINDOW
  }
  const userOperationExecuted = onChain
    ? { personalAccount: onChain.args.personalAccount, nonce: onChain.args.nonce }
    : undefined
  const relayedByUs = evidence.phases?.relay?.relayedByUs === true

  const result = {
    personalAccount: account?.address,
    personalAccountNonceNow: account?.nonce,
    personalAccountFassetNow: account?.fassetBalance,
    recipient: TRANSFER_RECIPIENT,
    recipientBalanceBefore: before,
    recipientBalanceNow: recipientNow,
    movedUBA: moved,
    expectedMovedUBA: TRANSFER_UBA,
    // BOTH, or it is not `succeeded`. The event alone is a receipt; the balance alone could
    // be any other transfer. Together they are the instruction having actually run.
    userOperationExecuted: userOperationExecuted ?? null,
    userOperationExecutedTx: onChain?.transactionHash ?? null,
    userOperationExecutedBlock: onChain?.blockNumber ?? null,
    blocksScannedForEvent: scanned,
    effectObserved: moved === TRANSFER_UBA,
    succeeded: Boolean(userOperationExecuted) && moved === TRANSFER_UBA,
    // Separate from `succeeded`, deliberately. The operation running and this kit being the
    // one that submitted it are two different claims, and only one of them is required.
    relayedByUs,
    transactionIdUsed: evidence.phases?.attest?.transactionId
      ? await readTransactionIdUsed(
          publicClient,
          deployment,
          `0x${String(evidence.phases.attest.transactionId).toLowerCase()}`,
        )
      : undefined,
  }

  record('verify', result)
  console.log(JSON.stringify(result, jsonify, 2))
  console.log(
    result.succeeded
      ? '\nSUCCEEDED — the operation ran AND its effect is observed on chain.'
      : '\nNOT succeeded. Both the event and the effect are required; see the record above.',
  )
}

const MODES = { preflight, pay, attest, relay, verify }
const run = MODES[MODE]
if (!run) {
  console.error(`unknown mode "${MODE}". One of: ${Object.keys(MODES).join(', ')}`)
  process.exit(1)
}
if (MODE !== 'preflight' && MODE !== 'verify' && !guardOk()) {
  console.error(
    `refusing to run "${MODE}": needs BOTH --broadcast and LIVE_MEMO_BROADCAST=<token>.\n` +
      'Nothing was read from .secrets and nothing was sent.',
  )
  process.exit(1)
}
await run()
