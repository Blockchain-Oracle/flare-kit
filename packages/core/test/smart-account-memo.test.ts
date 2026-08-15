import { describe, expect, it } from 'vitest'
import {
  MEMO_HEADER_BYTES,
  MEMO_MAX_BYTES,
  decodeMemo,
  encodeIgnoreMemo,
  encodeRemoveExecutor,
  encodeReplacementFee,
  encodeSetExecutor,
  encodeSetNonce,
} from '../src/smart-accounts/memo.js'
import { buildMemoPayment } from '../src/smart-accounts/payment.js'

/**
 * The memo codec, pinned to the CONTRACT's own `require` lengths.
 *
 * Every opcode is `require(_memoData.length == N, InvalidMemoData())` — an EXACT length, not
 * a minimum (`library/MemoInstructions.sol:87, 101, 120, 135, 148`). A memo one byte off is
 * rejected outright, and by then the XRPL payment has settled and cannot be recovered. So the
 * byte counts below are not style; each one is a payment that would have been lost.
 *
 * The lengths come from the contract's own comments, which state them literally.
 */

const TX_ID = '0xE4385C7AD4E316DF269BFBB96A15204CC68E549005228BB6B1808595DC04117D'
const EXECUTOR = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'

/** Bytes in a `0x` hex string. */
const byteLength = (hex: string): number => (hex.length - 2) / 2

describe('the memo codec emits the exact length each opcode requires', () => {
  it('encodes 0xE0 skip-memo as exactly 42 bytes', () => {
    const memo = encodeIgnoreMemo({ targetTransactionId: TX_ID })
    expect(byteLength(memo)).toBe(42)
    expect(memo.slice(0, 4).toLowerCase()).toBe('0xe0')
  })

  it('encodes 0xE1 fast-forward-nonce as exactly 42 bytes', () => {
    expect(byteLength(encodeSetNonce({ newNonce: 7n }))).toBe(42)
  })

  it('encodes 0xE2 replacement-fee as exactly 50 bytes, not 42', () => {
    // It carries BOTH a 32-byte transaction id and a uint64 fee, so it is the one opcode
    // that breaks the 42-byte family. The developer hub documents no layout for it at all.
    expect(byteLength(encodeReplacementFee({ targetTransactionId: TX_ID, newFee: 1000n }))).toBe(50)
  })

  it('encodes 0xD0 set-executor as exactly 30 bytes with an UNPADDED address', () => {
    // `address(bytes20(_memoData[10:30]))` — 20 raw bytes, no 32-byte slot and no alignment.
    // ABI-padding the address makes the memo 42 bytes and the controller reverts
    // InvalidMemoData with the payment already spent. This is the layout most easily got wrong.
    const memo = encodeSetExecutor({ executor: EXECUTOR })
    expect(byteLength(memo)).toBe(30)
    expect(memo.toLowerCase().endsWith(EXECUTOR.slice(2).toLowerCase())).toBe(true)
  })

  it('encodes 0xD1 remove-executor as exactly 10 bytes — header only', () => {
    expect(byteLength(encodeRemoveExecutor({}))).toBe(MEMO_HEADER_BYTES)
    expect(MEMO_HEADER_BYTES).toBe(10)
  })
})

describe('the shared header', () => {
  it('is opcode, walletId, then a big-endian uint64 fee', () => {
    const memo = encodeIgnoreMemo({ targetTransactionId: TX_ID, walletId: 0, executorFeeUBA: 1n })
    // The whole 10-byte header: opcode `e0`, walletId `00`, then the fee right-aligned in
    // eight bytes. Big-endian matters — `uint64(bytes8(_memoData[2:10]))` reads it that way,
    // and a little-endian fee would pay the relayer an enormous number.
    expect(memo.slice(0, 22).toLowerCase()).toBe('0xe0000000000000000001')
  })

  it('refuses a fee that will not fit its eight bytes', () => {
    // The field is uint64. A larger value would silently truncate into a DIFFERENT fee, and
    // the fee is paid to whoever relays.
    expect(() => encodeIgnoreMemo({ targetTransactionId: TX_ID, executorFeeUBA: 2n ** 64n })).toThrow(
      /executor fee/i,
    )
  })
})

describe('the codec round-trips what it wrote', () => {
  it('reads back the opcode and payload of each recovery memo', () => {
    expect(decodeMemo(encodeIgnoreMemo({ targetTransactionId: TX_ID }))).toMatchObject({
      opcode: 0xe0,
      targetTransactionId: TX_ID.toLowerCase(),
    })
    expect(decodeMemo(encodeSetNonce({ newNonce: 42n }))).toMatchObject({ opcode: 0xe1, newNonce: 42n })
    expect(
      decodeMemo(encodeReplacementFee({ targetTransactionId: TX_ID, newFee: 9n })),
    ).toMatchObject({ opcode: 0xe2, newFee: 9n })
    expect(decodeMemo(encodeSetExecutor({ executor: EXECUTOR }))).toMatchObject({
      opcode: 0xd0,
      executor: EXECUTOR.toLowerCase(),
    })
    expect(decodeMemo(encodeRemoveExecutor({}))).toMatchObject({ opcode: 0xd1 })
  })

  it('refuses a memo whose length is wrong for its opcode', () => {
    // The controller's own check, mirrored client-side so it fails BEFORE the payment.
    const short = `${encodeIgnoreMemo({ targetTransactionId: TX_ID }).slice(0, -2)}`
    expect(() => decodeMemo(short)).toThrow(/exactly 42/i)
  })

  it('refuses an unknown opcode rather than guessing a layout', () => {
    // A full 10-byte header carrying an opcode the controller would reject with
    // `InvalidInstructionId`. Long enough to pass the length check, so this really does
    // exercise the opcode branch rather than failing earlier for the wrong reason.
    expect(() => decodeMemo('0xab000000000000000000')).toThrow(/opcode/i)
  })
})

describe('the ledger ceiling', () => {
  it('states the XRPL memo maximum the plan gates against', () => {
    expect(MEMO_MAX_BYTES).toBe(1024)
  })
})

describe('the memo-flow XRPL payment', () => {
  const base = {
    account: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
    // The Core Vault's underlying address, read live on Coston2 — NOT an operator wallet.
    // A memo instruction paid to an operator wallet goes somewhere that will never mint.
    destination: 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p',
    amountDrops: 2_000_000n,
    sequence: 19_619_782,
    lastLedgerSequence: 19_620_000,
    ledgerFeeDrops: 12n,
  }

  it('carries the memo as the first MemoData, upper-cased, and no destination tag', () => {
    const memo = encodeRemoveExecutor({})
    const payment = buildMemoPayment({ ...base, memo })
    expect(payment.Memos[0]!.Memo.MemoData).toBe(memo.slice(2).toUpperCase())
    expect(payment.Memos).toHaveLength(1)
    // Absolute on this path: a registered tag redirects the whole mint to the tag holder and
    // the protocol discards the memo. There is no parameter for one.
    expect('DestinationTag' in payment).toBe(false)
  })

  it('refuses a memo whose length is wrong for its opcode, before anything is signed', () => {
    expect(() => buildMemoPayment({ ...base, memo: '0xd1000000000000000000ff' })).toThrow()
  })

  it('refuses an opcode the controller does not dispatch', () => {
    expect(() => buildMemoPayment({ ...base, memo: '0xaa00000000000000000000' })).toThrow()
  })

  it('refuses a non-positive payment', () => {
    expect(() =>
      buildMemoPayment({ ...base, memo: encodeRemoveExecutor({}), amountDrops: 0n }),
    ).toThrow()
  })
})
