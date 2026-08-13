# Spec: flare-kit milestone 13 — XRPL-controlled Smart Accounts, part one: the personal account and its built-in instructions (proof-based flow on Coston2 + a mainnet read lens), real-first (SmartAccountCard + InstructionCatalogue + InstructionComposer)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`.
> The governing decision's row **"XRPL-controlled Smart Accounts"** is the family
> after the governance/delegation/staking/rewards row that was split into M10, M11
> and M12. It closes `R-SA-001`…`R-SA-010` from
> `.thoughts/specs/2026-08-03-flare-application-layer.md` and surfaces `SA-01`…`SA-06`
> from `.thoughts/design/2026-08-03-product-surface-map.md`.
>
> **Split decision (Abu, this session, 2026-08-13).** Offered one milestone for the
> whole family, a two-way split, or a read-only-first step, Abu chose the **two-way
> split**, because the family has two genuinely different substrates that happen to
> share one account:
>
> - **M13 (this spec) — the account and its built-in instructions.** The
>   **proof-based flow**: an XRPL `Payment` carrying a 32-byte *payment reference* →
>   an FDC `Payment` attestation → `MasterAccountController.executeInstruction`.
>   Covers `SA-01` (Personal Account overview), `SA-02` (built-in action catalogue and
>   composer) and the proof-based half of `SA-05` (execution timeline).
> - **M14 (pre-committed here, not built here) — custom instructions.** The
>   **direct-minting memo flow**: an XRPL `Payment` to the FAssets Core Vault carrying
>   a *memo* → FXRP minted into the controller → routed to the personal account → memo
>   opcode dispatched. Covers `SA-03` (atomic batch builder over `PackedUserOperation`),
>   `SA-04` (`0xFF` inline / `0xFE` hash-commitment delivery modes, executor selection
>   and pinning), the memo half of `SA-05`, and `SA-06` (the recovery opcodes `0xE0`
>   skip-memo, `0xE1` fast-forward nonce, `0xE2` replace executor fee, `0xD0`/`0xD1`
>   pin/unpin executor). **M14 is not descoped and not deferred for time** — it is the
>   second half of an accepted family, and this spec pre-commits its direction the way
>   the accepted M10 spec pre-committed M12's.
>
> **Depth decision (Abu, this session, 2026-08-13): two live round trips.** Offered
> transfer-only / transfer + one vault deposit / transfer + deposit + redeem, Abu chose
> **transfer + one vault deposit** — the FXRP `transfer` instruction (which
> `CREATE2`-deploys the personal account and moves a real FAsset balance out of it) and
> one vault `deposit` instruction against a **controller-registered** vault, which
> proves the smart-account vault-id namespace resolves for real rather than being
> assumed from M7's registry.
>
> **Network decision (Abu, this session, 2026-08-13): both networks, mainnet as a
> read-only lens.** Coston2 is the write/verify target; Flare mainnet is read live for
> its real deployment parameters and to demonstrate the family's headline guarantee —
> that one XRPL address derives the **same** personal account address on both networks.
> The M12 shape.
>
> ---
>
> **Load-bearing grounding — a live, keyless probe run this session (2026-08-13),
> not documentation.** Every number below was read from the deployed contracts on both
> networks. `probe-smart-accounts.mjs` (M13-R1) re-runs it and records it as evidence;
> no value here is hand-trusted, and only the controller address is snapshotted as a
> constant (see M13-R1 for why).
>
> | | **Coston2** (write/verify) | **Flare mainnet** (read lens) |
> |---|---|---|
> | `MasterAccountController` | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` | **the same address** |
> | Resolvable from `FlareContractRegistry` | yes, by name, 69 registered contracts | yes, by name, 67 registered contracts |
> | Registered operator XRPL wallet | `rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq` (exactly one) | `rM2LEysS4isvAJkZFfxKDL5z4aTfWcBTXV` (exactly one) |
> | FDC source id | `testXRP` | `XRP` |
> | Proof validity window | **86 400 s** (24 h) | **7 200 s** (2 h) |
> | Instruction fee, all eleven ids | 1 000 drops (the default; no id overrides it) | 500 000 drops |
> | Registered vaults | 4 — ids 4, 2, 3 (`Upshift`) and 1 (`Firelight`) | 3 — id 1 (`Firelight`), ids 2, 3 (`Upshift`) |
> | Registered agent vaults | id 1 → `0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC` | id 1 → `0x09011d2A11A40DB855Cb00B3AA5a0F5F3bd485FD` |
> | Default executor / fee | `0x103b384064ae85577127097A7cCadfd6fb13f437` / `100000000000` | `0x02954e158Be2b477E1C26F31e8AA0c21b378445C` / `10000000000000000000` |
>
> - **The personal account is deterministic and network-independent.** The M8/M9/M10/M11
>   XRPL testnet address `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` derives personal account
>   **`0x89023176a776CDB1d339a7649116B1a6f3DeFfcb` on Coston2 *and* on Flare mainnet** —
>   confirmed live on both, `CREATE2` from the XRPL address. On both networks it is
>   **not deployed**, nonce `0`, no pinned executor, zero balances. A genuine blank
>   slate, which makes the first live instruction its own deployment evidence.
> - **`executeInstruction` is permissionless.** `InstructionsFacet.executeInstruction`
>   carries only a `notPaused` modifier
>   (`sources/flare-foundation/flare-smart-accounts/contracts/smartAccounts/facets/InstructionsFacet.sol:138`).
>   **flare-kit is therefore its own operator**: it builds the XRPL payment, requests
>   the FDC `Payment` attestation itself (M3, live-verified), and submits the proof
>   itself. **No third-party operator backend, indexer or executor is a dependency of
>   this milestone.** That is why this family is verifiable at all.
> - **The whole flow is already three-quarters built, in other milestones.** M1 built
>   XRPL `Payment` construction (`packages/core/src/xrpl.ts` — `UnsignedXrplPayment`,
>   memo-as-`MemoData`, and the explicit *no `DestinationTag`* rule the Smart Accounts
>   docs independently require). M3 built and live-verified the FDC `Payment`
>   attestation family (`packages/core/src/fdc/families/xrp-payment.ts`), including
>   `toProofStruct`, which already produces exactly the `IPayment.Proof` tuple
>   `executeInstruction` takes. M7 built the Firelight/Upshift vault semantics. M8 built
>   XRPL reads and the chunked-`eth_getLogs` rule. M13 composes them; it does not
>   re-implement any of them.
> - **The smart-account vault registry is its own id → address namespace, and on
>   Coston2 it points at different deployments from M7's.** The controller's Coston2
>   vaults are `TESTstXRP` `0xD91324A6…0B5b`, `TESTearnXRP` `0x9E63a5D2…8319`,
>   `TESTstXRP` `0x4066A136…355E` and `stXRP` `0xC90D6847…0361` — **none** of which is
>   M7's Coston2 Firelight `0x91Bfe6A6…E40B` or Upshift `0x24c1a47c…7C81`. On mainnet
>   they do overlap (controller vault id 2 **is** M7's `earnXRP`
>   `0x373D7d20…dEA28`). Vault ids must therefore be resolved from the controller's
>   `getVaults()` on every network, **never** mapped from `packages/contracts/src/vaults.ts`.
> - **The instruction-type nibble *is* the vault-type enum.**
>   `Instructions.sol` calls `Vault.deposit(personalAccount, IVaultsFacet.VaultType(instructionType), vault, amount)`,
>   and `IVaultsFacet.VaultType` is `None = 0, Firelight = 1, Upshift = 2` — identical
>   to the instruction types `FXRP = 0, Firelight = 1, Upshift = 2`. A Firelight
>   instruction pointed at a type-`Upshift` vault id is a **plan-time refusal**, not a
>   runtime revert.
> - **The proof window is a real clock, and it differs by network by a factor of
>   twelve.** `PaymentProofs.verifyPayment` requires
>   `block.timestamp <= paymentProofValidityDurationSeconds + responseBody.blockTimestamp`.
>   Coston2 gives 24 hours; **mainnet gives 2**. An FDC round plus data-availability
>   indexing must land inside that window, and past it the instruction can *never*
>   execute while the XRP has already left the user — the exact `R-SA-008` case.
> - **`InstructionExecuted` indexes `personalAccount`, `transactionId` and
>   `paymentReference`.** This is the opposite of M1's direct-minting events, which
>   index nothing (hence the standing rule to correlate by decoding the receipt). Here a
>   topic filter is the correct tool, and it is what makes `R-SA-009`'s
>   backfill-from-a-safe-boundary watcher possible.
> - **The account substrate is funded and needs no faucet trip.** Signer
>   `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` holds **146.479173436830560487 C2FLR**
>   and **21.796258 FTestXRP**; XRPL testnet `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` holds
>   **94.890038 XRP**. A live instruction costs 1 000 drops of fee plus an XRPL
>   transaction fee, an FDC request fee (1 000 wei on Coston2) and Coston2 gas. There is
>   **no funding wall** — unlike M11's 50 000-FLR staking floor.

> ---
>
> **CORRECTION, found in build (2026-08-13, after acceptance).** The grounding above
> claimed that M3's live-verified attestation work already produces the proof
> `executeInstruction` takes, citing `toProofStruct`. **That is wrong, and the mistake
> was mine.** `XRPPayment` and `Payment` are two different FDC attestation types:
>
> - `XRPPayment`'s request body is `{transactionId, proofOwner}`; `Payment`'s is
>   `{transactionId, inUtxo, utxo}`.
> - `XRPPayment`'s response carries `sourceAddress`, `firstMemoData`,
>   `hasDestinationTag` and `destinationTag`. **`Payment`'s carries
>   `standardPaymentReference`** (plus `sourceAddressesRoot` and `oneToOne`) — and
>   `standardPaymentReference` is the exact field
>   `InstructionsFacet.executeInstruction` reads to dispatch the instruction.
> - `packages/core/src/fdc/families/xrp-payment.ts:13-17` states the same asymmetry in
>   the other direction: *"A `Payment` proof will not verify against the AssetManager."*
> - `packages/contracts/src/fdc/family-table.ts:184` already catalogues `Payment` with
>   **`hasBuilder: false`** — M3 knew the family existed and deliberately did not build
>   a request builder for it.
>
> **Consequence: M13 builds a fifth attestation family** (`M13-R2b`). The Coston2 XRPL
> verifier does serve `/verifier/xrp/Payment/prepareRequest` (probed live this session
> against `api-doc-json`), so the path is available and nothing is blocked — but it is
> new work that this spec did not price, and it reaches one line outside M13's stated
> surface: `family-table.ts`'s `Payment` row must flip to `hasBuilder: true`, or M3's
> capability catalogue will assert the kit cannot build a request it demonstrably can.
> That flip is a truth repair, not a scope grab, and it is treated as a cross-milestone
> edit: M3's catalogue suite is re-run in full after it (the M10 verified-flag lesson).

## Objective

After this milestone a developer can install the kit and drop a working
**XRPL-controlled Smart Account** console into their own React app, and:

- a person holding **only an XRPL address and only XRP** — no Flare account, no FLR,
  no EVM key — can see the **personal account** that XRPL address controls on Flare:
  its deterministic address, whether it has been deployed yet, its balances, its memo
  nonce, its pinned executor and the deployment's fee settings, read live on **both**
  Coston2 and Flare mainnet, and see for themselves that the address is **the same on
  both**;
- the same person can **discover** the built-in instructions the *deployed* controller
  can actually serve — not a frozen list — with each instruction's required payment,
  value denomination, downstream effect and availability derived from live deployment
  state; and
- they can **compose and execute one**, end to end and for real: an XRPL `Payment`
  carrying a 32-byte payment reference → an FDC `Payment` attestation → a permissionless
  `executeInstruction` → a personal account **deployed by `CREATE2` on first use** that
  **transfers a real FAsset balance** and **deposits into a real vault** — where
  `succeeded` is entered only from reading the instruction's own effect back off the
  chain.

Smart Accounts is the capability that **inverts the kit's usual direction**. Every
milestone so far started from an EVM signer. This one starts from an XRPL signature and
an XRP payment, and the Flare-side account is a consequence. It is also the milestone
that **composes** the most: M1's XRPL payment construction, M3's live-verified FDC
`Payment` attestation, M7's vault semantics, M8's XRPL reads, and the durable
self-reconciling operation lifecycle M1 forced into being.

## The surfaces, and why they differ

- **The `SmartAccountCard` is an identity surface, not an operation surface** (`SA-01`).
  It is closest to M2's `AccountSheet`, but the account it describes is one the user has
  never touched and may not exist yet: a `CREATE2` address derived from an XRPL address,
  possibly undeployed, possibly holding balances anyway. It renders the XRPL controller,
  the personal account address, **deployed / not deployed** as a first-class fact,
  balances, memo nonce, pinned executor, and the deployment's fee settings — for both
  networks, side by side, with the identical-address property visible rather than
  asserted.

- **The `InstructionCatalogue` is a capability-discovery surface** (`SA-02`), the
  anatomy `AttestationCatalogue`, `FeedCatalogue`, `RouteCatalogue`, `PoolCatalogue` and
  `VaultCatalogue` already established. Its rows are the protocol's eleven built-in
  instructions, but their **availability is read, not declared**: an instruction whose
  vault id is not registered on this deployment is `unavailable` with the reason, and
  the three legacy collateral-reservation commands are `superseded` — the deployment's
  own documentation directs users to FAssets minting instead. `R-SA-002` requires
  capability discovery rather than a permanent assumed list, and this is where that is
  enforced.

- **The `InstructionComposer` is a plan surface with an unusually long tail**
  (`SA-02`, `R-SA-004`). Approving it commits the user to an XRPL payment that leaves
  their wallet **before** anything on Flare is knowable. So the plan must show the whole
  chain before approval: the exact XRPL payment (destination, drops, the 32 memo bytes,
  the absence of a destination tag), the instruction fee, the FDC request fee and voting
  round, the proof-retrieval wait, the `executeInstruction` submission, **and** the
  downstream call the personal account will make — with the proof-expiry deadline stated
  as a wall-clock time, not a duration.

- **The execution timeline is the existing `OperationTimeline`/`LegTimeline`**
  (`SA-05`, proof-based half), not a new component. The legs are XRPL validation → FDC
  round finality and proof retrieval → `executeInstruction` → the downstream effect,
  which is the same four-actor shape M8's bridge redeem already draws.

## The honesty it forces

- **A submitted payment is not an executed instruction, and this flow has four places
  it can stop.** `succeeded` is entered **only** from reading the instruction's own
  effect back: the decoded `InstructionExecuted` event **and** the observable
  consequence — the recipient's FAsset balance for a transfer, the personal account's
  vault share balance for a deposit. Never from the XRPL payment landing, never from the
  proof retrieving, never from the `executeInstruction` transaction being mined.

- **The proof window is a deadline, and expiry is a first-class terminal state that
  must not invite a duplicate payment.** Past
  `blockTimestamp + paymentProofValidityDurationSeconds` the instruction can never
  execute, while the XRP has already reached the operator's wallet. The surface must say
  exactly that — where the funds are, that the instruction is dead, and that paying
  again is a **new** payment, not a retry. This is `R-SA-008` and it is the honesty case
  most likely to be got wrong by a "Retry" button.

- **An unknown outcome is never a failure.** An XRPL payment the kit cannot yet find, an
  FDC round not yet finalized, a proof not yet retrievable, an `executeInstruction`
  receipt not yet read — each is `awaiting_external` or `unavailable`, never `failed`.
  The M3 rule stands: never conclude "no proof" from a single absence.

- **Deployment state is read, never assumed.** Operator XRPL wallets, source id, proof
  window, instruction fees, vault ids, agent vault ids and the default executor are
  **mutable operator settings**, not protocol constants. They are read from the deployed
  controller on every plan and never snapshotted into `@flare-kit/contracts` — only the
  controller address is a constant (M13-R1).

- **Vault ids come from the controller.** Never from `vaults.ts`; on Coston2 the two
  registries disagree, and a plan that resolved M7's Firelight address for controller
  vault id 1 would sign a payment for an instruction that deposits somewhere else.

- **Never invent a zero.** An unread balance, nonce or fee is `unavailable` and renders
  `—`, distinct from an observed `0`. The personal account being **undeployed** is a
  read fact, distinct from both.

- **Never fabricate the account's history.** Recent actions come from an
  `InstructionExecuted` scan that **backfills from a safe boundary** (`R-SA-009`); a
  scan that could not complete renders `unavailable`, never an empty history — an empty
  list is a claim that the chain has none, exactly the bug the M12 review gate caught in
  proposal discovery.

- **`smartAccountsVerified` gates every write** and the portfolio flip. It starts
  `false`; it flips `true` only after the live Coston2 `executeInstruction` round trip
  reads its effect back. Until then the surfaces show the configured path and a
  declared-unbuilt affordance, never a plan. The M10/M11/M12 shape.

- **Mainnet is a read lens.** Its parameters and derived personal account are read and
  labelled cross-network, read-only. No write targets mainnet in M13.

- **Exact values render in the mono face** — drops, UBA, lots, shares, fees, nonces,
  addresses and periods — carrying their asset and full precision, with the value's
  **denomination named** (drops, lots, shares, period, `yyyymmdd` date) because the same
  80-bit field means five different things across the eleven instructions. Files stay
  under 300 lines; one shared component per pattern.

## Requirements

- **M13-R1 — `@flare-kit/contracts` gains the smart-accounts registry, and it is
  deliberately thin.** `smart-accounts.ts` (+ `smart-accounts-abis.ts`) carries the
  `MasterAccountController` address for **`coston2` and `flare`** as exported constants,
  plus a **`smartAccountsVerified`** flag per network. The address is **resolved offline
  from `FlareContractRegistry.getAllContracts()` by name on each network** and
  snapshotted, asserted by extending `manifest-parity.test.ts` against a live registry
  read on both networks; no address literal exists outside the registry.
  **Everything else the controller exposes is live deployment state and is NOT
  snapshotted** — operator XRPL wallets, source id, proof validity duration, instruction
  fees, vault ids, agent vault ids and the default executor are operator-mutable and are
  read at plan time (M13-R3). This is the deliberate difference from M12, where the four
  governance addresses were constants; freezing an operator's fee or wallet list here
  would produce a plan that signs an XRPL payment to a stale destination.
  `packages/core/scripts/probe-smart-accounts.mjs` re-runs the keyless probe on both
  networks and records it as evidence.

- **M13-R2 — the 32-byte payment reference is a typed, command-aware codec.**
  `packages/core/src/smart-accounts/payment-reference.ts` encodes and decodes the
  reference exactly as `PaymentReferenceParser.sol` reads it: byte 0 is the instruction
  id (high nibble type, low nibble command), byte 1 the wallet identifier (`0` unless
  the Flare Foundation assigned one), bytes 2–11 a `uint80` value, and then a
  **command-dependent** tail — bytes 12–13 a `uint16` agent vault id, bytes 14–15 a
  `uint16` vault id, or bytes 12–31 a 20-byte EVM address. The tail windows **overlap**,
  so a decoder that reads every field unconditionally is wrong; decoding dispatches on
  the command. The codec refuses what the parser reverts on (`value == 0`,
  `agentVaultId == 0`, `vaultId == 0`, the zero address) and carries the value's
  **denomination** — lots, drops, shares, a Firelight period, or an Upshift `yyyymmdd`
  date — as typed data, never a bare amount. Round-trip tested against fixtures derived
  from the Solidity shifts.

- **M13-R2b — the kit gains the chain-agnostic `Payment` attestation family** (added by
  the correction above). `packages/core/src/fdc/families/payment.ts` instantiates M3's
  generic attestation lifecycle for the `Payment` type: request body
  `{transactionId, inUtxo, utxo}` (both indices `0` on a non-UTXO chain), a response body
  carrying **`standardPaymentReference`**, `sourceAddressesRoot` and `oneToOne`, and a
  `toProofStruct` producing the `IPayment.Proof` tuple `executeInstruction` takes.
  `packages/contracts/src/fdc/payment-abi.ts` carries that struct and
  `FdcVerification.verifyPayment`, which the kit did not previously need. The family is
  **not** proof-owner bound (`bindsProofOwner: false` — the controller binds the XRPL
  source address instead), so nothing about the M1 mint path changes. The
  `family-table.ts` `Payment` row flips `hasBuilder: false → true`, and M3's catalogue
  suite is re-run in full afterwards.

- **M13-R3 — the adapter reads the live deployment, and never invents a value.**
  `packages/core/src/smart-accounts/adapter.ts` reads `getPersonalAccount(xrplAddress)`,
  the personal account's **deployment state** (code size), `getNonce`, `getExecutor`
  (pinned), `getXrplProviderWallets`, `getSourceId`,
  `getPaymentProofValidityDurationSeconds`, `getDefaultInstructionFee`,
  `getInstructionFee(id)`, `getVaults` (ids, addresses, types), `getAgentVaults`,
  `getExecutorInfo` and `isTransactionIdUsed`, plus the personal account's native, FAsset
  and vault-share balances. Every read is `undefined`-on-throw and surfaces as
  `unavailable`; a revert is never coerced into a zero, an empty list or `false` (the
  M10/M12 adapter rule, and the `isMember`-reverts lesson). Call builders are pure.

- **M13-R4 — the instruction catalogue is discovered, not declared** (`R-SA-002`).
  `packages/core/src/smart-accounts/catalogue.ts` produces one row per built-in
  instruction with its id, type, command, name, value denomination, required payment
  (`getInstructionFee(id)`, falling back to the default **as the contract does**),
  downstream target and **availability derived from live deployment state**: `available`
  where the deployment can serve it, `unavailable` with a reason where it cannot (no
  registered vault of the required type, no registered agent vault), and `superseded`
  for the three legacy collateral-reservation commands `0x00`/`0x10`/`0x20`, which the
  deployment's own documentation redirects to FAssets minting. The instruction-type
  nibble is validated against `IVaultsFacet.VaultType` for every vault-bearing command.
  A future instruction id the kit does not know is rendered `unrecognised`, never hidden.

- **M13-R5 — `planInstruction` gates on verification first, then on invariants the
  chain would otherwise enforce after the money has moved.**
  `packages/core/src/smart-accounts/plan.ts` refuses `unverified` before reading
  anything, then enforces: the destination is an operator wallet from the **live**
  `getXrplProviderWallets()` read; the payment amount is at least the instruction's fee
  (`executeInstruction` requires `receivedAmount >= instructionFee`); **no
  `DestinationTag`** under any circumstance — a tag redirects FAssets minting to the
  tag-holder and would let an unrelated party front-run the instruction; `value > 0`; a
  vault id that is registered **and of the matching type**; a registered agent vault id;
  a non-zero recipient for `transfer`, and a personal-account FAsset balance that covers
  it, since an inner-call revert rolls the whole Flare transaction back; and
  `isTransactionIdUsed(txId) == false`. The plan carries the **entire** chain for
  approval (`R-SA-004`): XRPL payment, instruction fee, FDC request fee and voting round,
  proof retrieval, `executeInstruction`, the downstream call, and the **proof-expiry
  deadline as a wall-clock instant** computed from the live validity duration. A
  discriminated `Result`; no throwing for expected refusals.

- **M13-R6 — the durable lifecycle walks the canonical table and reaches `succeeded`
  only from the effect.** `packages/core/src/smart-accounts/states.ts` reconciles over
  `states.ts` via the shared `reconcile.ts` helpers (`reconcileTo`/`waitSince`/`advance`
  — never a hand-rolled table walk, per the standing `applyTransition`-drops-its-patch
  rule) across four legs, each `awaiting_external` distinguished by actor: **xrpl**
  (payment validation) → **fdc** (voting-round finality and DA proof retrieval, reusing
  `fdc/operation.ts`) → **flare** (`executeInstruction` submitted) → **effect**. It
  enters `succeeded` only when the decoded `InstructionExecuted` event **and** the
  instruction's observable consequence are both read back. A terminal reconcile
  finalizes the spine steps and clears the awaiting descriptor explicitly (the M8 rule).
  **Proof expiry is a distinct terminal state** carrying where the funds are and the
  statement that re-paying is a new payment, never a retry (`R-SA-008`). It is
  self-reconciling on app open, with no Resume button.

- **M13-R7 — the watcher backfills from a safe boundary** (`R-SA-009`).
  Correlating an XRPL payment and its `InstructionExecuted` uses a **bounded backward
  scan from a safe historical boundary**, chunked to respect the Coston2 `eth_getLogs`
  range cap (the M8 rule), filtered on the indexed `personalAccount` / `transactionId` /
  `paymentReference` topics. An installed listener alone is insufficient and is not the
  implementation. A scan that cannot complete yields `unavailable` — **never** an empty
  history, which would be a claim about the chain.

- **M13-R8 — `mock-smart-accounts.ts` copies what was observed and refuses what was
  not.** It drives the **real** plan builder and the **real** reconciler over a fake
  client, reproduces the live run's reference bytes, fees, addresses and events exactly,
  and **refuses** any instruction, vault id or account it never observed rather than
  answering plausibly. It keeps `smartAccountsVerified` honest per network: `true` for
  Coston2 only if the live round trip landed, `false` for mainnet always. No live path
  constructs a mock under any error.

- **M13-R9 — the React hooks are keyless for reads.** `use-smart-account.ts` (account
  identity, deployment state, balances, nonce, executor, fee settings, both networks,
  plus the plan and the durable lifecycle with an injected wallet client) and
  `use-instruction-catalogue.ts` (discovery). Reads require **no key at all** — an agent
  or a read-only visitor can inspect any XRPL address's personal account. `undefined`
  (unavailable) and `[]` (confirmed-empty) stay distinct end to end.

- **M13-R10 — three surfaces, reusing the existing vocabulary.**
  `SmartAccountCard.tsx` (`SA-01`, + `smart-account-card-state.ts` for the pure state
  split), `InstructionCatalogue.tsx` (`SA-02`) and `InstructionComposer.tsx` (`SA-02`),
  plus `smart-accounts.css` imported into `styles.css`. The execution timeline is the
  existing `OperationTimeline`/`LegTimeline`; chrome is `card-chrome`; provenance is
  `SourceChip`; states are the seven canonical glyphs. No card, badge, pill, chip or
  spine is built inline. Exact values render in the mono face with their denomination
  named.

- **M13-R11 — the portfolio gains a smart-account position.** `portfolio.ts` renders the
  personal account and its balances as `observed | unavailable` once
  `smartAccountsVerified`, and **declared-unbuilt** until then — the M10/M11/M12 flip
  shape. A personal account that is derived but undeployed is a distinct, honest row.

- **M13-R12 — the cross-network identity is verified, not asserted.** The mainnet
  deployment's parameters are read live and labelled a cross-network, read-only lens, and
  a test asserts that `getPersonalAccount(xrplAddress)` returns **the same address on
  both networks** for the probed address. The differing proof windows (24 h vs 2 h) and
  fees (1 000 vs 500 000 drops) are rendered as read deployment facts, never hardcoded
  and never averaged into one number.

## Out of scope (M13)

- **The entire direct-minting memo flow — `0xFF`, `0xFE`, `0xE0`, `0xE1`, `0xE2`,
  `0xD0`, `0xD1`.** Custom instructions, `PackedUserOperation` batches, delivery-mode
  choice, executor selection and pinning, and the five recovery opcodes are **M14**, per
  the split Abu chose this session. They are **not dropped**: M14 is a committed
  milestone of an accepted family, and this spec records its shape. Note for M14:
  `executeDirectMintingWithData` (the `0xFE` path) is **not** in the vendored ABI —
  `executeDirectMinting` (which serves `0xFF`) is — and the executor check only binds
  when an executor is **pinned**, so the kit can be its own executor there too.
- **The legacy collateral-reservation commands `0x00`, `0x10`, `0x20`.** The deployment's
  own documentation supersedes them with FAssets minting, which M1 already built. They
  appear in the catalogue as `superseded` with that reason, and are never composable.
  `reserveCollateral`/`executeDepositAfterMinting` are consequently not called.
- **Redeem, `requestRedeem`, `claimWithdraw` and `claim` instructions executed live.**
  They are built, catalogued and plan-gated, but the live runs Abu authorised are
  `transfer` and one `deposit`. The vault exit legs carry declared, with M7's evidence
  that the underlying period/epoch round trips work.
- **Mainnet writes.** The account holds no mainnet XRP or FXRP; mainnet is a read lens.
- **Operating an executor service or an operator backend.** Unnecessary —
  `executeInstruction` is permissionless — and `OPS-08` (the executor workspace) belongs
  to the operator-surfaces family, not here.
- **Wallet-identifier registration.** Byte 1 of the reference is a Flare
  Foundation–assigned wallet id; the kit sends `0` and exposes the field, and does not
  pretend to register one.
- **A new `ClaimKind` or a new canonical operation state.** The four legs map onto
  `awaiting_external` by actor, exactly as M3's proof wait and M8's delivery wait do.

## Files (added to SPEC.md's `## Files` manifest before writing)

