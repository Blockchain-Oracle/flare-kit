import {
  REDEMPTION_STATUSES,
  assetManagerAbi,
  decodeSettingsWord,
  fassetAbi,
  GET_SETTINGS_SELECTOR,
  registryFor,
} from '@flarekit-dev/contracts'
import { FlareKitError } from '../errors.js'
import type { RedeemProtocolState } from './quote-redeem.js'
import type { RedeemChainState, RedeemStatus } from './redeem-recovery.js'
import type { ChainStateReader } from './read-chain-state.js'

/**
 * Live reads for redemption.
 *
 * The protocol snapshot needs values that only exist inside `getSettings()`, so
 * it is fetched as raw bytes and decoded by position — see
 * `@flarekit-dev/contracts/settings-reader`, which validates each value rather
 * than trusting the offset.
 */

/** A client that can also make a raw call, for the positional settings read. */
export interface RawCallReader extends ChainStateReader {
  call(args: { to: `0x${string}`; data: `0x${string}` }): Promise<{ data?: string }>
}

export interface ReadRedeemStateInput {
  client: RawCallReader
  chainId: number
  underlyingSymbol?: string
}

export async function readRedeemProtocolState(
  input: ReadRedeemStateInput,
): Promise<RedeemProtocolState> {
  const deployment = registryFor(input.chainId).fassets[input.underlyingSymbol ?? 'XRP']
  if (!deployment) {
    throw new FlareKitError('UNKNOWN_ASSET', {
      domain: 'config',
      message: `No FAsset for ${input.underlyingSymbol ?? 'XRP'} on chain ${input.chainId}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  const assetManager = deployment.assetManager as `0x${string}`

  const [lotSizeUBA, emergencyPaused, symbol, decimals, settings] = await Promise.all([
    input.client.readContract({ address: assetManager, abi: assetManagerAbi, functionName: 'lotSize' }),
    input.client.readContract({ address: assetManager, abi: assetManagerAbi, functionName: 'emergencyPaused' }),
    input.client.readContract({ address: deployment.token, abi: fassetAbi, functionName: 'symbol' }),
    input.client.readContract({ address: deployment.token, abi: fassetAbi, functionName: 'decimals' }),
    input.client.call({ to: assetManager, data: GET_SETTINGS_SELECTOR }),
  ])

  const raw = settings.data ?? '0x'
  return {
    fAssetSymbol: symbol as string,
    fAssetDecimals: Number(decimals),
    lotSizeUBA: lotSizeUBA as bigint,
    redemptionFeeBIPS: decodeSettingsWord(raw, 'redemptionFeeBIPS'),
    underlyingSecondsForPayment: decodeSettingsWord(raw, 'underlyingSecondsForPayment'),
    defaultPremiumBIPS: decodeSettingsWord(raw, 'redemptionDefaultFactorVaultCollateralBIPS'),
    emergencyPaused: emergencyPaused as boolean,
  }
}

export interface ReadRedeemChainStateInput {
  client: ChainStateReader
  chainId: number
  requestId: string
  /** Whether a ReferencedPaymentNonexistence proof has been obtained yet. */
  defaultProofAvailable?: boolean
  underlyingSymbol?: string
}

interface RequestInfo {
  status: number
  agentVault: string
  paymentAddress: string
  lastUnderlyingTimestamp: bigint
}

export async function readRedeemChainState(
  input: ReadRedeemChainStateInput,
): Promise<RedeemChainState> {
  const deployment = registryFor(input.chainId).fassets[input.underlyingSymbol ?? 'XRP']
  const assetManager = deployment?.assetManager as `0x${string}`

  let info: RequestInfo | undefined
  try {
    info = (await input.client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: 'redemptionRequestInfo',
      args: [BigInt(input.requestId)],
    })) as RequestInfo
  } catch {
    // A confirmed redemption is deleted, so the read reverts or returns
    // nothing. That is the success signal, not an error — see
    // RedemptionRequestInfo.sol: "there is no success status".
    info = undefined
  }

  const status: RedeemStatus =
    info === undefined || info.agentVault === '0x0000000000000000000000000000000000000000'
      ? 'MISSING'
      : (REDEMPTION_STATUSES[info.status] ?? 'ACTIVE')

  return {
    requestId: input.requestId,
    status,
    agentVault: info?.agentVault ?? '',
    paymentAddress: info?.paymentAddress ?? '',
    // The contract keeps seconds; operation records keep milliseconds.
    agentDeadline: info ? Number(info.lastUnderlyingTimestamp) * 1_000 : 0,
    defaultProofAvailable: input.defaultProofAvailable ?? false,
  }
}
