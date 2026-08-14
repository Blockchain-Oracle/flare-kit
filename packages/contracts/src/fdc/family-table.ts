import type { AttestationFamilyRow, FamilySource } from './families.js'
import { attestationName } from './protocol.js'

/**
 * What this project claims the Flare Data Connector attests, and where.
 *
 * This table is a **claim**, not protocol truth. M3-R3 requires it to be
 * compared at runtime against the selected deployment's live verifier, and
 * `packages/core/src/fdc/catalogue.ts` is what does the comparing. Presenting
 * it alone as permanent fact is the failure mode it exists to make visible.
 *
 * Every row below was derived from two independent live sources on 2026-08-04,
 * which agreed exactly:
 *
 *   1. `GET /verifier/{group}/api-doc-json` — which `{Type}/prepareRequest`
 *      routes each verifier group actually serves.
 *   2. `FdcRequestFeeConfigurations.getRequestFee(type ‖ source)` on chain —
 *      which type‖source pairs the deployment will price. Unsupported pairs
 *      revert `Type and source combination not supported`.
 *
 * The two disagree in exactly one place, recorded on `Web2Json` below.
 */

const XRPL_T: FamilySource = { group: 'xrp', sourceId: 'testXRP', chain: 'XRP Ledger Testnet' }
const XRPL_M: FamilySource = { group: 'xrp', sourceId: 'XRP', chain: 'XRP Ledger' }
/** Bitcoin's testnet group is `btc_testnet4`; `/verifier/btc/` 404s on testnet. */
const BTC_T: FamilySource = { group: 'btc_testnet4', sourceId: 'testBTC', chain: 'Bitcoin Testnet4' }
const BTC_M: FamilySource = { group: 'btc', sourceId: 'BTC', chain: 'Bitcoin' }
const DOGE_T: FamilySource = { group: 'doge', sourceId: 'testDOGE', chain: 'Dogecoin Testnet' }
const DOGE_M: FamilySource = { group: 'doge', sourceId: 'DOGE', chain: 'Dogecoin' }

/** The three chains every chain-agnostic payment family is served for. */
const PAYMENT_CHAINS = {
  coston2: [XRPL_T, BTC_T, DOGE_T],
  flare: [XRPL_M, BTC_M, DOGE_M],
} as const

/** XRPL only — these two are FAssets' own types. */
const XRPL_ONLY = { coston2: [XRPL_T], flare: [XRPL_M] } as const

/**
 * EVM attestations are grouped by the chain being read, and on Coston2 that is
 * `flr` / `testFLR`. The developer hub instructs `/verifier/eth/` at
 * `docs/fdc/guides/hardhat/02-evm-transaction.mdx:187`, which is wrong for
 * Coston2: a real Coston2 transaction returns `INVALID` on `eth` and `sgb`.
 * There is no `coston2` sourceId.
 */
/**
 * Each EVM source carries its own native unit — M4-R14.
 *
 * All three sit on the single `EVMTransaction` row, so a family-level asset
 * would be wrong for two of them whichever one was chosen. That is why the row
 * declared none, and why an attested `value` rendered as a bare integer. The
 * unit is a property of the source, so it lives on the source.
 *
 * All are 18 decimals: FLR, SGB and ETH each divide into 10^18.
 */
const EVM_CHAINS = {
  coston2: [
    { group: 'flr', sourceId: 'testFLR', chain: 'Flare Testnet Coston2', nativeUnit: { asset: 'C2FLR', decimals: 18 } },
    { group: 'eth', sourceId: 'testETH', chain: 'Ethereum Sepolia', nativeUnit: { asset: 'SepoliaETH', decimals: 18 } },
    { group: 'sgb', sourceId: 'testSGB', chain: 'Songbird Testnet Coston', nativeUnit: { asset: 'CFLR', decimals: 18 } },
  ],
  flare: [
    { group: 'flr', sourceId: 'FLR', chain: 'Flare', nativeUnit: { asset: 'FLR', decimals: 18 } },
    { group: 'eth', sourceId: 'ETH', chain: 'Ethereum', nativeUnit: { asset: 'ETH', decimals: 18 } },
    { group: 'sgb', sourceId: 'SGB', chain: 'Songbird', nativeUnit: { asset: 'SGB', decimals: 18 } },
  ],
} as const

