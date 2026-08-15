/**
 * `IMemoInstructionsFacet` — the events and refusals of the memo flow (M14-R1).
 *
 * Source: `flare-smart-accounts/contracts/userInterfaces/facets/IMemoInstructionsFacet.sol`.
 *
 * A separate file from `smart-accounts-abis.ts` rather than an extension of it, because that
 * file was already at the size ceiling. Both spread into `masterAccountControllerAbi`, which
 * is the only thing that matters: fragments exported beside an ABI decode nothing.
 *
 * Its three reads — `getNonce`, `getExecutor` and `isTransactionIdUsed` — are NOT here. M13
 * already called all three and they live in `smart-accounts-abis.ts`'s `READS`; restating
 * them would put two fragments for one function into one ABI.
 */

/**
 * The seven events, in interface order.
 *
 * `personalAccount` is indexed on every one of them, which is what makes a per-account
 * filter possible at all — unlike the AssetManager's direct-minting events, where nothing is
 * indexed and correlation has to come from decoding a known receipt.
 */
export const memoInstructionEventsAbi = [
  /**
   * The operation ran. Necessary for `succeeded` and NOT sufficient: a rate-limited mint
   * refunds and returns without reverting, so a mined receipt carrying no such event is a
   * delay rather than a completion. The lifecycle also requires the instruction's own
   * observable consequence before it will say the word.
   */
  {
    type: 'event',
    name: 'UserOperationExecuted',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'IgnoreMemoSet',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'targetTxId', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'NonceIncreased',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'newNonce', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExecutorSet',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'executor', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ExecutorRemoved',
    inputs: [{ name: 'personalAccount', type: 'address', indexed: true }],
  },
  /**
   * The only place the replacement fee is observable. `getReplacementFee` is `internal` and
   * there is no external getter anywhere in the tree, so a surface that wants to show the fee
   * reads this event and says when it was observed — it never claims it as current state.
   */
  {
    type: 'event',
    name: 'ReplacementFeeSet',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'targetTxId', type: 'bytes32', indexed: true },
      { name: 'newFee', type: 'uint64', indexed: false },
    ],
  },
  /**
   * The controller's own `DirectMintingExecuted`, which is NOT the AssetManager's event of
   * the same name — different fields, different emitter, different ABI. A receipt from a
   * self-relayed mint contains both, and decoding one with the other's fragment yields
   * plausible nonsense. They stay in separate ABIs so that cannot happen by accident.
   */
  {
    type: 'event',
    name: 'DirectMintingExecuted',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'transactionId', type: 'bytes32', indexed: true },
      { name: 'sourceAddress', type: 'string', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'executorFee', type: 'uint256', indexed: false },
      { name: 'executor', type: 'address', indexed: false },
    ],
  },
] as const

/**
 * The refusals new to the memo flow.
 *
 * `TransactionAlreadyExecuted`, `AddressZero`, `ValueZero` and `CallFailed` are declared on
 * this interface too, and are deliberately absent here: M13 already carries them in
 * `smartAccountErrorsAbi`, and two fragments for one error selector in one ABI is a decode
 * ambiguity for no gain.
 *
 * Every one of these reverts UNGUARDED out of `handleMintedFAssets` — there is no `try/catch`
 * on the dispatch path — which unwinds the mint while the XRPL payment stays settled. That is
 * why the plan gate checks what it can before a signature, and why these names exist: an
 * unnamed revert here would leave a user with spent XRP and no statement of what happened.
 */
export const memoInstructionErrorsAbi = [
  /**
   * The account's nonce moved between reading it and dispatching. Two payments built against
   * one nonce read: the first to execute wins, the second reverts here with its XRP spent.
   */
  {
    type: 'error',
    name: 'InvalidNonce',
    inputs: [
      { name: 'expected', type: 'uint256' },
      { name: 'actual', type: 'uint256' },
    ],
  },
  /** The `PackedUserOperation.sender` is not the personal account the payment derives. */
  {
    type: 'error',
    name: 'InvalidSender',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'personalAccount', type: 'address' },
    ],
  },
  /**
   * `handleMintedFAssets` is `OnlyAssetManager`. This is the structural fact of the whole
   * milestone: the kit cannot call the controller on this path at all, so the instruction can
   * only ever run as a consequence of a direct mint.
   */
  { type: 'error', name: 'OnlyAssetManager', inputs: [] },
  /** What reached the controller does not cover the memo's own executor fee. */
  {
    type: 'error',
    name: 'InsufficientAmountForFee',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  /**
   * An executor is pinned on the account and somebody else relayed. The pin binds ordinary
   * mints too; only the `0xD0`/`0xD1` memos bypass it.
   */
  {
    type: 'error',
    name: 'WrongExecutor',
    inputs: [
      { name: 'expected', type: 'address' },
      { name: 'actual', type: 'address' },
    ],
  },
  /** The memo is not a length this controller accepts. Lengths are exact, never minimums. */
  { type: 'error', name: 'InvalidMemoData', inputs: [] },
  { type: 'error', name: 'InvalidInstructionId', inputs: [{ name: 'instructionId', type: 'uint8' }] },
  /** `0xE1` must move the nonce strictly forward, by no more than `type(uint32).max`. */
  {
    type: 'error',
    name: 'InvalidNonceIncrease',
    inputs: [
      { name: 'currentNonce', type: 'uint256' },
      { name: 'newNonce', type: 'uint256' },
    ],
  },
  /**
   * `0xFE` only. The hash is checked BEFORE the decode, which makes this the one failure on
   * the custom-data path that can be reported precisely instead of as a bare panic — and it
   * is checkable locally before submitting, so self-relay checks it.
   */
  {
    type: 'error',
    name: 'CustomInstructionHashMismatch',
    inputs: [
      { name: 'expected', type: 'bytes32' },
      { name: 'actual', type: 'bytes32' },
    ],
  },
] as const