`@flare-kit/contracts`:
- `packages/contracts/src/smart-accounts.ts` — `MasterAccountController` registry for
  `coston2` + `flare`, `smartAccountsVerified`, and the instruction-id vocabulary as
  types. Deliberately carries **no** operator-mutable value. M13-R1.
- `packages/contracts/src/smart-accounts-abis.ts` — `IMasterAccountController` (the
  personal-account, instruction, fee, vault, agent-vault, executor, XRPL-provider-wallet
  and payment-proof read fragments), `executeInstruction`, `InstructionExecuted` and the
  named errors, plus `IPersonalAccount`. M13-R1.
- `packages/contracts/src/index.ts` — export the above.
- `packages/contracts/test/manifest-parity.test.ts` — extend to assert the snapshotted
  controller address resolves by name from `getAllContracts()` on both networks. M13-R1.

- `packages/contracts/src/fdc/payment-abi.ts` — the `IPayment.Proof` struct (distinct
  from `IXRPPayment.Proof`: `{transactionId, inUtxo, utxo}` request, and a response
  carrying `standardPaymentReference`) and `FdcVerification.verifyPayment`. M13-R2b.
- `packages/contracts/src/fdc/family-table.ts` — flip the `Payment` row's `hasBuilder`
  to `true`. M13-R2b.

