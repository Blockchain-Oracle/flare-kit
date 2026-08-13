# Specification Addendum: Merchant and Liquidity-Provision Surfaces

Date: 2026-08-03
Status: proposed addendum to the accepted specification
Extends: `design/2026-08-03-product-surface-map.md` from 112 to 117 surfaces
Trigger: Abu audited the kit against the Bounty 1 eligible directions and asked
that any uncovered direction be added rather than argued away.

## The audit

Nine directions are named by the bounty. Seven were already covered by the
accepted surface map. Two were not, and this addendum closes them.

| Bounty direction | Covered by | Verdict |
| --- | --- | --- |
| FXRP onboarding flows | FX-01 to FX-05, FX-10, FX-11 | covered |
| Cross-chain asset dashboards | USER-01, USER-03 | covered |
| Wallet experiences | SH-02, SH-03, DEV-12 | covered, and differentiated |
| Payment or merchant flows | PAY-01, PAY-02, GAS-01 to GAS-03 | **payer only** |
| DeFi integrations | SWAP-01 to SWAP-03, LIQ-01 to LIQ-03 | covered |
| Asset movement UX | BR-01 to BR-05, FX-06 | covered |
| Portfolio tools | USER-01, USER-02, USER-04 | covered |
| Liquidity interfaces | LIQ-01 to LIQ-03 | **vaults only** |
| Assets usable in real applications | DEV-05, DEV-06, HOST-01 | covered |

**Gap 1, merchant.** The word "merchant" appears in the accepted map exactly
once, as a *field on the payer's screen* (PAY-01, "Resource/merchant"). Every
payment surface is written from the paying side. Nothing lets somebody request
a payment, watch it settle, or reconcile it. The research-era strategy had
proposed an XRP checkout and receipt rail as a vertical product; when scope
widened to the full kit, the payer surfaces were carried over and the merchant
side was silently dropped.

**Gap 2, liquidity provision.** LIQ-01 through LIQ-03 are all vaults, in the
ERC-4626 deposit-and-share sense. Searching the accepted artifacts for pool
positions, adding liquidity or LP returns nothing. Supplying liquidity to a
venue pool is a different mechanic with different risk, and the bounty names
"liquidity interfaces" separately from "DeFi integrations."

## New surfaces

### Merchant and payment requests

| ID | Surface | Purpose | Required states | Required visible data |
| --- | --- | --- | --- | --- |
| PAY-03 | Payment request builder | Let a seller request an exact payment in FXRP, XRP or a supported stablecoin, and produce a shareable or embeddable pay link. | `BASE`, `AVAIL`, `AUTH`; invalid recipient; unsupported asset/network; expiry in the past; request created/expired/cancelled. | Requested asset and exact amount, receiving account and network, human reference and machine idempotency key, expiry, accepted payment routes, whether partial payment is accepted, generated link and embed snippet. |
| PAY-04 | Merchant settlement and reconciliation | Show the seller what was actually received against what was requested, and export it. | `BASE`, `OP`, `SOURCE`, `RECOVERY`; unpaid; underpaid; overpaid; paid late after expiry; settled; refund prepared; export error. | Request ID and reference, requested versus received amount and asset, payer account, settlement transaction and finality, source and freshness, variance reason, refund path with duplicate-refund protection, and a reconciliation export. |

Rules that bind these surfaces:

- **R-PAY-101:** A payment request is a request, never an invoice with legal or
  tax meaning, and the product must not imply otherwise.
- **R-PAY-102:** Underpayment and overpayment are first-class outcomes with
  their own copy, not errors. The exact received amount is always shown next to
  the exact requested amount.
- **R-PAY-103:** A late payment arriving after expiry is surfaced as received
  and unmatched, never silently accepted or silently discarded.
- **R-PAY-104:** Refund is a new outbound payment and is labelled as such. It
  is idempotent by request ID and never presented as a reversal.
- **R-PAY-105:** The merchant surface never asserts settlement finality beyond
  what the underlying chain gives, and names the source of its balance data.
