/**
 * The one FTSO call that spends. Kept in its own module deliberately.
 *
 * `offerIncentive` moves real value — about 0.37 C2FLR at a 1% range increase —
 * and is irreversible. Everything else M4-R11 needs is read-only and lives in
 * `live-ftso-run.mjs`, which never imports this file unless
 * `--submit-incentive` is passed. The separation is structural rather than a
 * flag inside a long script, so nobody reaches this code by accident and a
 * reader can see the whole spending surface on one screen.
 *
 * **This path has never been executed.** The amount it sends is the one
 * `verifyOfferAmount` dry-ran against the live contract, which is the part that
 * could be wrong about a price; the submission mechanics below are unexercised
 * and should be watched by a human on first run.
 */
import { readFileSync } from 'node:fs'
import { createWalletClient, decodeEventLog, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  chainFor,
  fastUpdateIncentiveManagerAbi,
  ftsoRegistryFor,
} from '@flarekit-dev/contracts'
import { confirmIncentiveEffect } from '../dist/index.js'

/**
 * Submit one incentive offer and confirm what it bought.
 *
 * Confirmation reads `getRange()` at the transaction's **own** block against the
 * one before it. The effect decays, so a later read showing no change is the
 * incentive ending rather than the offer failing — reading "now" would assert a
 * negative fact about a transaction that demonstrably succeeded.
 */
export async function submitIncentive({ root, chainId, reader, quote }) {
  const chain = chainFor(chainId)
  const secrets = JSON.parse(readFileSync(`${root}/.secrets/live-run.json`, 'utf8'))
  const account = privateKeyToAccount(secrets.evm.privateKey)
  const wallet = createWalletClient({ account, transport: http(chain.rpcUrl) })
  const address = ftsoRegistryFor(chainId).fastUpdateIncentiveManager

  console.log(
    `SPENDING ${quote.offerAmountWei} wei (~${Number(quote.offerAmountWei) / 1e18} ${chain.nativeAsset ?? 'native'}) from ${account.address}`,
  )

  const hash = await wallet.writeContract({
    address,
    abi: fastUpdateIncentiveManagerAbi,
    functionName: 'offerIncentive',
    args: [{ rangeIncrease: quote.rangeIncrease, rangeLimit: quote.rangeLimit }],
    value: quote.offerAmountWei,
    chain: null,
  })
  const receipt = await reader.waitForTransactionReceipt({ hash })

  // The event is the chain's account of what was bought. The caller's intent is
  // not evidence, so the confirmation reads the log rather than the quote.
  //
  // Decoded through the ABI, never by indexing into `topics`. Only
  // `rewardEpochId` is indexed on `IncentiveOffered`; `rangeIncrease`,
  // `sampleSizeIncrease` and `offerAmount` are all in `data`. An earlier version
  // read `topics[1]` as the range increase and got the reward epoch id — 5902
  // against a real increase of 2433889152438200450873670154321 — which reported
  // `confirmed: false` for an offer the chain shows worked exactly as asked.
  // Rendering a successful transaction as unconfirmed is the same class of lie
  // as rendering an unknown as a failure.
  const decodedLog = receipt.logs
    .filter((entry) => entry.address.toLowerCase() === address.toLowerCase())
    .map((entry) => {
      try {
        return decodeEventLog({ abi: fastUpdateIncentiveManagerAbi, ...entry })
      } catch {
        return undefined
      }
    })
    .find((entry) => entry?.eventName === 'IncentiveOffered')

  const log = decodedLog
  if (!log) {
    return {
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      confirmed: false,
      note: 'The transaction is on chain but carried no decodable IncentiveOffered log from the manager, so what it bought could not be established here. That is an unknown, not a failed offer.',
    }
  }

  const decoded = {
    rangeIncrease: log.args.rangeIncrease,
    sampleSizeIncrease: log.args.sampleSizeIncrease,
    offerAmount: log.args.offerAmount,
  }
  const effect = await confirmIncentiveEffect({
    reader,
    chainId,
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
    event: decoded,
  })

  return {
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    explorer: `${chain.explorerUrl}/tx/${hash}`,
    measuredRangeDelta: effect.measuredRangeDelta.toString(),
    eventRangeIncrease: effect.eventRangeIncrease.toString(),
    eventSampleSizeIncrease: effect.eventSampleSizeIncrease.toString(),
    confirmed: effect.confirmed,
  }
}