`@flare-kit/core`:
- `packages/core/src/fdc/families/payment.ts` — the chain-agnostic `Payment` attestation
  family over M3's generic lifecycle; the proof `executeInstruction` takes. M13-R2b.
- `packages/core/src/smart-accounts/payment-reference.ts` — the command-aware 32-byte
  reference codec with typed denominations. M13-R2.
- `packages/core/src/smart-accounts/adapter.ts` — live deployment + personal-account
  reads; `undefined`-on-throw; pure call builders. M13-R3.
- `packages/core/src/smart-accounts/catalogue.ts` — discovered instruction catalogue with
  availability derived from deployment state. M13-R4.
- `packages/core/src/smart-accounts/plan.ts` — verified-gate, invariants, and the
  full-chain plan including the proof-expiry deadline. M13-R5.
- `packages/core/src/smart-accounts/states.ts` — the four-leg durable lifecycle over the
  canonical table; `succeeded` only from the effect; proof expiry terminal. M13-R6.
- `packages/core/src/smart-accounts/watch.ts` — bounded, chunked backfill scan over the
  indexed `InstructionExecuted` topics. M13-R7.
- `packages/core/src/smart-accounts/payment.ts` — the unsigned XRPL instruction payment,
  built on M1's `xrpl.ts` primitives; never touches key material. M13-R5.