- **R-PAY-106:** A merchant view shows only accounts the operator controls, and
  never the payer's unrelated holdings.

### Liquidity provision

| ID | Surface | Purpose | Required states | Required visible data |
| --- | --- | --- | --- | --- |
| LIQ-04 | Pool catalogue | Discover qualified venue pools involving FXRP and connected assets, without flattening venue differences. | `BASE`, `AVAIL`, `SOURCE`; empty; degraded; venue unsupported; data stale. | Venue, pair, pool type and fee tier, whether the position is fungible or ranged, liquidity and volume when sourced, and provenance with an evidence date. |
| LIQ-05 | Add liquidity | Prepare a supply of one or both assets into a qualified pool. | `BASE`, `WALLET`, `PLAN`, `OP`; approval needed for one or both assets; ratio changed; out-of-range selection; insufficient balance; quote stale. | Both assets and exact amounts, current ratio, price range where the venue is ranged, expected position or share, both allowances, fees, price impact, and an explicit statement of the risk being taken. |
| LIQ-06 | Position detail and exit | Inspect a live position and remove some or all of it. | `BASE`, `SOURCE`, `OP`, `RECOVERY`; position empty; out of range; fees claimable; partial removal; removal complete. | Position identifier, current composition of both assets, value change against what was supplied, fees earned when sourced, in-range status, exact removal amounts and the assets actually returned. |

Rules that bind these surfaces:

- **R-LIQ-101:** Supplying liquidity is not a deposit. Copy never calls it
  saving, earning or yield without naming the mechanism.
- **R-LIQ-102:** The composition of a position changes with price. This must be
  stated at supply time in plain language, not hidden behind a tooltip and not
  reduced to the phrase "impermanent loss" alone.
- **R-LIQ-103:** Where a venue uses ranged positions, being out of range is a
  visible state on the position, because an out-of-range position stops earning
  and is fully converted into one asset.
- **R-LIQ-104:** Yield, APR or volume figures appear only when sourced, with
  the source and observation time named. No projected returns.
- **R-LIQ-105:** Venue identity, pool type and fee tier stay visible. Pools
  from different venues are never merged into one list without their venue.
- **R-LIQ-106:** Two-asset supply may require two approvals. Both are exact,
  and the sequence is stated before the first signature.

## Components these surfaces add

`PaymentRequestCard`, `PayLink` embed, `MerchantSettlementTable`,
`PoolCatalogue`, `AddLiquidityCard`, `PositionCard`.

`PayLink` is notable for the kit's thesis: it is the clearest case of an
embeddable surface that a host drops into an existing product, which is exactly
the "assets usable in real applications" direction.

## Qualification honesty

Neither addition may claim support it does not have.

- The venue set for LIQ-04 to LIQ-06 is unresolved. SparkDEX is documented as
  Uniswap V3 style, meaning ranged positions, and BlazeSwap as V2 style,
  meaning fungible shares. Those are materially different position models and
  the catalogue must not present them as one thing. Until each is qualified,
  they render their honest availability state.
- The payment surfaces build on the existing x402 and gasless work, whose
  current Flare-side material is explicitly a demo rather than a hosted
  facilitator. PAY-03 and PAY-04 therefore ship against qualified routes only,
  and declare which are planned.

## Priority

These close bounty coverage; they are not ahead of the priority asset. Build
order remains as recorded in
`decisions/2026-08-03-bounty-coverage-and-demo-product.md`: FXRP onboarding,
dual-chain wallet, portfolio, redemption. Merchant and liquidity follow, at the
same quality bar, declared unbuilt rather than shipped shallow.

## Consequences

- The accepted surface map moves from 112 to 117 logical surfaces.
- The tool catalogue in `specs/2026-08-03-agent-cli-and-tool-surfaces.md` gains
  `flare.payment.request`, `flare.payment.settlements` as read/plan tools, and
  `flare.liquidity.add`, `flare.liquidity.remove` as write tools.
- No existing surface is removed or renumbered.
