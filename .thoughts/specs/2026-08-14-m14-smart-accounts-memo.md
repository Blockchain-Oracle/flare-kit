# Spec: M14 — XRPL-controlled Smart Accounts, part two: the direct-minting memo flow

> **Status.** Written 2026-08-14 and adopted under the delegation recorded in
> `.thoughts/decisions/2026-08-14-sequence-after-m13.md` — Abu was driving and explicitly
> handed over the stretch. It is the second half of the family whose first half shipped as
> M13; the split, and this milestone's pre-commitment, are Abu's own choice recorded in
> `2026-08-13-m13-smart-accounts.md` § Out of scope.
>
> **Grounding is source-first.** Two research passes read the vendored Solidity and the
> vendored developer hub in parallel; every protocol claim below carries a `file:line`, and
> the ones that decide user safety were re-verified by hand. Where the two disagreed, the
> source won and the disagreement is written down.

## Objective

After this milestone, the same person M13 served — holding only an XRPL address and only XRP,
with no Flare account and no FLR — can make their personal account **do arbitrary work on
Flare by paying once on the XRP Ledger**, with the instruction carried in the payment's own
memo, and can **recover** when that instruction goes wrong.

M13 built the *proof-based* flow: a 32-byte payment reference → an FDC `Payment` attestation →
a permissionless `executeInstruction` the kit submits, choosing from eleven built-in
instructions. M14 builds the *memo* flow, which is a different shape end to end:

- the memo carries an **arbitrary `PackedUserOperation`**, not an index into a fixed
  vocabulary — any `onlyController` function on the personal account is reachable, and
  `executeUserOp` batches a whole array of calls;
- the kit **never calls the controller**. `handleMintedFAssets` is `OnlyAssetManager`
  (`IMemoInstructionsFacet.sol:132`, `IMasterAccountController.mdx:284`). The kit calls the
  FAssets **AssetManager**, which calls back into the controller. The instruction executes as
  a consequence of a **direct mint** — M1's flow, already live-verified;
- it is attested with **`XRPPayment`**, not `Payment`, and only because `XRPPayment` surfaces
  the raw memo bytes on chain (`firstMemoData`). `Payment` does not carry them at all;
- and it comes with **five recovery opcodes**, because the flow can strand real value in ways
  M13's could not.

## Why this is buildable to the bar, and what that turned on

The milestone's viability rested on one question: does the memo flow require an
operator-run executor service we do not run? **It does not.**

- `executeDirectMinting` / `executeDirectMintingWithData` may be called by **any address**
  (`IAssetManager.mdx:494`), and the AssetManager imposes no executor restriction on the
  smart-account branch — `_decodeTarget` returns `allowedExecutor: address(0)` for it
  (`DirectMintingFacet.sol:352-356`), so the exclusivity window at `:442-458` never binds.
- The controller's per-account executor pin only binds when one is set:
  `if (paExecutor != address(0))` (`MemoInstructionsFacet.sol:67-70`). On a blank-slate
  account, any executor is accepted.
- The FDC proof is bound to its submitter through `XRPPayment`'s `proofOwner`
  (`xrp-payment.mdx:27`), so the kit sets `proofOwner` to its own EOA and **self-relays**.

That last point is not merely permitted, it is the honest choice. The reference flow sends the
XRPL payment and then *watches for an event*, hoping somebody else's relayer finalises it. A
kit that self-relays **knows** the outcome instead of inferring it from an event that may never
arrive — which is this project's rule, not a preference.

## The honesty it forces

M13's rules all carry over. These are the ones new to this flow, and each is a way a user
loses money that a plausible-looking implementation would not prevent.

- **A destination tag silently steals the entire mint.** Verified by hand:
  `MintingTagManager.sol:37` initialises `nextAvailableTag = 0` and allocates sequentially,
  and tags are reservable permissionlessly for a fee (`:113-122`). A payment carrying a
  registered tag sets `mintToSmartAccount: false`, redirects the recipient to the tag owner's
  address, and **discards the memo** — the source's own comment says "ignore memo data in this
  case" (`DirectMintingFacet.sol:311-320`). A wallet that defaults `DestinationTag` to `0`
  therefore pays a stranger and drops the instruction. The kit must refuse to **construct**
  such a payment and refuse to **submit a proof** whose `responseBody.hasDestinationTag` is
  true. This is a hard refusal with no override.