- `packages/core/src/mock-smart-accounts.ts` — copies observed, refuses unobserved. M13-R8.
- `packages/core/src/portfolio.ts` — add the smart-account position. M13-R11.
- `packages/core/src/index.ts` — export the above.
- `packages/core/scripts/probe-smart-accounts.mjs` — keyless probe on both networks:
  controller by name, operator wallets, source id, proof window, fees, vaults, agent
  vaults, executor, and the personal account derived for the run's XRPL address.
  Verification / M13-R1 / M13-R12.
- `packages/core/scripts/live-smart-account.mjs` — the gated live round trips: build and
  sign the XRPL payment, request the FDC `Payment` attestation, submit
  `executeInstruction`, read the effect back. Keys from env, never logged. Verification.

`@flare-kit/react`:
- `packages/react/src/use-smart-account.ts` — identity + plan + lifecycle. M13-R9.
- `packages/react/src/use-instruction-catalogue.ts` — discovery. M13-R9.
- `packages/react/src/index.ts` — export the above.

`@flare-kit/react-ui`:
- `packages/react-ui/src/SmartAccountCard.tsx` (+ `smart-account-card-state.ts`) — M13-R10.
- `packages/react-ui/src/InstructionCatalogue.tsx` — M13-R10.
- `packages/react-ui/src/InstructionComposer.tsx` — M13-R10.
- `packages/react-ui/src/smart-accounts.css` — new `fk-sa` classes, `@import`-ed into
  `styles.css`. M13-R10.
