import { type SmartAccountsDeployment, masterAccountControllerAbi } from '@flare-kit/contracts'
import { type PublicClient, getAbiItem } from 'viem'
import { decodePaymentReference } from './payment-reference.js'

/**
 * The `InstructionExecuted` backfill scan (`R-SA-009`).
 *
 * "Watchers must backfill from a safe historical boundary and have explicit timeouts;
 * installing an event listener after payment is insufficient." A listener attached when the
 * screen opens sees nothing that already happened, and the interesting case — an
 * instruction that dispatched while the user was away — is exactly the one it misses.
 *
 * Two protocol facts shape this:
 *
 * 1. `InstructionExecuted` indexes `personalAccount`, `transactionId` AND
 *    `paymentReference`. This is the OPPOSITE of M1's direct-minting events, which index
 *    nothing and forced correlation through a receipt decode. Here a topic filter is
 *    correct, and it is what makes a backfill affordable at all.
 * 2. Coston2's RPC caps `eth_getLogs` to roughly 30 blocks per call (the M8 rule), so the
 *    scan pages in bounded windows rather than asking for a range the node will refuse.
 *
 * An INCOMPLETE scan returns `undefined`, never `[]`. An empty array is a claim — "the
 * chain has no instruction for this account in this window" — and a catch that swallowed a
 * failed read into `[]` would fabricate that claim while fabricating no data. That is the
 * exact bug the M12 review gate found in proposal discovery.
 */

const CHUNK_BLOCKS = 25n
/** A bound on the whole scan, so a slow node degrades to `unavailable` rather than hanging. */
const DEFAULT_MAX_CHUNKS = 40

// Taken FROM the controller ABI rather than restated. Writing the signature out again
// would be one protocol fact in two syntaxes across two packages, free to drift.
const INSTRUCTION_EXECUTED = getAbiItem({
  abi: masterAccountControllerAbi,
  name: 'InstructionExecuted',
})

export interface ObservedInstruction {
  readonly personalAccount: `0x${string}`
  readonly transactionId: `0x${string}`
  readonly paymentReference: `0x${string}`
  /**
   * `undefined` where the log carried no id. Not defaulted to `0`, which is a REAL
   * built-in instruction (`collateralReservation`) rather than a null.
   */
  readonly instructionId: number | undefined
  /** The action name, where the kit recognises the instruction. */
  readonly action: string | undefined
  /** `undefined` on a pending log, rather than an invented block 0 / zero hash. */
  readonly blockNumber: bigint | undefined
  readonly transactionHash: `0x${string}` | undefined
}

export interface ScanInput {
  readonly client: PublicClient
  readonly deployment: SmartAccountsDeployment
  readonly personalAccount: `0x${string}`
  /** The safe historical boundary to scan back to. */
  readonly fromBlock: bigint
  readonly toBlock?: bigint
  readonly maxChunks?: number
}

/**
 * Every `InstructionExecuted` for one personal account between `fromBlock` and `toBlock`,
 * newest last — or `undefined` when the scan could not be completed.
 *
 * `undefined` and `[]` are different answers and must stay different all the way to the
 * surface: `[]` means this account has done nothing in the window, `undefined` means we
 * could not find out.
 */
export async function scanInstructionHistory(
  input: ScanInput,
): Promise<readonly ObservedInstruction[] | undefined> {
  const { client, deployment, personalAccount } = input
  let toBlock: bigint
  try {
    toBlock = input.toBlock ?? (await client.getBlockNumber())
  } catch {
    return undefined
  }

  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS
  const found: ObservedInstruction[] = []
  let cursor = input.fromBlock
  let chunks = 0

  while (cursor <= toBlock) {
    if (chunks >= maxChunks) {
      // A truncated scan is not a completed one. Reporting what we have would present a
      // partial history as the whole history.
      return undefined
    }
    const end = cursor + CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + CHUNK_BLOCKS - 1n
    let logs
    try {
      logs = await client.getLogs({
        address: deployment.masterAccountController,
        event: INSTRUCTION_EXECUTED,
        args: { personalAccount },
        fromBlock: cursor,
        toBlock: end,
      })
    } catch {
      return undefined
    }

    for (const log of logs) {
      const reference = log.args.paymentReference
      const transactionId = log.args.transactionId
      if (!reference || !transactionId || !log.args.personalAccount) continue
      let action: string | undefined
      try {
        action = decodePaymentReference(reference).instruction?.action
      } catch {
        // A reference the codec cannot parse is still a real dispatch that happened. The
        // row survives without an action name rather than vanishing from the history.
        action = undefined
      }
      found.push({
        personalAccount: log.args.personalAccount,
        transactionId,
        paymentReference: reference,
        instructionId: log.args.instructionId === undefined ? undefined : Number(log.args.instructionId),
        action,
        blockNumber: log.blockNumber ?? undefined,
        transactionHash: log.transactionHash ?? undefined,
      })
    }

    cursor = end + 1n
    chunks += 1
  }

  return found
}