- **A delayed mint MINES SUCCESSFULLY AND MINTS NOTHING.** Verified by hand: rate-limited,
  `_executeDirectMinting` refunds `msg.value` and `return`s without reverting
  (`DirectMintingFacet.sol:135-139`). The receipt says success, no FXRP exists, and
  `handleMintedFAssets` was never called — so no memo ran. `succeeded` must never be entered
  from a mined receipt. `DirectMintingDelayed` is a **third state**, neither success nor
  failure: the same proof is retried after `executionAllowedAt`, and prompting the user for a
  second XRPL payment here is the named anti-pattern (`02-minting.mdx:188-191`).

- **An underpayment is a total, unrecoverable loss.** Below the minimum minting fee, everything
  goes to the fee receiver, the executor gets nothing, and `handleMintedFAssets` is never
  called (`DirectMintingFacet.sol:150-157`, deliberate anti-dust design). The plan must compute
  `net + mintingFee + executorFee` and refuse before signing.

- **Every revert lands after the XRP is gone.** The dispatch is unguarded — no `try/catch`
  anywhere (`MemoInstructionsFacet.sol:82-99`) — so any opcode revert unwinds the mint while
  the XRPL payment stays settled. `InvalidInstructionId`, `InvalidMemoData`, `InvalidSender`,
  `InvalidNonce`, `CallFailed`, `CustomInstructionHashMismatch`, `InsufficientAmountForFee`,
  `WrongExecutor` and a bare panic on a malformed `0xFF` are **all** reachable only
  post-settlement. Everything the kit can check, it checks before the payment is signed; and
  the inner call is **simulated** against the chain first.

- **The memo lengths are exact, not minimums.** Each opcode is
  `require(_memoData.length == N, InvalidMemoData())` (`MemoInstructions.sol:42, 87, 101, 120,
  135, 148`). A memo one byte off is rejected with the payment already spent.

- **Only the FIRST memo is attested.** `firstMemoData` is `Memos[0]` and the rest are invisible
  on chain (`xrp-payment.mdx:44`, `XrpTransaction.ts:617-618`). A second memo is not a fallback;
  it is nothing.

- **A duplicate nonce strands the second payment.** Two payments built from one `getNonce` read:
  the first to execute wins and the other reverts `InvalidNonce` after settling. The nonce is
  read **once per payment**, and the surface says what is in flight.

- **Native value is stranded on every non-userOp path.** `msg.value` is forwarded only inside
  `MemoInstructions.execute` (`:71`). For an empty memo, an ignored memo, or any of
  `0xE0`/`0xE1`/`0xE2`/`0xD0`/`0xD1`, the diamond accepts value and never moves it — and there
  is **no sweep or withdraw function anywhere on it**. The kit sends value `0` on those paths
  and refuses a caller-supplied value.

- **Pinning an executor can lock the account out of ordinary mints.** Read literally, the
  bypass at `MemoInstructionsFacet.sol:64-71` requires `_memoData.length > 0`, so an
  **empty-memo mint is subject to the pin** — as is an ignored-memo retry. Only `0xD0`/`0xD1`
  escape. So a pinned executor going dark blocks even a plain mint to that account until a
  `0xD1` payment clears it. Any surface offering `0xD0` states this before it is used.

- **`0xFF` payloads are public.** Target, value and calldata are readable on the XRP Ledger by
  anyone (`5-custom-instruction-comparison.mdx:38`). The composer says so rather than letting a
  user assume otherwise.

- **The memo's fee field is an open bounty.** `executorFeeUBA` is paid to whoever relays, and
  the only check is `_amount >= _executorFee` — a memo may legally assign the entire mint to
  the executor. The kit clamps it against the AssetManager's own
  `getDirectMintingExecutorFeeUBA()` and renders it at full precision before approval.

## Requirements

- **M14-R1 — `@flare-kit/contracts` gains the memo surface.** `smart-accounts-abis.ts` gains
  the `IMemoInstructionsFacet` reads (`getNonce`, `getExecutor`, `isTransactionIdUsed`,
  `getReplacementFee`), its seven events and its ten named errors; `direct-minting-abi.ts`
  gains **`executeDirectMintingWithData`**, which it lacks today — M13's spec called that a
  protocol absence and it is not, it is a gap in our own transcription
  (`IDirectMinting.sol:72-75`, present in every compiled ABI including Coston2). No new
  address constant: the controller is already registered, and the AssetManager comes from
  M1's registry.