- `packages/react-ui/gallery/m13-smart-account-sections.tsx` — drive every state. M13-AC6.
- `packages/react-ui/src/index.ts` — export the above.

## Acceptance criteria

- **M13-AC1 — keyless reads, live on both networks.** `MasterAccountController` resolves
  by name from `getAllContracts()` on Coston2 **and** Flare mainnet at the snapshotted
  address; the operator XRPL wallets, source id, proof validity duration, instruction
  fees, registered vaults (with types), agent vaults and default executor read live on
  both; the personal account for the run's XRPL address derives, and its deployment
  state, nonce, pinned executor and balances read live. Absent reads render
  `unavailable`, never a zero, an empty list or `false`.

- **M13-AC2 — the identical-address property is verified.**
  `getPersonalAccount(rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio)` returns the **same** address
  on Coston2 and Flare mainnet, asserted in a test and recorded in the evidence.

- **M13-AC3 — the catalogue is discovered and the plan is gated.** Every built-in
  instruction is catalogued with its availability derived from live deployment state
  (including `superseded` for the three legacy CRT commands and `unavailable` with a
  reason where no vault of the required type is registered). `planInstruction` refuses
  `unverified` first, then refuses a non-operator destination, an underpaid fee, any
  destination tag, a zero value, an unregistered or type-mismatched vault id, an
  unregistered agent vault, a zero or unfunded transfer recipient, and a used
  transaction id — each with a named, typed refusal, and each covered by a test.

