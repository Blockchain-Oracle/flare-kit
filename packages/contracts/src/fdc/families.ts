import type { FlareNetworkKey } from '../chains.js'

/**
 * What a Flare Data Connector attestation family *is*, as a type — separate
 * from the ten rows this project claims, which live in `family-table.ts`.
 *
 * The split is the point. This file is the contract every consumer codes
 * against; the table is a claim about one moment in time that M3-R3 requires be
 * compared against the live deployment. Nothing here knows which families
 * exist, so nothing here can go stale.
 */

/**
 * `supported`   — this project ships a request builder and has driven it live.
 * `planned`     — the deployment serves it; this project has no builder.
 * `deprecated`  — withdrawn upstream.
 * `unavailable` — this deployment does not serve it, with dated evidence.
 *
 * `planned` is never rendered as supported (M3-R4).
 */
export type FamilyStatus = 'supported' | 'planned' | 'deprecated' | 'unavailable'

export interface FamilySource {
  /** The verifier route group, which is not always the chain's ticker. */
  readonly group: string
  /** The `sourceId` the fee configuration prices, before 32-byte padding. */
  readonly sourceId: string
  /** The data chain as a proper noun, for a person reading a row. */
  readonly chain: string
  /**
   * The native unit an amount on this source is denominated in — **M4-R14**.
   *
   * `EVMTransaction`'s `value` is in whichever chain the source names, and
   * `testFLR`, `testETH` and `testSGB` sit on the same family row. The table
   * therefore declared no asset at all rather than print the wrong ticker
   * beside a real number, which left a real amount rendering unlabelled. The
   * unit belongs to the **source**, not to the family, and this is where it now
   * lives.
   *
   * Absent where an amount is not denominated in a native unit, or where the
   * family already declares its own asset because it serves one chain only.
   */
  readonly nativeUnit?: { readonly asset: string; readonly decimals: number }
}

export interface AttestationFamilyRow {
  readonly name: string
  readonly summary: string
  /** Whether flare-kit ships a request builder for it. */
  readonly hasBuilder: boolean
  /**
   * Per network, the groups and source ids this family is served under. An
   * empty list means the deployment does not serve it — which is a dated
   * observation, not an omission.
   */
  readonly sources: Readonly<Record<FlareNetworkKey, readonly FamilySource[]>>
  /**
   * Response fields that must survive as `bigint`. `uint8` fields are excluded:
   * they are narrowed to `number` at the ABI boundary by the family module, and
   * they cannot overflow a double.
   */
  readonly bigIntResponseFields: readonly string[]
  /**
   * Which response fields are **amounts**, and in what unit — so a surface can
   * obey DESIGN.md's rule that every amount carries its asset and full stored
   * precision. Without this a proof renders `25000012`, which is drops wearing
   * no label and reads as twenty-five million of something.
   *
   * Declared only where the asset is unambiguous from the family alone. A
   * chain-agnostic family's amounts are denominated in whichever chain the
   * source names, and this row is not source-specific, so guessing here would
   * put the wrong ticker beside a real number.
   */
  /**
   * Response fields denominated in the **source's** native unit rather than in
   * an asset the family can name — M4-R14.
   *
   * `EVMTransaction.value` is the case this exists for: three EVM sources sit on
   * one family row, so no family-level asset can be right for all of them, and
   * the field previously rendered as a bare integer. Listing it here says "this
   * is an amount, ask the source what it is denominated in" without the family
   * having to claim an asset it cannot know.
   */
  readonly nativeUnitResponseFields?: readonly string[]
  readonly amountResponseFields: Readonly<
    Record<string, { readonly decimals: number; readonly asset: string }>
  >
  /** Whether the request body binds an EVM address authorised to use the proof. */
  readonly bindsProofOwner: boolean
  /**
   * Whether a contract deployed on this network consumes a verified proof of
   * this family. A boolean rather than sniffing `consumer` for a phrase,
   * because a surface has to decide whether to offer consumption at all and
   * that decision must not hinge on prose.
   */
  readonly hasDeployedConsumer: boolean
  /**
   * What consumes a verified proof of this family, or why nothing does. Never
   * blank: "no deployed consumer" is a statement this project is willing to
   * make, and hiding it would let a surface imply consumption exists — but
   * claiming it where one *does* exist is the same error pointed the other way,
   * and understates what the protocol can already do.
   */
  readonly consumer: string
  /** Present only when the family is withdrawn upstream. */
  readonly deprecationNote?: string
}

/**
 * The status a row claims for a family on a network.
 *
 * Deprecation outranks everything — a withdrawn family is not "unavailable on
 * this network", it is gone. Otherwise a family the deployment does not serve
 * is `unavailable` whether or not we ship a builder for it, because a builder
 * for something the chain will not price is not support.
 */
export function claimedStatus(family: AttestationFamilyRow, network: FlareNetworkKey): FamilyStatus {
  if (family.deprecationNote) return 'deprecated'
  if (family.sources[network].length === 0) return 'unavailable'
  return family.hasBuilder ? 'supported' : 'planned'
}

/** The source entry for a family on a network, by `sourceId`. */
export function sourceFor(
  family: AttestationFamilyRow,
  network: FlareNetworkKey,
  sourceId: string,
): FamilySource | undefined {
  return family.sources[network].find((source) => source.sourceId === sourceId)
}