- **M14-R2 — the memo codec, all seven opcodes, exact-length.**
  `packages/core/src/smart-accounts/memo.ts`. One shared 10-byte header
  `[opcode:u8][walletId:u8][executorFeeUBA:u64 BE]`, then:

  | opcode | payload | total |
  | --- | --- | --- |
  | `0xFF` | `abi.encode(PackedUserOperation)` | 10 + n |
  | `0xFE` | `keccak256(_data)` — 32 bytes | 42 |
  | `0xE0` | `targetTxId` — 32 bytes | 42 |
  | `0xE1` | `newNonce` — uint256 | 42 |
  | `0xE2` | `targetTxId` + `newFee:u64` | 50 |
  | `0xD0` | executor — **20 raw bytes, unpadded** | 30 |
  | `0xD1` | — | 10 |

  Encoding is raw-width concatenation, never `encodeAbiParameters` padding: `0xD0` takes
  `bytes20` and an ABI-padded address makes the memo 42 bytes and reverts. Decoding is the
  inverse and refuses any length that is not exactly right. `walletId` is **dead on chain** —
  read by no contract — and is carried as a client convention with that stated.

- **M14-R3 — the `PackedUserOperation` builder.** Nine fields in OpenZeppelin's ERC-4337 order,
  which is load-bearing because the decode is positional. Only `sender`, `nonce` and `callData`
  are validated on chain (`MemoInstructions.sol:55-66`); the other six are decoded and
  discarded, and **there is no signature verification anywhere** — authorisation is the XRPL
  signature that derives the account, so `signature: '0x'` is the correct final value and not a
  placeholder. It also builds `executeUserOp(Call[])` batches, where `Call = {target, value,
  data}` and a failure reverts `CallFailed(i, result)` with the failing index — **partial
  batches are impossible**, and that index is decoded onto the error surface.

  **The encoding must keep its leading offset word.** `abi.encode` of a struct with dynamic
  members emits `0x20` in the first 32 bytes, and `abi.decode(_memoData[10:],
  (PackedUserOperation))` expects exactly that. A builder that strips it, or hand-rolls a
  packed concat, produces a memo that reverts as a **bare panic with no named error** — the
  vendored test asserts only `vm.expectRevert()` with no selector, so nothing can be reported
  back to the user beyond "it failed".

  **Measured sizes decide which opcode is usable, and they are INPUT-DEPENDENT.** Measured
  against this exact tuple with a four-byte payload per call: an empty batch encodes to 544
  bytes → a 554-byte `0xFF` memo; one call 736 → 746; three calls 1120 → **1130, over the
  1024 ceiling**. A parallel measurement with a different per-call payload gave 448 / 736 /
  1152 — the one-call figure agreeing exactly and the others not, precisely because each
  call's `data` length moves the total.

  So **no constant may be quoted as "the" size**, and the plan must MEASURE the encoded memo
  for the actual batch rather than consult a table. What is stable is the shape: `0xFF` carries
  roughly one call and rarely more, a batch that does not fit is a plan refusal pointing at
  `0xFE`, and `0xFE`'s memo is 42 bytes whatever the batch size. That is the real reason the
  protocol has two opcodes.

  **Value is forwarded as one lump.** `msg.value` on the relay call reaches
  `_personalAccount.call{value: msg.value}` (`MemoInstructions.sol:71`) and `executeUserOp`
  distributes it per call; the attached value must equal the batch's `sum(call.value)` or the
  inner call reverts post-settlement.

- **M14-R4 — account reads for this flow. DEVIATION, FOUND IN BUILD: three of the four already
  exist, and the fourth cannot be read at all.** The per-account nonce and pinned executor are
  already read by M13's `personal-account.ts` and the used-transaction-id by its `adapter.ts` —
  those three are `IMemoInstructionsFacet` functions M13 was already calling. No new module;
  `memo-reads.ts` is dropped from the manifest rather than built as a wrapper around existing
  reads.

  The replacement fee is **not externally readable**. `getReplacementFee` is an `internal`
  library function (`library/MemoInstructions.sol:166`) consumed only inside
  `_resolveExecutorFee` (`MemoInstructionsFacet.sol:150`); it is on no facet interface and has
  no external getter anywhere in the vendored tree. The spec asked for a read that does not
  exist.

  What the kit may honestly say instead: a replacement fee is observed from the
  **`ReplacementFeeSet(personalAccount, targetTxId, newFee)` event** of the `0xE2` transaction,
  which carries the true fee (the `+1` is a storage sentinel, not in the event —
  `MemoInstructions.sol:152-153`). And it is **one-shot**: `_resolveExecutorFee` deletes the
  override the moment it is used (`MemoInstructionsFacet.sol:152-153`). So a surface may say
  "a replacement fee was set at ⟨tx⟩", and must **not** claim one is currently pending — the
  chain will not tell us whether it has since been consumed.