- **M13-AC4 — the live round trips, gated on Abu's go, flip `smartAccountsVerified`.**
  On Coston2, with Abu's authorisation:
  1. **FXRP `transfer` (`0x01`).** Fund the personal account
     `0x89023176a776CDB1d339a7649116B1a6f3DeFfcb` with FTestXRP, sign an XRPL `Payment`
     to `rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq` for ≥ 1 000 drops carrying the encoded
     reference, request the FDC `Payment` attestation, submit `executeInstruction`, and
     read back: the personal account **deployed by `CREATE2`** at the predicted address,
     the decoded `InstructionExecuted`, and the **recipient's FTestXRP balance
     increased by exactly the instructed drops**.
  2. **Vault `deposit` (`0x11` Firelight or `0x21` Upshift).** Same chain against a
     **controller-registered** vault id, reading back the personal account's **vault
     share balance**.
  `smartAccountsVerified` flips `true` for `coston2` only after (1) reads back; `flare`
  stays `false`. XRPL transaction hashes, FDC voting round, Flare transaction hashes,
  block numbers and explorer links recorded. **If Abu withholds the go**, every read is
  recorded, the write carries declared-unbuilt, the portfolio position stays unbuilt, and
  nothing is faked — the honest collapse, the M11 shape.

- **M13-AC5 — the failure and expiry states are honest.** A payment the kit cannot find,
  an unfinalized round, an unretrievable proof and an unread receipt each render
  `awaiting_external` or `unavailable`, never `failed`. A proof past its validity window
  renders the terminal expiry state naming where the funds are and stating that paying
  again is a new payment — with **no retry affordance on the dead operation**. Both are
  reachable from props and rendered in the gallery.

