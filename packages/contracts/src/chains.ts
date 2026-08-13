/**
 * Network is configuration. Testnet first, mainnet-capable, with no source
 * rewrite to switch: every value here is a public constant, never an
 * environment variable. The only secret in this project is a signing key.
 *
 * Every URL and chain id below was read from Flare's own vendored
 * documentation and from the FAssets repository's deployment manifests.
 */

export type FlareNetworkKey = 'coston2' | 'flare'

export interface UnderlyingChain {
  readonly name: string
  readonly symbol: string
  /** XRP is six-decimal: one XRP is 1_000_000 drops. */
  readonly decimals: number
  readonly testnet: boolean
  readonly jsonRpcUrl: string
  /**
   * The explorer root. Paths hang off it here rather than in the callers,
   * because M2-R6 needs transaction, ledger and account links and three
   * separately-stored base URLs would be three chances to disagree.
   */
  readonly explorerBaseUrl: string
  readonly faucetUrl?: string
}

export interface FlareChain {
  readonly id: number
  readonly key: FlareNetworkKey
  readonly name: string
  readonly testnet: boolean
  readonly nativeCurrency: { readonly name: string; readonly symbol: string; readonly decimals: number }
  readonly rpcUrl: string
  readonly explorerUrl: string
  readonly underlying: UnderlyingChain
}

const XRPL_TESTNET: UnderlyingChain = {
  name: 'XRP Ledger Testnet',
  symbol: 'XRP',
  decimals: 6,
  testnet: true,
  jsonRpcUrl: 'https://xrpl-testnet-api.flare.network',
  explorerBaseUrl: 'https://testnet.xrpl.org',
  faucetUrl: 'https://xrpl.org/resources/dev-tools/xrp-faucets',
}

const XRPL_MAINNET: UnderlyingChain = {
  name: 'XRP Ledger',
  symbol: 'XRP',
  decimals: 6,
  testnet: false,
  jsonRpcUrl: 'https://xrpl-api.flare.network',
  explorerBaseUrl: 'https://livenet.xrpl.org',
}

export const FLARE_NETWORKS: Readonly<Record<FlareNetworkKey, FlareChain>> = {
  coston2: {
    id: 114,
    key: 'coston2',
    name: 'Flare Testnet Coston2',
    testnet: true,
    nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
    rpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
    explorerUrl: 'https://coston2-explorer.flare.network',
    underlying: XRPL_TESTNET,
  },
  flare: {
    id: 14,
    key: 'flare',
    name: 'Flare Mainnet',
    testnet: false,
    nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
    rpcUrl: 'https://flare-api.flare.network/ext/C/rpc',
    explorerUrl: 'https://flare-explorer.flare.network',
    underlying: XRPL_MAINNET,
  },
}

const BY_ID: ReadonlyMap<number, FlareChain> = new Map(
  Object.values(FLARE_NETWORKS).map((chain) => [chain.id, chain]),
)

export class UnsupportedNetworkError extends Error {
  readonly chainId: number
  constructor(chainId: number) {
    const supported = [...BY_ID.keys()].join(', ')
    super(`flare-kit does not support chain ${chainId}. Supported chain ids: ${supported}.`)
    this.name = 'UnsupportedNetworkError'
    this.chainId = chainId
  }
}

export function chainFor(chainId: number): FlareChain {
  const chain = BY_ID.get(chainId)
  if (!chain) throw new UnsupportedNetworkError(chainId)
  return chain
}

/** Explorer links come from the registry, never from a template in a component. */
export function explorerTxUrl(chainId: number, hash: string): string {
  return `${chainFor(chainId).explorerUrl}/tx/${hash}`
}

export function explorerAddressUrl(chainId: number, address: string): string {
  return `${chainFor(chainId).explorerUrl}/address/${address}`
}

export function explorerBlockUrl(chainId: number, block: string): string {
  return `${chainFor(chainId).explorerUrl}/block/${block}`
}

/**
 * M2-R6 keeps Flare and the XRP Ledger separate. A mint's XRPL payment and its
 * Flare execution are two identifiers on two explorers, and collapsing them
 * into one link is the flattening R-DATA-003 forbids.
 */
export function underlyingExplorerTxUrl(chainId: number, hash: string): string {
  return `${chainFor(chainId).underlying.explorerBaseUrl}/transactions/${hash}`
}

export function underlyingExplorerAccountUrl(chainId: number, address: string): string {
  return `${chainFor(chainId).underlying.explorerBaseUrl}/accounts/${address}`
}

export function underlyingExplorerLedgerUrl(chainId: number, ledger: string): string {
  return `${chainFor(chainId).underlying.explorerBaseUrl}/ledgers/${ledger}`
}