- **M14-R5 — the fee and amount computation, before signing. The vendored reference gets this
  wrong twice, and both are corrected here rather than copied.**

  The contract's actual model on the memo path, read end to end:

  ```
  mintingFee   = min(max(floor(total * feeBIPS / 10000), minimumFeeUBA), total)  // DirectMintingFacet.sol:433-436
  toController = total - mintingFee                                              // :395
  require(toController >= memoExecutorFee)                                       // MemoInstructionsFacet.sol:167
  personal account receives = toController - memoExecutorFee                     // :179-181
  ```

  - **The fee basis is the TOTAL, not the net.** The contract charges
    `_receivedAmount.mulBips(feeBIPS)` (`:433`) while the reference computes it from the net
    (`fassets.ts:130`), so the reference under-budgets and the account lands slightly short.
    Second-order, but it grows with the executor fee and it is a real shortfall. To land
    exactly `net`, invert the contract's own formula —
    `total = ceil((net + memoExecutorFee) * 10000 / (10000 - feeBIPS))` — then re-check the
    minimum branch, because `max` may select the floor instead.
  - **The AssetManager charges NO executor fee on this branch.** `_mintToSmartAccounts` mints
    `_receivedAmount - _mintingFeeUBA` (`:395`); the executor fee it computes at `:438-439` is
    consumed only by the plain-EOA path. On the memo path the executor fee is the **memo's own
    bytes 2-9**. The reference adds the AssetManager's default into the total anyway
    (`fassets.ts:132`) while encoding `0n` in the memo — so it merely overpays and the surplus
    is minted to the account. A builder that copied that arithmetic **and** encoded a non-zero
    memo fee would budget one fee and be charged two.
  - Rounding is `floor`, matching `SafePct.mulBips`'s documented round-down (`SafePct.sol:39-43`).
  - **bigint throughout.** The reference round-trips XRP through a JS float
    (`fassets.ts:105,134`); this stays in drops/UBA and formats only at the display edge.

  The plan **forward-simulates the contract's own `_computeFees` on the computed total** and
  asserts the resulting credit equals the target before anything is signed. It refuses an
  amount that would land under the minimum fee, because that is a total, unrecoverable loss.
  A live `0xE2` override silently wins over the memo's fee (`MemoInstructionsFacet.sol:150-154`),
  which the plan states rather than hides.

- **M14-R6 — the plan gate.** Refuses, each with a named typed refusal and a test: an
  unverified network; any destination tag; a memo over the ledger's 1024-byte ceiling; an
  encoded `0xFF` payload the plan cannot fit; a nonce that is not the current read; a `sender`
  that is not the derived personal account; an `executorFeeUBA` above the clamp; a non-zero
  value on a non-userOp opcode; an already-used transaction id; and an amount below the minimum
  fee. Plus the M13 rules it inherits.

- **M14-R7 — simulate the inner call before the payment is signed.** The whole point of the
  atomicity finding: `eth_call` the `callData` against the personal account through the
  controller and surface a revert as a refusal, not as a post-payment surprise. A simulation
  that cannot be performed is a stated warning, never a silent pass.

- **M14-R8 — the lifecycle, and its third state.** Legs: XRPL payment validates → FDC
  `XRPPayment` round and proof → `executeDirectMinting[WithData]` submitted → the effect read
  back. `succeeded` only from `UserOperationExecuted` **and** the observable consequence.
  `DirectMintingDelayed` is its own state — retryable with the **same proof** after
  `executionAllowedAt`, never a failure and never a success — polled through
  `directMintingDelayState`.

- **M14-R9 — the five recovery paths, as first-class operations.** `0xE0` skip-memo (only while
  the stuck id is unused, and the recovery payment must itself mint something positive), `0xE1`
  fast-forward nonce (strictly greater, jump ≤ `type(uint32).max`), `0xE2` replacement fee
  (`newFee` ≤ `2^64 - 2`, because the `+1` is checked arithmetic), `0xD0` pin and `0xD1` unpin.
  Ordering is stated where it matters: if the payment never minted, `0xE0` comes first.

- **M14-R10 — self-relay.** Request the `XRPPayment` attestation with `proofOwner` set to the
  kit's own EOA, retrieve the proof, and submit `executeDirectMinting` — or
  `executeDirectMintingWithData` when we are the executor for a `0xFE`. A third party racing us
  yields `PaymentAlreadyConfirmed`, which is a **normal condition** to absorb, not a failure.

- **M14-R11 — React hooks and surfaces.** `useMemoInstruction`; a composer that shows the whole
  chain before approval including the simulation result and the public-payload warning, a
  recovery surface for the five opcodes, and the account's nonce/executor/pin state. Reuses
  M13's card and timeline vocabulary; no new spine.