- **M13-AC6 — surfaces, browser-verified, both themes.** `SmartAccountCard`,
  `InstructionCatalogue` and `InstructionComposer` are driven in a real browser through
  every required state via the gallery, in light and dark — including undeployed vs
  deployed, observed `0` vs `unavailable —`, every catalogue availability state, the full
  plan before approval, all four in-flight legs, `succeeded`, proof-expired, and an
  `unavailable` history distinct from a confirmed-empty one. Exact values render in the
  mono face with full precision and their denomination named. The a11y audit reports zero
  new `fk-sa` issues. The gallery renders only states the live run observed. Screens
  recorded.

- **M13-AC7 — gate green; runtime lean; mock honest; reviewed.**
  `pnpm build && pnpm typecheck && pnpm lint && pnpm test` exits 0 with the command and
  its output shown; `publint` clean; **no new runtime dependency** — the XRPL payment is
  built from M1's primitives and signed only inside the gated live script. Production
  files stay under 300 lines. `mock-smart-accounts` reproduces the live runs and refuses
  the unobserved. Review-gate subagents (correctness, honest-rendering/silent-failure,
  simplification) run over the M13 diff and every critical and important finding is fixed
  and re-tested.

## Verification

Real-first, on Coston2 (114) with the Flare mainnet (14) read lens, reusing the
M8–M12 signer `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` and the XRPL testnet account
`rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio`. Reads are keyless; the live instruction runs need
**Abu's go** (the standing prior-milestone gate) but face **no funding wall**.

