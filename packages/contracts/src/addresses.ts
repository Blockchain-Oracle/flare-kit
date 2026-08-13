import { type FlareNetworkKey, chainFor } from './chains.js'

/**
 * The single source of truth for every deployed address. R2: no address is
 * hardcoded anywhere else in flare-kit.
 *
 * Every value below was read from the FAssets repository's own deployment
 * manifests at `deployment/deploys/<network>.json`, and the FDC service URLs
 * from Flare's vendored developer documentation. Nothing here is inferred.
 */

export type Address = `0x${string}`

export interface FAssetDeployment {
  /**
   * The symbol the chain actually deploys. On Coston2 this is `FTestXRP`, not
   * `FXRP` — rendering it as FXRP would be faking protocol reality, so every
   * surface renders whatever this field says.
   */
  readonly symbol: string
  readonly underlyingSymbol: string
  readonly assetManager: Address
  readonly token: Address
  /** Direct minting pays the core vault's underlying address. */
  readonly coreVaultManager: Address
  /**
   * Whether `DirectMintingFacet` is deployed for this asset on this network.
   * Verified against the deployment manifests: present on coston2, flare and
   * songbird; absent on coston.
   */
  readonly supportsDirectMinting: boolean
}

export interface FdcServices {
  readonly verifierBaseUrl: string
  readonly dataAvailabilityBaseUrl: string
  readonly apiKeyHeader: string
  /**
   * The published open key from Flare's own FDC documentation. It is a public
   * value, not a secret, so it lives here as an overridable default rather than
   * in an environment variable. A caller with their own key passes it in.
   */
  readonly publicApiKey: string
  /** `sourceId` for this network's XRP Ledger: `testXRP` or `XRP`. */
  readonly xrplSourceId: string
}

export interface NetworkRegistry {
  readonly chainId: number
  readonly contractRegistry: Address
  readonly assetManagerController: Address
  readonly fdcHub: Address
  readonly fdcVerification: Address
  readonly fdcRequestFeeConfigurations: Address
  readonly relay: Address
  /**
   * Holds `firstVotingRoundStartTs` and `votingEpochDurationSeconds`. Those
   * getters are declared on `IRelay` in the periphery package but are NOT on
   * the deployed Relay — they live here. Resolved through the
   * FlareContractRegistry and verified on both networks.
   */
  readonly flareSystemsManager: Address
  readonly wrappedNative: Address
  /** Keyed by underlying asset symbol, e.g. `XRP`. */
  readonly fassets: Readonly<Record<string, FAssetDeployment>>
  readonly services: FdcServices
}

const REGISTRIES: Readonly<Record<FlareNetworkKey, NetworkRegistry>> = {
  coston2: {
    chainId: 114,
    contractRegistry: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
    assetManagerController: '0x1C772F700308aF4c13897cc7b9c41EFfB82c50C0',
    fdcHub: '0x48aC463d7975828989331F4De43341627b9c5f1D',
    fdcVerification: '0x906507E0B64bcD494Db73bd0459d1C667e14B933',
    fdcRequestFeeConfigurations: '0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e',
    relay: '0xa10B672D1c62e5457b17af63d4302add6A99d7dE',
    flareSystemsManager: '0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52',
    wrappedNative: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273',
    fassets: {
      XRP: {
        symbol: 'FTestXRP',
        underlyingSymbol: 'XRP',
        assetManager: '0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA',
        token: '0x0b6A3645c240605887a5532109323A3E12273dc7',
        coreVaultManager: '0x4CB40b0dBfbF239eC60C9bE1496A6c1aA29e429b',
        supportsDirectMinting: true,
      },
    },
    services: {
      verifierBaseUrl: 'https://fdc-verifiers-testnet.flare.network',
      dataAvailabilityBaseUrl: 'https://ctn2-data-availability.flare.network',
      apiKeyHeader: 'X-API-KEY',
      publicApiKey: '00000000-0000-0000-0000-000000000000',
      xrplSourceId: 'testXRP',
    },
  },
  flare: {
    chainId: 14,
    contractRegistry: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
    assetManagerController: '0x097B93eEBe9b76f2611e1E7D9665a9d7Ff5280B3',
    fdcHub: '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44',
    fdcVerification: '0x5C14FE9D73Ab763F4d4a76f334bf7029DDD20Ecc',
    fdcRequestFeeConfigurations: '0x259852Ae6d5085bDc0650D3887825f7b76F0c4fe',
    relay: '0xCcF30790A93F15e24EB909548a2C58a9b0a7FBd4',
    flareSystemsManager: '0x89e50DC0380e597ecE79c8494bAAFD84537AD0D4',
    wrappedNative: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
    fassets: {
      XRP: {
        symbol: 'FXRP',
        underlyingSymbol: 'XRP',
        assetManager: '0x2a3Fe068cD92178554cabcf7c95ADf49B4B0B6A8',
        token: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
        coreVaultManager: '0x6c8d96dEfE4cbEE05FA969Fc0Ac436d94Fc21784',
        supportsDirectMinting: true,
      },
    },
    services: {
      verifierBaseUrl: 'https://fdc-verifiers-mainnet.flare.network',
      dataAvailabilityBaseUrl: 'https://flr-data-availability.flare.network',
      apiKeyHeader: 'X-API-KEY',
      // Mainnet has no published open key; a caller supplies their own.
      publicApiKey: '',
      xrplSourceId: 'XRP',
    },
  },
}

export function registryFor(chainId: number): NetworkRegistry {
  return REGISTRIES[chainFor(chainId).key]
}

export class UnknownAssetError extends Error {
  constructor(chainId: number, underlyingSymbol: string) {
    const known = Object.keys(registryFor(chainId).fassets).join(', ')
    super(
      `No FAsset for underlying ${underlyingSymbol} on chain ${chainId}. Known underlying assets: ${known}.`,
    )
    this.name = 'UnknownAssetError'
  }
}

export function fassetFor(chainId: number, underlyingSymbol: string): FAssetDeployment {
  const deployment = registryFor(chainId).fassets[underlyingSymbol]
  if (!deployment) throw new UnknownAssetError(chainId, underlyingSymbol)
  return deployment
}
