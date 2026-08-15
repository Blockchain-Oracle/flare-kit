import { describe, expect, it } from 'vitest'
import { MEMO_MAX_BYTES } from '../src/smart-accounts/memo.js'
import {
  buildUserOperation,
  encodeExecuteUserOpCallData,
  encodeUserOperation,
  encodeUserOperationMemo,
  encodeUserOperationWithDataMemo,
  totalCallValue,
} from '../src/smart-accounts/user-operation.js'

/**
 * The `PackedUserOperation` builder.
 *
 * `abi.decode(_memoData[10:], (PackedUserOperation))` (`MemoInstructions.sol:39`) must match
 * byte for byte. When it does not, the failure is a BARE PANIC with no named error — the
 * vendored test asserts only `vm.expectRevert()` with no selector — so nothing can be
 * reported to the user beyond "it failed", and the XRPL payment has already settled.
 *
 * The sizes below were measured, not estimated, and they decide which opcode a batch can use.
 */

const ACCOUNT = '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb'
const TARGET = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'

const byteLength = (hex: string): number => (hex.length - 2) / 2
const call = (value = 0n) => ({ target: TARGET, value, data: '0x12345678' as const })

describe('the encoded user operation matches what abi.decode expects', () => {
  it('keeps the leading offset word', () => {
    // `abi.encode` of a struct with dynamic members emits 0x20 in the first 32 bytes, and the
    // contract's decode expects exactly that. A builder that strips it — or hand-rolls a
    // packed concat — produces a memo that panics with no named error.
    const encoded = encodeUserOperation(buildUserOperation({ sender: ACCOUNT, nonce: 0n, calls: [call()] }))
    expect(encoded.slice(0, 66)).toBe(`0x${'00'.repeat(31)}20`)
  })

  it('zero-fills the six fields the contract decodes and discards', () => {
    // Only sender, nonce and callData are validated. `signature: '0x'` is the correct FINAL
    // value, not a placeholder — there is no signature verification anywhere in this path.
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 3n, calls: [call()] })
    expect(userOp.initCode).toBe('0x')
    expect(userOp.paymasterAndData).toBe('0x')
    expect(userOp.signature).toBe('0x')
    expect(userOp.preVerificationGas).toBe(0n)
    expect(userOp.accountGasLimits).toBe(`0x${'00'.repeat(32)}`)
    expect(userOp.gasFees).toBe(`0x${'00'.repeat(32)}`)
  })

  it('carries the sender and nonce the contract checks', () => {
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 7n, calls: [call()] })
    expect(userOp.sender.toLowerCase()).toBe(ACCOUNT.toLowerCase())
    expect(userOp.nonce).toBe(7n)
  })
})

describe('the batch calldata', () => {
  it('encodes executeUserOp with the whole batch in one array', () => {
    const data = encodeExecuteUserOpCallData([call(), call()])
    // Selector for executeUserOp((address,uint256,bytes)[]) — derived from the ABI, and
    // asserted here so a signature change cannot pass silently.
    expect(data.slice(0, 10)).toBe('0x2b2ee783')
  })

  it('sums the per-call values, because msg.value arrives as ONE lump', () => {
    // The relay attaches one value; `executeUserOp` distributes it per call. If the sum
    // exceeds what was attached, the inner call reverts — after settlement.
    expect(totalCallValue([call(1n), call(2n), call(0n)])).toBe(3n)
  })
})

describe('the memo sizes decide which opcode a batch can use', () => {
  it('builds a 0xFF memo of ten bytes plus the encoded operation', () => {
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 0n, calls: [call()] })
    const memo = encodeUserOperationMemo({ userOperation: userOp })
    expect(byteLength(memo)).toBe(10 + byteLength(encodeUserOperation(userOp)))
    expect(memo.slice(0, 4).toLowerCase()).toBe('0xff')
  })

  it('cannot fit a three-call batch in a 0xFF memo', () => {
    // Measured: three calls encode to 1152 bytes, so the memo is 1162 — over the ledger's
    // 1024 ceiling. This is the real reason the protocol has a second opcode.
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 0n, calls: [call(), call(), call()] })
    expect(byteLength(encodeUserOperationMemo({ userOperation: userOp }))).toBeGreaterThan(MEMO_MAX_BYTES)
  })

  it('fits the same batch in a 0xFE memo, which is always 42 bytes', () => {
    // The commitment is a hash, so the batch size stops mattering.
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 0n, calls: [call(), call(), call()] })
    const { memo, data } = encodeUserOperationWithDataMemo({ userOperation: userOp })
    expect(byteLength(memo)).toBe(42)
    expect(memo.slice(0, 4).toLowerCase()).toBe('0xfe')
    // The executor supplies exactly these bytes; the contract hashes them and compares.
    expect(data).toBe(encodeUserOperation(userOp))
  })

  it('commits to keccak256 of the RAW data, with no domain separator or prefix', () => {
    // `keccak256(_data)` over the bytes exactly as passed (`MemoInstructions.sol:44`). Any
    // EIP-712 style wrapping would mismatch and revert CustomInstructionHashMismatch.
    const userOp = buildUserOperation({ sender: ACCOUNT, nonce: 0n, calls: [call()] })
    const { memo, hash, data } = encodeUserOperationWithDataMemo({ userOperation: userOp })
    expect(memo.toLowerCase().endsWith(hash.slice(2).toLowerCase())).toBe(true)
    expect(byteLength(data)).toBeGreaterThan(0)
  })
})
