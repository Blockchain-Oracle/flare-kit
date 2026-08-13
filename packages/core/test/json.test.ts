import { describe, expect, it } from 'vitest'
import { parseJsonWithBigInts } from '../src/json.js'

/**
 * Flare's own FDC guide documents this hazard: the data-availability client
 * shows `lowestUsedTimestamp: 18446744073709552000` when the attested value is
 * uint64 max, 18446744073709551615 — "a JavaScript rounding error".
 *
 * A client that parses the proof the obvious way submits a DIFFERENT proof from
 * the one that was attested, and it fails verification on chain for reasons
 * that look like nothing at all.
 */

const UINT64_MAX = '18446744073709551615'

describe('parseJsonWithBigInts', () => {
  it('preserves a uint64 that JSON.parse would corrupt', () => {
    const text = `{"lowestUsedTimestamp":${UINT64_MAX}}`

    // Demonstrating the hazard this function exists to avoid.
    expect(String(JSON.parse(text).lowestUsedTimestamp)).not.toBe(UINT64_MAX)

    const parsed = parseJsonWithBigInts(text) as { lowestUsedTimestamp: bigint }
    expect(parsed.lowestUsedTimestamp).toBe(18446744073709551615n)
  })

  it('keeps every integer as a bigint, so proof fields are never floats', () => {
    const parsed = parseJsonWithBigInts('{"votingRound":1028678,"status":0}') as Record<
      string,
      bigint
    >
    expect(parsed.votingRound).toBe(1028678n)
    expect(parsed.status).toBe(0n)
    expect(typeof parsed.votingRound).toBe('bigint')
  })

  it('handles negative integers, which the proof uses for amounts', () => {
    const parsed = parseJsonWithBigInts('{"spentAmount":-250000012}') as {
      spentAmount: bigint
    }
    expect(parsed.spentAmount).toBe(-250000012n)
  })

  it('leaves strings, booleans and null alone', () => {
    const parsed = parseJsonWithBigInts(
      '{"sourceAddress":"rNBjmsJ8","hasMemoData":false,"x":null}',
    ) as Record<string, unknown>
    expect(parsed.sourceAddress).toBe('rNBjmsJ8')
    expect(parsed.hasMemoData).toBe(false)
    expect(parsed.x).toBeNull()
  })

  it('does not mangle a hex string that looks numeric', () => {
    const parsed = parseJsonWithBigInts('{"transactionId":"0x3333"}') as Record<
      string,
      unknown
    >
    expect(parsed.transactionId).toBe('0x3333')
  })

  it('leaves a genuine decimal as a number rather than truncating it', () => {
    const parsed = parseJsonWithBigInts('{"rate":1.5}') as { rate: number }
    expect(parsed.rate).toBe(1.5)
  })

  it('walks nested objects and arrays, which is where the proof lives', () => {
    const text = `{"response":{"lowestUsedTimestamp":${UINT64_MAX},"responseBody":{"receivedAmount":250000000}},"proof":["0xabc","0xdef"]}`
    const parsed = parseJsonWithBigInts(text) as {
      response: { lowestUsedTimestamp: bigint; responseBody: { receivedAmount: bigint } }
      proof: string[]
    }
    expect(parsed.response.lowestUsedTimestamp).toBe(18446744073709551615n)
    expect(parsed.response.responseBody.receivedAmount).toBe(250000000n)
    expect(parsed.proof).toEqual(['0xabc', '0xdef'])
  })

  it('rejects malformed JSON rather than returning a partial object', () => {
    expect(() => parseJsonWithBigInts('{oops')).toThrow()
  })
})
