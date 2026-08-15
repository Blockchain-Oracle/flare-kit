import { formatExact } from '@flarekit-dev/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { ToneChip } from './primitives/StateChip.js'

/**
 * The two pieces of FDC-04 that render the proof's own contents, split from
 * `ProofDetail.tsx` in M4-R14 at the seam the M4 spec named: the proof body and
 * the verification result are separable from the consumption block around them.
 *
 * The split was forced — `ProofDetail.tsx` was 328 lines, the only production
 * file over CLAUDE.md's 300 cap, and R14 adds an `expired` state to it. Splitting
 * before writing is the rule; this is that.
 */

/** `undefined` is "verification has not run", which is not "it failed". */
export function VerificationChip({ verified }: { verified?: boolean }) {
  if (verified === undefined) {
    return (
      <ToneChip tone="neutral" glyph="unknown">
        Not verified yet
      </ToneChip>
    )
  }
  return verified ? (
    <ToneChip tone="ok" glyph="done">
      Verified on chain
    </ToneChip>
  ) : (
    <ToneChip tone="bad" glyph="failed">
      Did not verify
    </ToneChip>
  )
}

/**
 * Every response field, at full precision, in mono. `bigint` is rendered with
 * `toString()` and never through `Number`.
 *
 * A field the family declares as an amount renders through `formatExact` with
 * its asset — DESIGN.md: `250.000000 XRP`, never `250`. An XRPL `spentAmount`
 * of `25000012` is drops, and printed bare it reads as twenty-five million of
 * something. Fields the family does **not** declare are left as integers on
 * purpose: block numbers, timestamps and destination tags are not amounts, and
 * a family whose asset depends on its source declares none rather than putting
 * the wrong ticker beside a real number.
 */
export function ResponseFields({
  body,
  amounts,
  sourceUnit,
  sourceUnitFields,
}: {
  body: object
  amounts: Readonly<Record<string, { decimals: number; asset: string }>>
  /**
   * The native unit of the source this proof was attested from — M4-R14.
   *
   * `EVMTransaction`'s `value` is denominated in whichever chain the source
   * names, and three sit on one family row, so the family declares no asset. The
   * source does. Supplied only when the caller knows which source was used;
   * without it the field stays a bare integer, which is the honest fallback — a
   * wrong ticker beside a real number is worse than no ticker.
   */
  sourceUnit?: { readonly asset: string; readonly decimals: number }
  /** Which fields the source's unit applies to. Empty when it applies to none. */
  sourceUnitFields?: readonly string[]
}) {
  return (
    <Details>
      {Object.entries(body).map(([field, value]) => {
        // The family's own asset first; the source's native unit only where the
        // family declares none, which is exactly the EVM `value` case.
        const unit =
          amounts[field] ??
          (sourceUnitFields?.includes(field) ? sourceUnit : undefined)
        return (
          <DetailRow
            key={field}
            label={<span className="fk-mono">{field}</span>}
            value={
              Array.isArray(value) ? (
                <span className="fk-mono">
                  {value.length} {value.length === 1 ? 'entry' : 'entries'}
                </span>
              ) : unit && typeof value === 'bigint' ? (
                <span className="fk-mono fk-fdc-value">
                  {formatExact({ value, asset: unit.asset, decimals: unit.decimals })}
                </span>
              ) : (
                <span className="fk-mono fk-fdc-value">{String(value)}</span>
              )
            }
            {...(unit && typeof value === 'bigint'
              ? { sub: `${value.toString()} in the smallest unit, as attested` }
              : {})}
          />
        )
      })}
    </Details>
  )
}
