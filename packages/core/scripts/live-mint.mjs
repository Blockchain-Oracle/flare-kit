/**
 * A real FTestXRP mint on Coston2, paid from XRPL Testnet.
 *
 * Dev-only tooling. It uses `xrpl` to sign, which the shipped package never
 * does — core produces the unsigned payment and a wallet signs it. Everything
 * else here calls the real kit.
 *
 * Writes evidence to .thoughts/verification/. Never prints a key.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Client as XrplClientLib, Wallet } from 'xrpl'
import {
  assetManagerAbi,
  fassetAbi,
  fdcHubAbi,
  relayAbi,
  flareSystemsManagerAbi,
  registryFor,
  chainFor,
  votingRoundIdAt,
  FDC_PROTOCOL_ID,
} from '@flare-kit/contracts'
import {
  createFdcClient,
  createXrplClient,
  toProofStruct,
  readDirectMintProtocolState,
  quoteDirectMint,
  createDirectMintOperation,
  buildPaymentForQuote,
  attachXrplPayment,
  formatExact,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const AMOUNT_XRP = process.argv[2] ?? '25'

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const reg = registryFor(CHAIN_ID)
const deployment = reg.fassets.XRP

const evidence = { startedAt: new Date().toISOString(), network: chain.name, chainId: CHAIN_ID, steps: [] }
const log = (step, data = {}) => {
  const entry = { step, at: new Date().toISOString(), ...data }
  evidence.steps.push(entry)
  console.log(`[${step}]`, JSON.stringify(data))
}
const save = () => {
  mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
  writeFileSync(
    `${ROOT}/.thoughts/verification/2026-08-04-coston2-live-mint.json`,
    JSON.stringify(evidence, null, 2),
  )
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const account = privateKeyToAccount(secrets.evm.privateKey)
const viemChain = {
  id: CHAIN_ID,
  name: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: { default: { http: [chain.rpcUrl] } },
}
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })
const xrplRead = createXrplClient({ jsonRpcUrl: 'https://s.altnet.rippletest.net:51234/' })
const fdc = createFdcClient({ services: reg.services })

try {
  // 1 — the live protocol snapshot, then a quote from it.
  const state = await readDirectMintProtocolState({ client: publicClient, chainId: CHAIN_ID })
  log('protocol-state', {
    fAsset: state.fAssetSymbol,
    coreVault: state.xrplDestination,
    feeBIPS: String(state.feeSettings.mintingFeeBIPS),
    minimumFeeUBA: String(state.feeSettings.minimumMintingFeeUBA),
    executorFeeUBA: String(state.feeSettings.executorFeeUBA),
    mintingPaused: state.mintingPaused,
  })

  const intent = { amountXrp: AMOUNT_XRP, recipient: account.address, xrplAccount: secrets.xrpl.address }
  const quote = quoteDirectMint(state, intent, Date.now())
  log('quote', {
    send: formatExact(quote.input),
    receive: formatExact(quote.mintedEstimate),
    mintingFee: formatExact(quote.mintingFee),
    executorFee: formatExact(quote.executorFee),
    canProceed: quote.canProceed,
    blockedReason: quote.blockedReason ?? null,
  })
  if (!quote.canProceed) throw new Error(`quote refused: ${quote.blockedReason}`)

  let operation = createDirectMintOperation({ quote, intent, network: CHAIN_ID, now: Date.now() })
  log('operation-created', { id: operation.id, state: operation.state })

  // 2 — the unsigned payment from core; the wallet signs it.
  const info = await xrplRead.getAccountInfo(secrets.xrpl.address)
  const ledgerNow = await xrplRead.getCurrentLedgerIndex()
  const unsigned = buildPaymentForQuote(quote, {
    account: secrets.xrpl.address,
    sequence: info.sequence,
    lastLedgerSequence: ledgerNow + 60,
    feeDrops: 12n,
    now: Date.now(),
  })
  log('unsigned-payment', {
    destination: unsigned.Destination,
    amountDrops: unsigned.Amount,
    memo: unsigned.Memos[0].Memo.MemoData,
  })

  const xrplNet = new XrplClientLib('wss://s.altnet.rippletest.net:51233')
  await xrplNet.connect()
  const wallet = Wallet.fromSeed(secrets.xrpl.seed)
  const prepared = await xrplNet.autofill({ ...unsigned })
  const signed = wallet.sign(prepared)
  const submitted = await xrplNet.submitAndWait(signed.tx_blob)
  await xrplNet.disconnect()

  const xrplTxId = signed.hash
  const xrplResult = submitted.result.meta?.TransactionResult
  log('xrpl-payment', {
    hash: xrplTxId,
    result: xrplResult,
    ledger: submitted.result.ledger_index,
    explorer: `${chain.underlying.explorerBaseUrl}/transactions/${xrplTxId}`,
  })
  if (xrplResult !== 'tesSUCCESS') throw new Error(`XRPL payment did not apply: ${xrplResult}`)

  operation = attachXrplPayment(operation, { xrplTxId, at: Date.now() })
  log('operation-submitted', { state: operation.state })

  // 3 — three confirmations, then the attestation request.
  log('waiting-finality', { need: 3 })
  for (let i = 0; i < 40; i += 1) {
    await sleep(5_000)
    const tx = await xrplRead.getTransaction(xrplTxId)
    const head = await xrplRead.getCurrentLedgerIndex()
    if (tx.validated && tx.ledgerIndex && head - tx.ledgerIndex >= 3) {
      log('xrpl-final', { ledger: tx.ledgerIndex, head, confirmations: head - tx.ledgerIndex })
      break
    }
  }

  const requestBytes = await fdc.prepareRequest({
    transactionId: xrplTxId.startsWith('0x') ? xrplTxId : `0x${xrplTxId}`,
    proofOwner: account.address,
  })
  log('fdc-request-prepared', { bytes: `${requestBytes.slice(0, 26)}…` })

  const fee = await publicClient.readContract({
    address: reg.fdcRequestFeeConfigurations,
    abi: fdcHubAbi,
    functionName: 'getRequestFee',
    args: [requestBytes],
  })
  const requestHash = await walletClient.writeContract({
    address: reg.fdcHub,
    abi: fdcHubAbi,
    functionName: 'requestAttestation',
    args: [requestBytes],
    value: fee,
  })
  const requestReceipt = await publicClient.waitForTransactionReceipt({ hash: requestHash })
  const block = await publicClient.getBlock({ blockNumber: requestReceipt.blockNumber })
  log('fdc-request-submitted', {
    hash: requestHash,
    feeWei: String(fee),
    explorer: `${chain.explorerUrl}/tx/${requestHash}`,
  })

  // 4 — derive the round from the block timestamp, using on-chain epoch params.
  const [firstTs, epochSeconds] = await Promise.all([
    publicClient.readContract({ address: reg.flareSystemsManager, abi: flareSystemsManagerAbi, functionName: 'firstVotingRoundStartTs' }),
    publicClient.readContract({ address: reg.flareSystemsManager, abi: flareSystemsManagerAbi, functionName: 'votingEpochDurationSeconds' }),
  ])
  const votingRoundId = votingRoundIdAt(block.timestamp, firstTs, epochSeconds)
  log('fdc-round', { votingRoundId: String(votingRoundId), blockTimestamp: String(block.timestamp) })

  for (let i = 0; i < 60; i += 1) {
    const finalized = await publicClient.readContract({
      address: reg.relay, abi: relayAbi, functionName: 'isFinalized',
      args: [BigInt(FDC_PROTOCOL_ID), votingRoundId],
    })
    if (finalized) { log('fdc-round-finalized', { votingRoundId: String(votingRoundId) }); break }
    await sleep(10_000)
  }

  let proof
  for (let i = 0; i < 30; i += 1) {
    try { proof = await fdc.retrieveProof({ votingRoundId, requestBytes }); break }
    catch { await sleep(10_000) }
  }
  if (!proof) throw new Error('no proof after waiting')
  log('fdc-proof', {
    merkleNodes: proof.merkleProof.length,
    receivedAmount: String(proof.data.responseBody.receivedAmount),
    sourceAddress: proof.data.responseBody.sourceAddress,
    lowestUsedTimestamp: String(proof.data.lowestUsedTimestamp),
  })

  // 5 — execute, then read the credited balance from the token itself.
  const before = await publicClient.readContract({
    address: deployment.token, abi: fassetAbi, functionName: 'balanceOf', args: [account.address],
  })
  const execHash = await walletClient.writeContract({
    address: deployment.assetManager,
    abi: assetManagerAbi,
    functionName: 'executeDirectMinting',
    args: [toProofStruct(proof)],
    value: 0n,
  })
  const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execHash })
  log('execute-direct-minting', {
    hash: execHash,
    status: execReceipt.status,
    explorer: `${chain.explorerUrl}/tx/${execHash}`,
  })

  for (const entry of execReceipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: assetManagerAbi, data: entry.data, topics: entry.topics })
      if (decoded.eventName?.startsWith('DirectMinting')) {
        log('event', { name: decoded.eventName, args: JSON.parse(JSON.stringify(decoded.args, (_k, v) => typeof v === 'bigint' ? String(v) : v)) })
      }
    } catch { /* not one of ours */ }
  }

  const after = await publicClient.readContract({
    address: deployment.token, abi: fassetAbi, functionName: 'balanceOf', args: [account.address],
  })
  log('fasset-credited', {
    symbol: state.fAssetSymbol,
    before: String(before),
    after: String(after),
    creditedUBA: String(after - before),
  })

  evidence.outcome = 'succeeded'
} catch (error) {
  evidence.outcome = 'incomplete'
  evidence.error = String(error).split('\n').slice(0, 4).join(' ')
  console.error('RUN FAILED:', evidence.error)
} finally {
  evidence.finishedAt = new Date().toISOString()
  save()
  console.log('\nevidence -> .thoughts/verification/2026-08-04-coston2-live-mint.json')
}