- **M14-R12 — the mock, written after the live runs**, copying observed and refusing
  unobserved, as M13's.

## Out of scope (M14)

- **Mainnet writes.** A read lens, as M13.
- **Operating a relayer or an executor service for others.** We self-relay our own operations.
- **A Flare-side shim contract** to compress calldata that cannot fit a memo. The plan refuses
  and says why; deploying a contract is out of this project's shape.
- **`walletId` registration.** Flare Foundation–assigned, dead on chain, sent as `0`.
- **Recovering value stranded by the protocol's own design** — an underpayment burned to the
  fee receiver, or native value sent to a non-userOp opcode. There is no mechanism; the kit
  prevents rather than promises.

## Acceptance criteria

- **M14-AC1 — codec parity with the chain.** Every opcode round-trips, and the encoded bytes
  are asserted against the vendored reference encoder's algorithm and the contract's own length
  requires. `0xD0` is proven to be 30 bytes with an unpadded address.
- **M14-AC2 — the refusals hold.** Every M14-R6 refusal has a test, and the destination-tag
  refusal is proven on both construction and proof submission.
- **M14-AC3 — reads are live on both networks**, `undefined` on failure. ~~and the replacement
  fee reads back through the accessor rather than the offset slot~~ — **corrected in build,
  2026-08-14.** There is no accessor. `getReplacementFee` is `internal view`
  (`MemoInstructions.sol:166-174`) and no facet re-exposes it, so the clause was unsatisfiable
  as written. The probe proves the absence on chain rather than citing the source, and
  `ReplacementFeeSet` is the only observable — never claimed as current state.

  Satisfied 2026-08-14: `.thoughts/verification/2026-08-14-m14-probe.json`. It also settles
  M13's mistaken claim that `executeDirectMintingWithData` is absent — the diamond loupe names
  its facet on BOTH networks (selector `0xa7556da6`). Note the first version of that probe
  could NOT establish this: it read reverts, and `executeDirectMinting` — called live since M1
  — failed identically to the function under test.
- **M14-AC4 — a live Coston2 round trip.** One `0xFF` (or `0xFE` where the batch demands it)
  memo instruction: fund, sign the XRPL payment, request the `XRPPayment` attestation with our
  `proofOwner`, self-relay `executeDirectMinting[WithData]`, and read back
  `UserOperationExecuted` **and** the instruction's own observable effect. Evidence recorded as
  M13's was. If it cannot be driven, it ships declared-unbuilt and the flag stays `false`.
- **M14-AC5 — the delayed state is honest**, reachable from props, rendered as neither success
  nor failure, and never inviting a second payment.
- **M14-AC6 — surfaces browser-verified in both themes**, zero new a11y findings, driven only
  through states the live run observed.
- **M14-AC7 — gate green, mock honest, reviewed** by the four-lens review gate, with every
  Critical and Important fixed and mutation-checked.

## Verification

Coston2 (114), reusing the M8–M13 signer and the XRPL testnet account M13 drove. Reads keyless.
The live run uses the standing double broadcast guard and the delegation's bound: testnet only.

The vendored tests drive the facet through an **AssetManager mock**
(`MasterAccountController.t.sol:2536`), so the AssetManager-side behaviours that matter most —
the destination-tag redirect, the delayed early-return, the underpayment burn — are **not**
covered by any vendored test and must be reached against the real Coston2 AssetManager or
proven by targeted reads.

## Sources

Vendored source (authoritative): `smartAccounts/library/MemoInstructions.sol`,
`smartAccounts/facets/MemoInstructionsFacet.sol`, `smartAccounts/implementation/PersonalAccount.sol`,
`fassets/assetManager/facets/DirectMintingFacet.sol`, `fassets/userInterfaces/IDirectMinting.sol`,
`fassets/mintingTagManager/MintingTagManager.sol`, `flare-viem-starter/src/utils/smart-accounts.ts`
(the only working encoder for all seven opcodes).

Vendored hub: `smart-accounts/4-memo-field-custom-instruction.mdx`, `3-custom-instruction.mdx`,
`5-custom-instruction-comparison.mdx`, `07-recover-stuck-mint-transaction.mdx`,
`08-fast-forward-nonce.mdx`, `fdc/attestation-types/xrp-payment.mdx`, `fassets/02-minting.mdx`.

Corrections this milestone makes to M13's spec, both recorded rather than quietly fixed:
`executeDirectMintingWithData` **does** exist and is live on Coston2 — the absence was in our
own ABI; and M13's "pinned executor" prose pointed at `ExecutorsFacet`, which is a **global,
governance-set** executor consumed only by the FXRP redeem path, not the per-account pin the
memo flow uses.
