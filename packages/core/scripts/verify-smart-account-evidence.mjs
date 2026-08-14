#!/usr/bin/env node
/**
 * M13 evidence back-fill — KEYLESS, read-only, no broadcast path at all.
 *
 * The honest-rendering review of 2026-08-14 found three values the surfaces render that no
 * recorded run had actually observed:
 *
 * 1. `paused` — the mock carries `false` for BOTH networks and the card renders it as
 *    "Dispatch · Open", but neither the probe nor the live script ever called `isPaused`.
 *    Coston2 is corroborated indirectly (a dispatch succeeded, so it was not paused then);
 *    Flare mainnet was corroborated by nothing.
 * 2. `xrplLedgerIndex` for both runs — recorded in the mock, present in no evidence file.
 * 3. The DEPOSIT's dispatch identifiers (`dispatchedBy`, `dispatchTx`, `dispatchBlock`).
 *    They sit in the evidence JSON under a `dispatchDeposit` phase that no script mode
 *    writes — hand-authored, and its round-second timestamp is the tell. The paired EFFECT
 *    (500 000 shares) is machine-recorded by `verifyDeposit`, so "executed, but not by us"
 *    was always sound; only the identifiers under it lacked provenance.
 *
 * Rather than soften what the surfaces say, this reads all three off the chain and writes
 * `.thoughts/verification/2026-08-14-m13-evidence-backfill.json`. Every value the mock
 * carries then traces to a machine-written record.
 *
 * Usage: `node packages/core/scripts/verify-smart-account-evidence.mjs`
 */

import { writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { FLARE_NETWORKS, masterAccountControllerAbi, smartAccountsFor } from '@flare-kit/contracts'

const XRPL_TESTNET_RPC = FLARE_NETWORKS.coston2.underlying.jsonRpcUrl

/** The deposit dispatch the operator's backend sent, as recorded by hand. Re-read here. */
const DEPOSIT_DISPATCH_TX = '0x53aad8df00e90fc6bd2917a68756d2fb2de0ce5875f46f3e35a3f96851173c6d'
const XRPL_RUNS = {
  transfer: 'E4385C7AD4E316DF269BFBB96A15204CC68E549005228BB6B1808595DC04117D',
  deposit: 'AA78F5FBD0D4EEBA64AE4DE691A6F02E26F8BAB70F8B74FE2B8144B255860FCF',
}

/** `{ unavailable }` on throw — this script must never fabricate the value it exists to source. */
async function attempt(read) {
  try {
    return { value: await read() }
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message.split('\n')[0] : String(error) }
  }
}

async function readPaused(networkKey) {
  const chain = FLARE_NETWORKS[networkKey]
  const client = createPublicClient({ transport: http(chain.rpcUrl, { timeout: 20_000, retryCount: 2 }) })
  const result = await attempt(() =>
    client.readContract({
      address: smartAccountsFor(networkKey).masterAccountController,
      abi: masterAccountControllerAbi,
      functionName: 'isPaused',
    }),
  )
  return { chainId: chain.id, controller: smartAccountsFor(networkKey).masterAccountController, isPaused: result }
}

async function readDepositDispatch() {
  const client = createPublicClient({
    transport: http(FLARE_NETWORKS.coston2.rpcUrl, { timeout: 20_000, retryCount: 2 }),
  })
  const receipt = await attempt(() => client.getTransactionReceipt({ hash: DEPOSIT_DISPATCH_TX }))
  if (receipt.unavailable) return { transactionHash: DEPOSIT_DISPATCH_TX, receipt }
  return {
    transactionHash: DEPOSIT_DISPATCH_TX,
    // `from` is the whole point: it is who actually dispatched, and the surface renders it.
    dispatchedBy: receipt.value.from,
    blockNumber: receipt.value.blockNumber.toString(),
    status: receipt.value.status,
    logCount: receipt.value.logs.length,
  }
}

async function readXrplLedgerIndex(transactionId) {
  const response = await fetch(XRPL_TESTNET_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'tx', params: [{ transaction: transactionId, binary: false }] }),
  })
  const body = await response.json()
  const result = body?.result
  if (!result || result.status === 'error') {
    return { unavailable: result?.error_message ?? result?.error ?? 'the XRPL node did not answer' }
  }
  return {
    ledgerIndex: result.ledger_index ?? result.tx_json?.ledger_index,
    validated: result.validated === true,
    // The ledger close time the proof window is measured from — Ripple epoch, +946684800 for unix.
    closeTimeIso: result.close_time_iso ?? undefined,
    date: result.tx_json?.date ?? result.date,
  }
}

const [coston2Paused, flarePaused, depositDispatch, transferLedger, depositLedger] = await Promise.all([
  readPaused('coston2'),
  readPaused('flare'),
  readDepositDispatch(),
  attempt(() => readXrplLedgerIndex(XRPL_RUNS.transfer)),
  attempt(() => readXrplLedgerIndex(XRPL_RUNS.deposit)),
])

const record = {
  milestone: 'M13 — evidence back-fill for values the surfaces render',
  reason:
    'The 2026-08-14 honest-rendering review found `paused`, `xrplLedgerIndex` and the deposit ' +
    'dispatch identifiers rendered without a machine-written source. This file is that source.',
  readAt: new Date().toISOString(),
  keyless: true,
  pausedState: { coston2: coston2Paused, flare: flarePaused },
  depositDispatch,
  xrplLedgerIndex: { transfer: transferLedger, deposit: depositLedger },
}

// The same absolute-root convention `probe-smart-accounts.mjs` uses — these scripts are run
// by hand from the repo and never bundled.
const ROOT = '/Users/abu/dev/hackathon/flare'
const OUT = `${ROOT}/.thoughts/verification/2026-08-14-m13-evidence-backfill.json`
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`)
console.log(JSON.stringify(record, null, 2))
