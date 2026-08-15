import { assetManagerAbi, fassetAbi, registryFor } from '@flarekit-dev/contracts'
import { FlareKitError } from '../errors.js'
import type { DirectMintProtocolState } from './direct-mint-quote.js'

/**
 * Fills the quote's protocol snapshot from the chain.
 *
 * Everything the quote reasons about is read here, once, so the arithmetic that
 * decides whether a payment is safe stays a pure function of a plain object.
 * Nothing in this file makes a decision; it only reports what the chain says.
 */

/** The subset of a viem PublicClient this needs. Structurally satisfied by one. */
export interface ContractReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

export interface ReadProtocolStateInput {
  client: ContractReader
  chainId: number
  /** The underlying asset symbol, e.g. `XRP`. */
  underlyingSymbol?: string
}

export async function readDirectMintProtocolState(
  input: ReadProtocolStateInput,
): Promise<DirectMintProtocolState> {
  const registry = registryFor(input.chainId)
  const deployment = registry.fassets[input.underlyingSymbol ?? 'XRP']
  if (!deployment) {
    throw new FlareKitError('UNKNOWN_ASSET', {
      domain: 'config',
      message: `No FAsset for ${input.underlyingSymbol ?? 'XRP'} on chain ${input.chainId}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  if (!deployment.supportsDirectMinting) {
    throw new FlareKitError('DIRECT_MINTING_UNSUPPORTED', {
      domain: 'config',
      message: `Direct minting is not deployed for ${deployment.symbol} on chain ${input.chainId}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  const read = (functionName: string) =>
    input.client.readContract({
      address: deployment.assetManager,
      abi: assetManagerAbi,
      functionName,
    })

  const [
    xrplDestination,
    mintingFeeBIPS,
    minimumMintingFeeUBA,
    executorFeeUBA,
    largeMintingThresholdUBA,
    largeMintingDelaySeconds,
    othersCanExecuteAfterSeconds,
    mintingPaused,
    emergencyPaused,
    fAssetSymbol,
    fAssetDecimals,
  ] = await Promise.all([
    read('directMintingPaymentAddress'),
    read('getDirectMintingFeeBIPS'),
    read('getDirectMintingMinimumFeeUBA'),
    read('getDirectMintingExecutorFeeUBA'),
    read('getDirectMintingLargeMintingThresholdUBA'),
    read('getDirectMintingLargeMintingDelaySeconds'),
    read('getDirectMintingOthersCanExecuteAfterSeconds'),
    read('mintingPaused'),
    read('emergencyPaused'),
    // The symbol comes from the token itself, never from a constant. On
    // Coston2 the chain says FTestXRP, and that is what every surface renders.
    input.client.readContract({
      address: deployment.token,
      abi: fassetAbi,
      functionName: 'symbol',
    }),
    input.client.readContract({
      address: deployment.token,
      abi: fassetAbi,
      functionName: 'decimals',
    }),
  ])

  return {
    fAssetSymbol: fAssetSymbol as string,
    fAssetDecimals: Number(fAssetDecimals),
    xrplDestination: xrplDestination as string,
    feeSettings: {
      mintingFeeBIPS: mintingFeeBIPS as bigint,
      minimumMintingFeeUBA: minimumMintingFeeUBA as bigint,
      executorFeeUBA: executorFeeUBA as bigint,
    },
    largeMintingThresholdUBA: largeMintingThresholdUBA as bigint,
    largeMintingDelaySeconds: largeMintingDelaySeconds as bigint,
    othersCanExecuteAfterSeconds: othersCanExecuteAfterSeconds as bigint,
    mintingPaused: mintingPaused as boolean,
    emergencyPaused: emergencyPaused as boolean,
  }
}
