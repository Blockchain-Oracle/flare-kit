# Research: how `executeDirectMinting` actually behaves

Date: 2026-08-04
Status: facts, read from `sources/flare-foundation/fassets`. No inference.
For: SPEC.md R4, R10, and the MintFXRP required-state list.

Source: `contracts/assetManager/facets/DirectMintingFacet.sol` (459 lines),
`contracts/assetManager/library/data/PaymentReference.sol`,
`contracts/assetManager/library/DirectMinting.sol`.

## The safety finding: a below-minimum payment loses the whole amount

```solidity
relativeFeeUBA  = receivedAmount.mulBips(mintingFeeBIPS);
minimumFeeUBA   = convertAmgToUBA(minimumMintingFeeAmg);
_paymentTooSmall = receivedAmount < minimumFeeUBA;
_mintingFeeUBA   = Math.min(Math.max(relativeFeeUBA, minimumFeeUBA), receivedAmount);
_executorFeeUBA  = Math.min(convertAmgToUBA(executorFeeAmg), receivedAmount - _mintingFeeUBA);
```

When `receivedAmount < minimumFeeUBA`, `max(relative, minimum)` is `minimumFeeUBA`,
which exceeds `receivedAmount`, so `_mintingFeeUBA` clamps to **the entire
payment**. Execution then runs:

```solidity
_mintFAssets(state.mintingFeeReceiver, mintingFeeUBA);   // the whole amount
if (paymentTooSmall) { emit DirectMintingPaymentTooSmallForFee(...); }
```

The user receives **nothing**. The XRP is gone, converted entirely to a fee for
the fee receiver, and the only trace is an event.

This is not recoverable and there is no refund path. It makes "below minimum" a
hard pre-send block in `MintFXRP`, not a warning and not a disabled-button
nicety — the widget must make it impossible to sign a payment below
`getDirectMintingMinimumFeeUBA()`. It also means the quote must read that
minimum live rather than assuming a constant.

## How the recipient is chosen

`_getMintingTarget` → if a delayed record exists with `targetStored`, the
recipient and executor captured at delay time are used, so they cannot be
changed during the delay. Otherwise `_decodeTarget`, in this precedence:

1. **Destination tag**, if `mintingRecipientForTag(tag) != 0` — recipient and
   allowed executor both come from the minting tag manager.
2. **32-byte memo** carrying a valid `DIRECT_MINTING` payment reference —
   recipient is the low 160 bits, executor is unset.
3. **48-byte memo** prefixed `DIRECT_MINTING_EX` — recipient is bytes 8..28,
   executor is bytes 28..48.
4. **Otherwise: mint to a smart account.** This is the fall-through, not an
   error.

Point 4 matters: a payment with no tag and no recognised memo does *not* fail,
it routes to the smart account manager. Smart Accounts are out of scope this
milestone, so the kit must always produce case 2 or case 3 — never leave the
memo empty.

### Payment reference encoding

`PaymentReference.sol`, `TYPE_SHIFT = 192`:

| Constant | Value |
|---|---|
| `DIRECT_MINTING` | `0x4642505266410018 << 192` |
| `DIRECT_MINTING_EX` | `0x4642505266410021` (8-byte prefix, not shifted) |

- 32-byte memo: `0x4642505266410018` ++ 4 zero bytes ++ 20-byte recipient.
- 48-byte memo: `0x4642505266410021` ++ 20-byte recipient ++ 20-byte executor.

The kit uses the 48-byte form when an executor is named and the 32-byte form
otherwise.

`_validateTagAndMemoData` additionally rejects a payment whose destination tag
equals the core-vault donation tag, and rejects a 32-byte memo carrying a
`REDEMPTION` reference.

## `msg.value` must be zero for an ordinary mint

`_mintToRecipient` is reached only after
`require(msg.value == 0, NoValueExpected())`. The executor fee is paid **in
FAsset** — `_mintFAssets(msg.sender, executorFeeUBA)` — not in native currency.
`executeDirectMinting` is `payable` solely so value can be forwarded to the
smart account manager on the smart-account path.

Any SDK that attaches native value to a normal direct mint will revert.

## The delay path, and why a mint needs two calls

`_checkRateLimits`:

- Amount ≥ `largeMintingThresholdAmg` → record `delayedMintings[txId]`, emit
  `LargeDirectMintingDelayed`, **refund `msg.value` and return without minting**.
- Hourly or daily limiter tripped → same, emitting `DirectMintingDelayed`, with
  `allowedAt = max(hourly, daily)`.
- A record already exists → require `block.timestamp >= allowedAt` (or that
  mintings were unblocked by governance), then return `Released` and proceed.
- Before `allowedAt` → reverts `DirectMintingStillDelayed(allowedAt)`.

So a delayed mint genuinely requires a **second call with the same proof** after
`allowedAt`. That is AC4 exactly, and the reuse is literal: same XRPL payment,
same FDC proof, same arguments. The first call is not wasted and moves no value.

## Idempotency is a revert, not a no-op

`AssetManagerState.get().paymentConfirmations.requireIncomingPaymentUnconfirmed(transactionId)`
runs before minting, and `confirmIncomingPayment` runs after. A second execution
of an already-completed mint **reverts**.

AC4 asks that "a second retry is a no-op". The contract cannot give us that, so
`@flare-kit/core` must: read the confirmation/delay state first, and if the
payment is already confirmed, resolve the operation as `succeeded` from chain
evidence rather than submitting a transaction that would revert. The
idempotency key is the XRPL transaction id, which is what SPEC R10 requires.

## Who may execute, and when

`_othersCanExecute`:

- Not delayed: `currentUnderlyingBlockTimestamp >= paymentTimestamp + othersCanExecuteAfterSeconds`
- Delayed: `block.timestamp >= allowedAt + othersCanExecuteAfterSeconds`

and the guard is
`allowedExecutor == 0 || allowedExecutor == msg.sender || _othersCanExecute(...)`.

So a named executor holds exclusivity for `othersCanExecuteAfterSeconds`, after
which **anyone may execute, including the user**. This is the honest content of
the "awaiting executor" state: it is a wait with a known end, after which the
user gains a real, safe action that reuses existing evidence and moves no new
value. Note the non-delayed branch compares against the *underlying* block
timestamp the AssetManager tracks, not Flare's — so `updateCurrentBlock` may
need calling for the window to open.

## Preconditions that make direct minting unavailable

Read these before quoting; each is a real "unavailable", not a late revert:

- `onlyAttached` — the manager must be attached to its controller.
- `notEmergencyPaused` — `emergencyPaused()`.
- `mintingTagManager != address(0)` — else `MissingMintingTagManager`.
- `smartAccountManager != address(0)` — else `MissingSmartAccountManager`.
- `Minting.checkMintingCap` via `_reserveMintingCapacity`.

The two manager addresses are worth checking on Coston2 specifically: if either
is unset there, `executeDirectMinting` reverts for every caller regardless of
anything the kit does, and that must be reported as a protocol-availability
state rather than as a user error.

## Verification order inside `_executeDirectMinting`

1. `verifyXRPPaymentSuccess(_payment)`
2. `verifyProofOwnership(_payment.data.requestBody.proofOwner)`
3. `receivingAddressHash == coreVaultUnderlyingAddressHash` — the payment must
   have gone to the core vault
4. `receivedAmount > 0`
5. tag/memo validation, target resolution, executor check
6. `requireIncomingPaymentUnconfirmed`
7. capacity reservation, rate limits
8. confirm, compute fees, mint