const PAYMENT_BIGINTS = [
  'blockNumber',
  'blockTimestamp',
  'spentAmount',
  'intendedSpentAmount',
  'receivedAmount',
  'intendedReceivedAmount',
] as const

/** The three-field shape both nonexistence families return. */
const NONEXISTENCE_BIGINTS = [
  'minimalBlockTimestamp',
  'firstOverflowBlockNumber',
  'firstOverflowBlockTimestamp',
] as const

/** XRPL amounts are drops: six-decimal XRP. Unambiguous — this family is XRPL-only. */
const XRP_DROPS = { decimals: 6, asset: 'XRP' } as const

const XRP_PAYMENT_AMOUNTS = Object.freeze({
  spentAmount: XRP_DROPS,
  intendedSpentAmount: XRP_DROPS,
  receivedAmount: XRP_DROPS,
  intendedReceivedAmount: XRP_DROPS,
})

/**
 * No amount fields. Either the response carries none, or the asset depends on
 * which chain the source names and this row is not source-specific — labelling
 * an EVM `value` "FLR" would be wrong on the `eth` and `sgb` sources of the very
 * same row.
 */
const NO_AMOUNTS = Object.freeze({})

/**
 * The two general-purpose families. Their consumer is, by design, the
 * integrator's own contract — this is a developer kit, and a proof of an
 * arbitrary EVM transaction or an arbitrary JSON endpoint has no meaning until
 * somebody's own logic gives it one.
 */
const INTEGRATOR_CONSUMER =
  'Your own contract. flare-kit verifies the proof on chain through FdcVerification and hands you the ABI-ready struct; what it means is yours to decide, and this project deploys nothing that would presume.'

/**
 * FAssets consumes every chain family, on the AssetManager diamond. Verified on
 * the deployed Coston2 AssetManager 2026-08-04: `redeemWithTagSupported()`
 * returns true and selector `0xafe4226a` (`xrpRedemptionPaymentDefault`) is
 * registered on the diamond, so the nonexistence path is live rather than
 * merely declared in an interface.
 */
const FASSETS = (fn: string) => `FAssets AssetManager.${fn}`

