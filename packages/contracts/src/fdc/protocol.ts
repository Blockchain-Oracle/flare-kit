/**
 * The Flare Data Connector protocol itself: how a name becomes 32 bytes, and
 * which voting round a request landed in.
 *
 * Nothing family-specific lives here. `families.ts` describes what the network
 * attests; this file describes the encoding and the clock that are true for
 * every family at once.
 *
 * Verified in `.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md`.
 * Sources: `flare-foundry-periphery-package/src/coston2/{IFdcHub,IRelay,
 * IFdcRequestFeeConfigurations}.sol` and `developer-hub/docs/fdc/`.
 */

/** The protocol id FDC merkle roots are published under. */
export const FDC_PROTOCOL_ID = 200

/**
 * XRPL ledgers must reach this confirmation depth before a payment can be
 * attested. Requesting earlier is rejected as too early — which is an
 * observation about timing, never a failed mint.
 */
export const XRPL_REQUIRED_CONFIRMATIONS = 3

/**
 * An attestation type or source id: the UTF-8 name, right-padded with zeros to
 * 32 bytes.
 */
export function attestationName(name: string): `0x${string}` {
  const bytes = new TextEncoder().encode(name)
  if (bytes.length > 32) {
    throw new Error(`"${name}" does not fit in 32 bytes when UTF-8 encoded.`)
  }
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `0x${hex.padEnd(64, '0')}`
}

/**
 * The inverse of `attestationName`: the readable name back out of 32 bytes.
 *
 * A proof carries its type and source as right-padded bytes32, and
 * `0x74657374585250000…` is not something a person can check against the row
 * they chose. Trailing zero bytes are padding, never content — the names are
 * ASCII identifiers.
 */
export function decodeAttestationName(padded: string): string {
  const hex = padded.startsWith('0x') ? padded.slice(2) : padded
  let name = ''
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    if (code === 0) break
    name += String.fromCharCode(code)
  }
  return name
}

/**
 * The voting round a request landed in, from the timestamp of the block that
 * carried it.
 *
 * The epoch parameters are arguments rather than constants because both are
 * on-chain getters on `FlareSystemsManager`. Hardcoding Coston2's start
 * timestamp would make the mainnet path silently request the wrong round.
 */
export function votingRoundIdAt(
  timestampSeconds: bigint,
  firstVotingRoundStartTs: bigint,
  votingEpochDurationSeconds: bigint,
): bigint {
  if (timestampSeconds < firstVotingRoundStartTs) {
    throw new Error(
      `Timestamp ${timestampSeconds} is before the first voting round began at ${firstVotingRoundStartTs}.`,
    )
  }
  // Integer division on bigint floors, which is the behaviour we want: a
  // request belongs to the round that had already started when it landed.
  return (timestampSeconds - firstVotingRoundStartTs) / votingEpochDurationSeconds
}

/**
 * When a round's merkle root should be expected, from the round it belongs to.
 *
 * A round collects for its epoch duration, then the protocol needs one more
 * epoch to reveal and finalize. This is the number M3-R9 puts on the timeline
 * so a wait is a stated duration rather than an open-ended spinner — it is an
 * expectation, and `Relay.isFinalized` remains the only thing that says a round
 * is actually done.
 */
export function expectedFinalizationSeconds(votingEpochDurationSeconds: bigint): bigint {
  return votingEpochDurationSeconds * 2n
}
