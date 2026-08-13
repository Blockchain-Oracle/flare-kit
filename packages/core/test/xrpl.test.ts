import { describe, expect, it } from 'vitest'
import {
  DIRECT_MINTING_EX_PREFIX,
  DIRECT_MINTING_REFERENCE_PREFIX,
  buildDirectMintPayment,
  decodeDirectMintMemo,
  dropsToXrp,
  encodeDirectMintMemo,
  xrpToDrops,
} from '../src/xrpl.js'

const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678'
const EXECUTOR = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const CORE_VAULT = 'rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV'
const PAYER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

/**
 * `DirectMintingFacet._decodeTarget` falls through to MINT-TO-SMART-ACCOUNT
 * when there is no recognised destination tag or memo. Smart Accounts are out
 * of scope this milestone, so an empty memo would not error — it would route
 * the mint somewhere we have not built. The memo is mandatory.
 */

describe('encodeDirectMintMemo', () => {
  it('encodes recipient alone as a 32-byte DIRECT_MINTING reference', () => {
    const memo = encodeDirectMintMemo({ recipient: RECIPIENT })
    expect(memo).toHaveLength(2 + 64)
    expect(memo.slice(0, 18)).toBe(DIRECT_MINTING_REFERENCE_PREFIX)
    // 8-byte type, 4 zero bytes, then the 20-byte address in the low bits.
    expect(memo.slice(18, 26)).toBe('00000000')
    expect(memo.slice(26).toLowerCase()).toBe(RECIPIENT.slice(2).toLowerCase())
  })

  it('encodes recipient and executor as a 48-byte DIRECT_MINTING_EX memo', () => {
    const memo = encodeDirectMintMemo({ recipient: RECIPIENT, executor: EXECUTOR })
    expect(memo).toHaveLength(2 + 96)
    expect(memo.slice(0, 18)).toBe(DIRECT_MINTING_EX_PREFIX)
    expect(memo.slice(18, 58).toLowerCase()).toBe(RECIPIENT.slice(2).toLowerCase())
    expect(memo.slice(58).toLowerCase()).toBe(EXECUTOR.slice(2).toLowerCase())
  })

  it('round-trips through the decoder the contract would use', () => {
    expect(decodeDirectMintMemo(encodeDirectMintMemo({ recipient: RECIPIENT }))).toEqual({
      recipient: RECIPIENT.toLowerCase(),
    })
    expect(
      decodeDirectMintMemo(encodeDirectMintMemo({ recipient: RECIPIENT, executor: EXECUTOR })),
    ).toEqual({ recipient: RECIPIENT.toLowerCase(), executor: EXECUTOR.toLowerCase() })
  })

  it('refuses a zero recipient, which the contract treats as no target', () => {
    expect(() =>
      encodeDirectMintMemo({ recipient: '0x0000000000000000000000000000000000000000' }),
    ).toThrow(/recipient/i)
  })

  it('refuses a malformed address rather than encoding a lost payment', () => {
    expect(() => encodeDirectMintMemo({ recipient: '0x123' })).toThrow()
    expect(() => encodeDirectMintMemo({ recipient: 'not-an-address' })).toThrow()
  })

  it('produces only the two lengths the contract recognises', () => {
    // 32 or 48 bytes. Anything else routes to a smart account.
    const lengths = [
      encodeDirectMintMemo({ recipient: RECIPIENT }),
      encodeDirectMintMemo({ recipient: RECIPIENT, executor: EXECUTOR }),
    ].map((m) => (m.length - 2) / 2)
    expect(lengths).toEqual([32, 48])
  })
})

describe('drops conversion', () => {
  it('converts XRP to drops exactly, at six decimals', () => {
    expect(xrpToDrops('250')).toBe(250_000_000n)
    expect(xrpToDrops('0.000001')).toBe(1n)
  })

  it('refuses precision XRP cannot hold rather than rounding it away', () => {
    expect(() => xrpToDrops('0.0000001')).toThrow(/precision/i)
  })

  it('renders drops back at full precision', () => {
    expect(dropsToXrp(250_000_000n)).toBe('250.000000 XRP')
  })
})

describe('buildDirectMintPayment', () => {
  const base = {
    account: PAYER,
    destination: CORE_VAULT,
    amountDrops: 250_000_000n,
    recipient: RECIPIENT,
    sequence: 42,
    lastLedgerSequence: 4_821_800,
    feeDrops: 12n,
  }

  it('produces an unsigned XRPL Payment, never a signed one', () => {
    const tx = buildDirectMintPayment(base)
    expect(tx.TransactionType).toBe('Payment')
    expect(tx.Account).toBe(PAYER)
    expect(tx.Destination).toBe(CORE_VAULT)
    // No signature, no key material, no seed anywhere in the object.
    expect(JSON.stringify(tx)).not.toMatch(/sign|seed|secret|key/i)
  })

  it('renders drops as a string, as the XRPL protocol requires', () => {
    const tx = buildDirectMintPayment(base)
    expect(tx.Amount).toBe('250000000')
    expect(typeof tx.Amount).toBe('string')
    expect(tx.Fee).toBe('12')
  })

  it('always carries a direct-minting memo, so it can never route to a smart account', () => {
    const tx = buildDirectMintPayment(base)
    expect(tx.Memos).toHaveLength(1)
    const data = tx.Memos?.[0]?.Memo.MemoData
    expect(data).toBeDefined()
    expect(`0x${data}`.length).toBe(2 + 64)
    expect(decodeDirectMintMemo(`0x${data}`).recipient).toBe(RECIPIENT.toLowerCase())
  })

  it('carries the executor in the memo when one is named', () => {
    const tx = buildDirectMintPayment({ ...base, executor: EXECUTOR })
    const data = tx.Memos?.[0]?.Memo.MemoData
    expect(decodeDirectMintMemo(`0x${data}`).executor).toBe(EXECUTOR.toLowerCase())
  })

  it('bounds the payment with LastLedgerSequence so it cannot linger', () => {
    expect(buildDirectMintPayment(base).LastLedgerSequence).toBe(4_821_800)
  })

  it('sets no DestinationTag, because the tag path resolves a different target', () => {
    // A registered tag would override our memo. We never set one.
    expect(buildDirectMintPayment(base).DestinationTag).toBeUndefined()
  })

  it('refuses to build a payment of zero or negative drops', () => {
    expect(() => buildDirectMintPayment({ ...base, amountDrops: 0n })).toThrow()
    expect(() => buildDirectMintPayment({ ...base, amountDrops: -1n })).toThrow()
  })
})
