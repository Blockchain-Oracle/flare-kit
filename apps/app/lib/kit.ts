import { type FlareNetworkKey, FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { type FlareKit, createFlareKit } from '@flarekit-dev/core'
import { useEffect, useState } from 'react'
import { type PublicClient, createPublicClient, http } from 'viem'

/**
 * The read client for a network, built entirely from the registry. Network is
 * configuration: no chain id, RPC URL or address is literal in this app, so
 * switching network rewrites no source.
 *
 * The return type is annotated rather than inferred: viem's inferred client
 * type reaches into its own `_types` paths, which TypeScript cannot name
 * portably (TS2742) and which fails the build rather than a test.
 */
export function publicClientFor(key: FlareNetworkKey): PublicClient {
  const chain = FLARE_NETWORKS[key]
  return createPublicClient({
    chain: {
      id: chain.id,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: { default: { http: [chain.rpcUrl] } },
    },
    transport: http(chain.rpcUrl),
  })
}

/**
 * Three states and no fourth. There is deliberately no mock fallback: a kit
 * that cannot read the chain says so and stays unavailable, because mock mode
 * is a documentation surface and never a response to a failure.
 */
export type KitState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly kit: FlareKit }
  | { readonly status: 'unavailable'; readonly reason: string }

function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * The live kit for the selected network.
 *
 * `createFlareKit` reads protocol state over the network before it will hand
 * back a kit, so this is genuinely async and genuinely fails. Switching network
 * builds a new one; the `cancelled` flag drops a slow answer for a network the
 * user has already moved off, which would otherwise arrive later and quietly
 * replace the right kit with the wrong one.
 */
export function useAppKit(key: FlareNetworkKey): KitState {
  const [state, setState] = useState<KitState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    createFlareKit({ client: publicClientFor(key), chainId: FLARE_NETWORKS[key].id })
      .then((kit) => {
        if (!cancelled) setState({ status: 'ready', kit })
      })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ status: 'unavailable', reason: reasonFor(cause) })
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return state
}
