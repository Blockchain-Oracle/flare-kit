import { fdcHubAbi, registryFor } from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'

/**
 * What a request costs, read for the exact bytes being submitted.
 *
 * The fee is never assumed. It is 1000 wei on Coston2 and 20 FLR on Flare
 * mainnet — three FLR for `ConfirmedBlockHeightExists` — measured 2026-08-04, so
 * a constant here would be wrong on one of the two networks and wrong again the
 * first time governance changes it. M3-AC4: the value sent equals the value
 * read for these bytes.
 */

export interface FeeReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

/**
 * `attestationType ‖ sourceId` is 64 bytes, which is 128 hex characters after
 * the `0x`. The contract reverts on anything shorter rather than returning a
 * default, so the precondition is checked here where it can be explained.
 */
const MINIMUM_REQUEST_HEX_LENGTH = 2 + 128

export async function getRequestFee(
  reader: FeeReader,
  chainId: number,
  abiEncodedRequest: string,
): Promise<bigint> {
  if (abiEncodedRequest.length < MINIMUM_REQUEST_HEX_LENGTH) {
    throw new FlareKitError('FDC_REQUEST_TOO_SHORT', {
      domain: 'input',
      message: `A request must carry at least its attestation type and source id — 64 bytes. Received ${Math.max(0, (abiEncodedRequest.length - 2) / 2)}.`,
      recovery: 'requires_new_value',
      valueMoved: 'no',
    })
  }

  try {
    const fee = await reader.readContract({
      address: registryFor(chainId).fdcRequestFeeConfigurations,
      abi: fdcHubAbi as readonly unknown[],
      functionName: 'getRequestFee',
      args: [abiEncodedRequest as `0x${string}`],
    })
    return BigInt(fee as bigint)
  } catch (cause) {
    // The contract reverts `Type and source combination not supported` for a
    // pair it does not price. That is the deployment declining the request, not
    // an outage — and it is exactly what mainnet does for Web2Json today.
    throw new FlareKitError('FDC_FEE_UNAVAILABLE', {
      domain: 'protocol',
      message: `This deployment would not price the request. The attestation type and source combination may not be supported on chain ${chainId}, even if the verifier serves the route.`,
      recovery: 'terminal',
      valueMoved: 'no',
      cause,
    })
  }
}