export const ATTESTATION_FAMILIES: readonly AttestationFamilyRow[] = [
  {
    name: 'XRPPayment',
    summary:
      'An XRPL payment, with the source r-address, memo data and destination tag surfaced directly. FAssets consumes this, not the chain-agnostic Payment type.',
    hasBuilder: true,
    sources: XRPL_ONLY,
    bigIntResponseFields: [...PAYMENT_BIGINTS, 'destinationTag'],
    amountResponseFields: XRP_PAYMENT_AMOUNTS,
    bindsProofOwner: true,
    hasDeployedConsumer: true,
    consumer: FASSETS('executeDirectMinting'),
  },
  {
    name: 'XRPPaymentNonexistence',
    summary:
      'That no XRPL payment matching a reference reached an address inside a block-and-timestamp window. Requires a memo-data or destination-tag check.',
    hasBuilder: true,
    sources: XRPL_ONLY,
    bigIntResponseFields: NONEXISTENCE_BIGINTS,
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: true,
    hasDeployedConsumer: true,
    consumer: FASSETS('xrpRedemptionPaymentDefault'),
  },
  {
    name: 'EVMTransaction',
    summary:
      'An EVM transaction: its sender, value, optional calldata and up to fifty of its event logs.',
    hasBuilder: true,
    sources: EVM_CHAINS,
    bigIntResponseFields: ['blockNumber', 'timestamp', 'value'],
    // `value` is an amount; which amount depends on the source. M4-R14.
    nativeUnitResponseFields: ['value'],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: false,
    consumer: INTEGRATOR_CONSUMER,
  },
  {
    name: 'Web2Json',
    summary:
      'A public HTTPS JSON endpoint, post-processed with a jq filter and ABI-encoded to a caller-supplied signature.',
    hasBuilder: true,
    // The one place the two live sources disagree. The mainnet verifier serves
    // `/verifier/web2/Web2Json/prepareRequest` (200), but mainnet's
    // FdcRequestFeeConfigurations reverts on `Web2Json ‖ PublicWeb2`, so no
    // request can be priced and none can be submitted. Probed 2026-08-04.
    // Declaring it live on mainnet on the strength of the route alone would be
    // faking protocol reality, so mainnet carries no source.
    sources: {
      coston2: [{ group: 'web2', sourceId: 'PublicWeb2', chain: 'Public Web2' }],
      flare: [],
    },
    bigIntResponseFields: [],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: false,
    consumer: INTEGRATOR_CONSUMER,
  },
  {
    name: 'Payment',
    summary: 'A payment on any supported chain, in the chain-agnostic shape.',
    // Flipped false -> true by M13-R2b, which built the request builder. The row said
    // `false` from M3 through M12 and was accurate then; leaving it would make the
    // capability catalogue deny a capability the kit demonstrably has.
    hasBuilder: true,
    sources: PAYMENT_CHAINS,
    bigIntResponseFields: PAYMENT_BIGINTS,
    amountResponseFields: NO_AMOUNTS,
    // The controller binds the XRPL source address instead, by comparing
    // `sourceAddressHash` against `keccak256(bytes(xrplAddress))`.
    bindsProofOwner: false,
    hasDeployedConsumer: true,
    consumer:
      'FAssets AssetManager — redemption payment confirmation and minting default; ' +
      'Smart Accounts MasterAccountController — XRPL instruction dispatch (executeInstruction).',
  },
  {
    name: 'ReferencedPaymentNonexistence',
    summary:
      'That no payment carrying a given standard reference reached an address before a deadline.',
    hasBuilder: false,
    sources: PAYMENT_CHAINS,
    bigIntResponseFields: NONEXISTENCE_BIGINTS,
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: true,
    consumer: FASSETS('redemptionPaymentDefault'),
  },
  {
    name: 'BalanceDecreasingTransaction',
    summary: 'A transaction that reduced an address’s balance, or could have.',
    hasBuilder: false,
    sources: PAYMENT_CHAINS,
    bigIntResponseFields: ['blockNumber', 'blockTimestamp', 'spentAmount'],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: true,
    consumer: FASSETS('illegalPaymentChallenge'),
  },
  {
    name: 'ConfirmedBlockHeightExists',
    summary: 'That a block at a given height exists and is confirmed, with the query window.',
    hasBuilder: false,
    sources: PAYMENT_CHAINS,
    bigIntResponseFields: [
      'blockTimestamp',
      'numberOfConfirmations',
      'lowestQueryWindowBlockNumber',
      'lowestQueryWindowBlockTimestamp',
    ],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: true,
    consumer: 'FAssets AssetManager — the block-height evidence its default and challenge paths require.',
  },
  {
    name: 'AddressValidity',
    summary: 'Whether a string is a valid address on a chain, with its standard form and hash.',
    hasBuilder: false,
    sources: PAYMENT_CHAINS,
    bigIntResponseFields: [],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: true,
    consumer: 'FAssets AssetManager — proving an agent’s underlying address is valid.',
  },
  {
    name: 'JsonApi',
    summary: 'Withdrawn. Superseded by Web2Json.',
    hasBuilder: false,
    sources: { coston2: [], flare: [] },
    bigIntResponseFields: [],
    amountResponseFields: NO_AMOUNTS,
    bindsProofOwner: false,
    hasDeployedConsumer: false,
    consumer: INTEGRATOR_CONSUMER,
    deprecationNote:
      'Withdrawn upstream and enforced by the contract, not only by the documentation: the verifier route 404s and getRequestFee reverts on both networks. Probed 2026-08-04.',
  },
]

const BY_NAME: ReadonlyMap<string, AttestationFamilyRow> = new Map(
  ATTESTATION_FAMILIES.map((family) => [family.name, family]),
)

export function familyFor(name: string): AttestationFamilyRow | undefined {
  return BY_NAME.get(name)
}

/** The 32-byte attestation type ids, keyed by name. */
export const ATTESTATION_TYPES: Readonly<Record<string, `0x${string}`>> = Object.freeze(
  Object.fromEntries(ATTESTATION_FAMILIES.map((f) => [f.name, attestationName(f.name)])),
)