1. **Probe and snapshot (M13-AC1, M13-AC2).** `probe-smart-accounts.mjs` resolves
   `MasterAccountController` by name from `getAllContracts()` on both networks, reads
   every deployment parameter, derives the personal account on both, and records the
   result as JSON evidence. The parity test pins the address; nothing else is pinned.
2. **Codec and catalogue (M13-AC3).** Round-trip the reference codec against fixtures
   derived from `PaymentReferenceParser.sol`'s shifts, including the overlapping
   command-dependent tails. Assert the catalogue's availability derivation against the
   probed deployment state on both networks.
3. **Plan invariants (M13-AC3).** Assert every refusal, including the destination-tag
   prohibition and the vault-type match, before any live run.
4. **Live run 1 — FXRP transfer (M13-AC4), gated.** Fund the personal account; build,
   sign and submit the XRPL payment; watch it validate; request the FDC `Payment`
   attestation and retrieve the proof (polling, never concluding absence from one miss);
   submit `executeInstruction`; read back the `CREATE2` deployment, the decoded
   `InstructionExecuted`, and the recipient balance delta. Flip
   `smartAccountsVerified.coston2`. Re-run the **full** suite after the flip — a
   verified-flag flip breaks fixtures that relied on the default (the M10 lesson).
5. **Live run 2 — vault deposit (M13-AC4), gated.** The same chain against a
   controller-registered vault id, reading back the share balance.
6. **Write `mock-smart-accounts.ts` from the observed runs**, then the gallery, the
   browser verification in both themes, the a11y audit, the full gate and the review gate.

Evidence recorded under `.thoughts/verification/2026-08-13-m13-smart-accounts.md`
(+ `m13-probe.json`, `coston2-live-smart-account.json`, `m13-screens/`) with the date,
both networks, the controller and personal-account addresses, the XRPL transaction
hashes, the FDC voting round, the Flare transaction hashes and explorer links.
**Secrets rule:** signing keys and the XRPL seed are never logged, never printed in
`--json` output, and never included in evidence, receipts or support bundles.

## Sources

Grounding, this session (2026-08-13):

- **Live keyless probe of both deployments** — `MasterAccountController` resolved by
  name from `FlareContractRegistry` `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` on
  Coston2 and Flare mainnet; `getXrplProviderWallets`, `getSourceId`,
  `getPaymentProofValidityDurationSeconds`, `getDefaultInstructionFee`,
  `getInstructionFee` for all eleven ids, `getVaults`, `getAgentVaults`,
  `getExecutorInfo`, `getPersonalAccount`, `getNonce`, `getExecutor`, plus the personal
  account's code size and balances, and the ERC-20 symbols of the four
  controller-registered Coston2 vaults. Every number in the grounding table above.
- **Contract source, not just documentation** —
  `sources/flare-foundation/flare-smart-accounts/contracts/smartAccounts/facets/InstructionsFacet.sol`
  (`executeInstruction` is `notPaused` only — permissionless),
  `library/PaymentProofs.sol` (source id, status, **proof-expiry window**, source-address
  hash, registered-receiving-address check, `FdcVerification.verifyPayment`),
  `library/PaymentReferenceParser.sol` (the exact 32-byte layout and its overlapping
  command-dependent tails, and the non-zero requirements),
  `facets/MemoInstructionsFacet.sol` (the memo dispatch and the pinned-executor gate —
  **M14 grounding**), `userInterfaces/facets/IVaultsFacet.sol`
  (`VaultType { None, Firelight, Upshift }`), `IInstructionsFacet.sol`
  (`InstructionExecuted` with three indexed parameters).
- **Developer hub** — `developer-hub/docs/smart-accounts/1-overview.mdx` (both flows, the
  instruction table, the memo opcodes), `4-memo-field-custom-instruction.mdx` (the
  no-destination-tag warning; *"any indexer that observes the XRPL payment can submit the
  FDC proof"*), `6-reference.mdx` and
  `src/features/SmartAccounts/Reference/reference-data.ts` (same address on all networks,
  resolve from the registry), `reference/IMasterAccountController.mdx`,
  `reference/IPersonalAccount.mdx`.
- **Accepted product requirements** —
  `.thoughts/specs/2026-08-03-flare-application-layer.md` §7 `R-SA-001`…`R-SA-010`;
  `.thoughts/design/2026-08-03-product-surface-map.md` `SA-01`…`SA-06`.
- **Codebase reuse targets** — `packages/core/src/xrpl.ts` (`UnsignedXrplPayment`,
  memo-as-`MemoData`, the no-`DestinationTag` rule, `xrpToDrops`),
  `packages/core/src/fdc/families/xrp-payment.ts` (the generic-family instantiation
  pattern M13-R2b's new `Payment` family copies — **not** a reusable proof: see the
  correction block, `XRPPayment` has no `standardPaymentReference`),
  `packages/core/src/fdc/operation.ts` (the round/finality/retrieval wait),
  `packages/core/src/reconcile.ts` (the shared table walk),
  `packages/core/src/states.ts` (the canonical states),
  `packages/contracts/src/vaults.ts` (M7's *different* Coston2 vault registry — the
  namespace warning), and the `VaultCatalogue`/`AttestationCatalogue`/`OperationTimeline`/
  `LegTimeline`/`card-chrome`/`SourceChip` component vocabulary.
