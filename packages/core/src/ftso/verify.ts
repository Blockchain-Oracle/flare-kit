import { ftsoRegistryFor, ftsoV2Abi } from '@flarekit-dev/contracts'
import type { RoundReader } from '../voting-round.js'
import type { AnchorFeedWithProof } from './anchor.js'

/**
 * On-chain verification of an anchor-feed proof — M4-R3.
 *
 * `FtsoV2.verifyFeedData` **reverts** on a bad proof. It does not return
 * `false`. Live on Coston2: a valid proof returns `true`; a value off by one, a
 * shifted round, a truncated proof and an empty proof array all revert with
 * `merkle proof invalid`. On the same chain,
 * `FdcVerification.verifyEVMTransaction(garbage)` returns `false` without
 * reverting.
 *
 * So the two protocols cannot share a boolean. Catching this revert and coercing
 * it to `false` would render "we could not check this" as "this is not proven" —
 * an unknown shown as a negative fact, which is the exact thing CLAUDE.md
 * forbids. The result is therefore three-valued, and there is no boolean
 * accessor on it to be tempted by.
 */

export type VerificationOutcome =
  /** The contract returned true. The value is committed in the round's root. */
  | 'proven'
  /** The contract returned false. A definite negative — rare on this path. */
  | 'not_proven'
  /**
   * The check itself did not complete: a revert, an unreachable node, a
   * malformed input. Says nothing about the value either way.
   */
  | 'could_not_check'

export interface VerificationResult {
  readonly outcome: VerificationOutcome
  readonly feedId: string
  readonly name: string
  readonly votingRoundId: number
  /**
   * The revert reason or transport error, kept verbatim. `merkle proof invalid`
   * is a different fact from `HTTP 502`, and collapsing them into
   * "could not check" without the reason leaves nobody able to act.
   */
  readonly reason?: string
  /**
   * When the chain was actually asked, in host milliseconds.
   *
   * Carried so a surface can say *when* a verdict was reached instead of
   * stamping its own render clock on it. A surface with no verdict has no
   * check time, which is the point: "checked at 14:22" beside a proof nobody
   * verified is an unasked question rendered as a completed one.
   */
  readonly observedAt?: number
}

/**
 * Verify one anchor feed against the Relay's published root.
 *
 * This never throws for a verification outcome. A caller rendering a proof needs
 * all three answers as data, and an exception would make `could_not_check`
 * indistinguishable from a bug in the caller.
 */
export async function verifyAnchorFeed(
  reader: RoundReader,
  chainId: number,
  feed: AnchorFeedWithProof,
  now: () => number = Date.now,
): Promise<VerificationResult> {
  const base = {
    feedId: feed.body.id,
    name: feed.name,
    votingRoundId: feed.body.votingRoundId,
    // Stamped when the chain was asked, not when a surface renders the answer.
    observedAt: now(),
  }

  try {
    const verified = await reader.readContract({
      address: ftsoRegistryFor(chainId).ftsoV2,
      abi: ftsoV2Abi as readonly unknown[],
      functionName: 'verifyFeedData',
      args: [{ proof: feed.proof, body: feed.body }],
    })
    return Object.freeze({
      ...base,
      outcome: verified === true ? ('proven' as const) : ('not_proven' as const),
    })
  } catch (cause) {
    return Object.freeze({
      ...base,
      outcome: 'could_not_check' as const,
      reason: revertReasonOf(cause),
    })
  }
}

/**
 * A readable reason out of whatever the transport threw.
 *
 * viem puts the useful sentence on `shortMessage`; everything else falls back to
 * the message. The string is surfaced rather than swallowed because
 * `merkle proof invalid` tells a developer their proof is wrong, while a network
 * error tells them to try again — and "could not check" alone tells them nothing.
 */
function revertReasonOf(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null) {
    const shortMessage = (cause as { shortMessage?: unknown }).shortMessage
    if (typeof shortMessage === 'string' && shortMessage.length > 0) return shortMessage
    const message = (cause as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message.split('\n')[0] ?? message
  }
  return String(cause)
}

/**
 * Whether a result may be rendered as a proven fact.
 *
 * Deliberately not named `isValid` and deliberately not the inverse of anything:
 * `!proven` covers both "the chain says no" and "we do not know", and those must
 * never render the same way.
 */
export function isProven(result: VerificationResult): boolean {
  return result.outcome === 'proven'
}
