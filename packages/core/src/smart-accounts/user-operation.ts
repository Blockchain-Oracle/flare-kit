import { encodeAbiParameters, encodeFunctionData, keccak256 } from 'viem'
import { MEMO_OPCODE, type MemoHeader } from './memo.js'

/**
 * The `PackedUserOperation` a memo instruction carries (M14-R3).
 *
 * The controller does `abi.decode(_memoData[10:], (PackedUserOperation))`
 * (`library/MemoInstructions.sol:39`) — or, for `0xFE`, `abi.decode(_data, …)` at `:49` after
 * checking a hash. The encoding must match byte for byte, and when it does not the revert is a
 * **bare panic with no named error**: the vendored test asserts only `vm.expectRevert()` with
 * no selector (`MasterAccountController.t.sol:2658-2681`). So a mis-encoded memo tells the
 * user nothing at all, and the XRPL payment has already settled.
 *
 * Two properties this file exists to hold:
 *
 * 1. **The leading offset word stays.** `abi.encode` of a struct with dynamic members emits
 *    `0x20` in its first 32 bytes and the contract's decode expects it. `encodeAbiParameters`
 *    with a single tuple produces exactly that; a hand-rolled packed concat does not.
 * 2. **Field order is ERC-4337's**, because the decode is positional. It matches OpenZeppelin's
 *    `PackedUserOperation`, which `MemoInstructions.sol:4` imports — a dependency that is NOT
 *    vendored, so this tuple is the only in-repo statement of the shape.
 *
 * Only `sender`, `nonce` and `callData` are read on chain (`:55-66`, `:70`). The other six are
 * decoded and thrown away, and **nothing is signature-verified anywhere on this path** —
 * authorisation is the XRPL signature that derives the account. `signature: '0x'` is therefore
 * the correct final value, not a placeholder something later fills in.
 */

const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as const

/** ERC-4337's field order. Positional — do not reorder. */
const PACKED_USER_OPERATION_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
  ],
} as const

/** `IPersonalAccount.Call` — one leg of a batch. */
export interface PersonalAccountCall {
  readonly target: `0x${string}` | string
  readonly value: bigint
  readonly data: `0x${string}`
}

const EXECUTE_USER_OP_ABI = [
  {
    type: 'function',
    name: 'executeUserOp',
    stateMutability: 'payable',
    outputs: [],
    inputs: [
      {
        name: '_calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
  },
] as const

export interface PackedUserOperation {
  readonly sender: `0x${string}`
  readonly nonce: bigint
  readonly initCode: `0x${string}`
  readonly callData: `0x${string}`
  readonly accountGasLimits: `0x${string}`
  readonly preVerificationGas: bigint
  readonly gasFees: `0x${string}`
  readonly paymasterAndData: `0x${string}`
  readonly signature: `0x${string}`
}

/**
 * The calldata for a batch.
 *
 * One array, whole batch, no per-call framing. `executeUserOp` loops the calls and reverts
 * `CallFailed(i, result)` on the FIRST failure (`PersonalAccount.sol:239-250`) — **partial
 * batches are impossible**, and the failing index is in the revert data for the error surface.
 */
export function encodeExecuteUserOpCallData(calls: readonly PersonalAccountCall[]): `0x${string}` {
  return encodeFunctionData({
    abi: EXECUTE_USER_OP_ABI,
    functionName: 'executeUserOp',
    args: [calls.map((c) => ({ target: c.target as `0x${string}`, value: c.value, data: c.data }))],
  })
}

/**
 * What the relay must attach as `msg.value`.
 *
 * It arrives as ONE lump — forwarded to `_personalAccount.call{value: msg.value}`
 * (`MemoInstructions.sol:71`) — and `executeUserOp` then distributes it per call. Attach less
 * than this and the inner call reverts, post-settlement.
 */
export function totalCallValue(calls: readonly PersonalAccountCall[]): bigint {
  return calls.reduce((sum, c) => sum + c.value, 0n)
}

export interface BuildUserOperationInput {
  /** MUST be the derived personal account: `require(userOp.sender == _personalAccount)`. */
  readonly sender: `0x${string}` | string
  /** MUST equal the account's current nonce, read once per payment. */
  readonly nonce: bigint
  readonly calls: readonly PersonalAccountCall[]
}

export function buildUserOperation(input: BuildUserOperationInput): PackedUserOperation {
  return {
    sender: input.sender as `0x${string}`,
    nonce: input.nonce,
    callData: encodeExecuteUserOpCallData(input.calls),
    // Decoded and discarded by the contract. Present because the decode is positional.
    initCode: '0x',
    accountGasLimits: ZERO_BYTES32,
    preVerificationGas: 0n,
    gasFees: ZERO_BYTES32,
    paymasterAndData: '0x',
    signature: '0x',
  }
}

/** `abi.encode(userOp)` — offset word included, which is what the contract decodes. */
export function encodeUserOperation(userOperation: PackedUserOperation): `0x${string}` {
  return encodeAbiParameters([PACKED_USER_OPERATION_TUPLE], [userOperation])
}

function header(opcode: number, input: MemoHeader): string {
  const walletId = input.walletId ?? 0
  const fee = input.executorFeeUBA ?? 0n
  return (
    opcode.toString(16).padStart(2, '0') +
    walletId.toString(16).padStart(2, '0') +
    fee.toString(16).padStart(16, '0')
  )
}

/**
 * `0xFF` — the whole operation inline.
 *
 * Size is the constraint: an empty-callData operation already encodes to 448 bytes, one call
 * to 736 and three to 1152 — so a three-call batch produces a 1162-byte memo, past the
 * ledger's 1024 ceiling. The plan measures rather than guesses, and points a batch that does
 * not fit at `0xFE`.
 */
export function encodeUserOperationMemo(
  input: MemoHeader & { readonly userOperation: PackedUserOperation },
): `0x${string}` {
  return `0x${header(MEMO_OPCODE.userOperation, input)}${encodeUserOperation(input.userOperation).slice(2)}`
}

export interface UserOperationWithData {
  /** The 42-byte memo — constant, whatever the batch size. */
  readonly memo: `0x${string}`
  /** The commitment carried in the memo. */
  readonly hash: `0x${string}`
  /** The bytes an executor must supply to `executeDirectMintingWithData`. */
  readonly data: `0x${string}`
}

/**
 * `0xFE` — the operation committed to by hash, delivered by an executor.
 *
 * `keccak256(_data)` over the RAW bytes exactly as passed (`MemoInstructions.sol:44`): no
 * struct hash, no EIP-712 digest, no domain separator, no prefix. The hash is checked BEFORE
 * the decode, so a mismatch gives the named `CustomInstructionHashMismatch` rather than a
 * panic — the one failure on this path that can be reported precisely.
 *
 * The kit can be the executor whenever no executor is pinned on the account, which is what
 * makes this opcode usable without coordinating with anybody.
 */
export function encodeUserOperationWithDataMemo(
  input: MemoHeader & { readonly userOperation: PackedUserOperation },
): UserOperationWithData {
  const data = encodeUserOperation(input.userOperation)
  const hash = keccak256(data)
  return {
    memo: `0x${header(MEMO_OPCODE.userOperationWithData, input)}${hash.slice(2)}`,
    hash,
    data,
  }
}
