/**
 * `IPayment` — the CHAIN-AGNOSTIC payment attestation, and the proof the XRPL-controlled
 * Smart Accounts `MasterAccountController` consumes.
 *
 * This is NOT `IXRPPayment` (`direct-minting-abi.ts`'s `XRP_PAYMENT_PROOF`), and the two
 * are not interchangeable in either direction:
 *
 * - `IPayment`'s request body is `{transactionId, inUtxo, utxo}`; `IXRPPayment`'s is
 *   `{transactionId, proofOwner}`. `IPayment` binds no proof owner — the Smart Accounts
 *   controller binds the XRPL SOURCE ADDRESS instead, by comparing
 *   `responseBody.sourceAddressHash` against `keccak256(bytes(xrplAddress))`.
 * - `IPayment`'s response carries **`standardPaymentReference`** — the 32 bytes
 *   `InstructionsFacet.executeInstruction` decodes the instruction from — plus
 *   `sourceAddressesRoot` and `oneToOne`. `IXRPPayment` has none of those, carrying
 *   `sourceAddress`, `firstMemoData`, `hasDestinationTag` and `destinationTag` instead.
 *
 * `xrp-payment.ts` already records the asymmetry from the other side: a `Payment` proof
 * will not verify against the FAssets AssetManager. The corollary this file exists for is
 * that an `XRPPayment` proof will not dispatch a Smart Accounts instruction, because the
 * field the dispatcher reads is not in it.
 *
 * Source, under `sources/flare-foundation/`:
 *   flare-foundry-periphery-package/src/coston2/IPayment.sol
 */

/** `IPayment.Proof`, flattened for an ABI. */
export const PAYMENT_PROOF = {
  name: '_proof',
  type: 'tuple',
  components: [
    { name: 'merkleProof', type: 'bytes32[]' },
    {
      name: 'data',
      type: 'tuple',
      components: [
        { name: 'attestationType', type: 'bytes32' },
        { name: 'sourceId', type: 'bytes32' },
        { name: 'votingRound', type: 'uint64' },
        { name: 'lowestUsedTimestamp', type: 'uint64' },
        {
          name: 'requestBody',
          type: 'tuple',
          components: [
            { name: 'transactionId', type: 'bytes32' },
            // Both are always 0 on a non-UTXO chain such as XRPL. They are not optional:
            // the request is hashed into the attestation, so omitting them changes the
            // request that gets attested.
            { name: 'inUtxo', type: 'uint256' },
            { name: 'utxo', type: 'uint256' },
          ],
        },
        {
          name: 'responseBody',
          type: 'tuple',
          components: [
            { name: 'blockNumber', type: 'uint64' },
            { name: 'blockTimestamp', type: 'uint64' },
            { name: 'sourceAddressHash', type: 'bytes32' },
            { name: 'sourceAddressesRoot', type: 'bytes32' },
            { name: 'receivingAddressHash', type: 'bytes32' },
            { name: 'intendedReceivingAddressHash', type: 'bytes32' },
            { name: 'spentAmount', type: 'int256' },
            { name: 'intendedSpentAmount', type: 'int256' },
            { name: 'receivedAmount', type: 'int256' },
            { name: 'intendedReceivedAmount', type: 'int256' },
            // The 32 bytes the Smart Accounts controller decodes the instruction from.
            { name: 'standardPaymentReference', type: 'bytes32' },
            { name: 'oneToOne', type: 'bool' },
            { name: 'status', type: 'uint8' },
          ],
        },
      ],
    },
  ],
} as const
