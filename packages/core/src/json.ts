import { FlareKitError } from './errors.js'

/**
 * BigInt-safe JSON parsing for protocol responses.
 *
 * The FDC proof carries `uint64` values. `JSON.parse` turns them into IEEE-754
 * doubles, and Flare's own documentation records the consequence: the data
 * availability client displays `lowestUsedTimestamp` as
 * `18446744073709552000` when the attested value is `18446744073709551615` —
 * "a JavaScript rounding error".
 *
 * A client that parses a proof the obvious way therefore submits a *different*
 * proof from the one that was attested. It fails verification on chain, and it
 * fails in a way that looks like nothing at all: the bytes are well-formed, the
 * merkle proof is present, and the transaction simply reverts.
 *
 * So integers never pass through `Number` here. They are lifted out of the raw
 * source text as `BigInt` before any lossy conversion can happen.
 */

/** A JSON integer literal: no fraction, no exponent. Those stay `number`. */
const INTEGER_LITERAL = /^-?\d+$/

/**
 * The reviver's third argument is the JSON source-text-access API (ES2025). It
 * is not in TypeScript's lib definitions yet, and it does not exist before
 * Node 21 — both of which this type and the guard below account for.
 */
type SourceAwareReviver = (
  key: string,
  value: unknown,
  context?: { source?: string },
) => unknown

/**
 * Parses JSON, returning every integer as a `bigint`.
 *
 * Where the runtime cannot supply the original source text and the value is
 * too large to represent exactly, this **throws** rather than returning a
 * quietly wrong number. Submitting a corrupted proof is far worse than
 * refusing to parse, and a silent fallback here is precisely the failure this
 * module exists to prevent.
 */
export function parseJsonWithBigInts(text: string): unknown {
  const revive: SourceAwareReviver = (_key, value, context) => {
    if (typeof value !== 'number') return value

    const source = context?.source
    if (source !== undefined) {
      return INTEGER_LITERAL.test(source) ? BigInt(source) : value
    }

    // No source text: this runtime predates JSON source-text access.
    if (!Number.isInteger(value)) return value
    if (Number.isSafeInteger(value)) return BigInt(value)
    throw new FlareKitError('JSON_PRECISION_UNSUPPORTED', {
      domain: 'internal',
      message:
        'This response contains an integer too large to read exactly, and the JavaScript runtime does not support JSON source-text access (Node 21 or newer is required). Refusing to parse rather than returning a corrupted value.',
      recovery: 'terminal',
      valueMoved: 'unknown',
    })
  }

  return JSON.parse(text, revive as (key: string, value: unknown) => unknown)
}
