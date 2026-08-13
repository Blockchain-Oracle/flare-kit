import { type ProposalDetailView, type ProposalSummary, type ProposalUnknown, discoverProposals, readProposalDetail } from '@flare-kit/core'
import { useCallback, useEffect, useState } from 'react'
import type { GovernanceDeployment } from './use-governance.js'

/**
 * `useProposals` — the M12 mainnet proposal read lens (mirrors `use-observed-read.ts`'s
 * shape: run a read, hold what came back, never let a failed read fabricate an empty or
 * invented result). Unlike `useGovernance`, there is no operation lifecycle here — a
 * proposal is read, not signed; `castVote` is built in core but deliberately CARRIED this
 * milestone, so this hook exposes no write path at all.
 *
 * **Honest-empty**: when `discoverProposals` finds nothing (Coston2 hosts no proposal ever,
 * probe-confirmed), `proposals` is `[]` — never a fabricated row. `detailOf(id)` only maps
 * an id that was actually discovered; an id never seen stays `undefined` forever, and a
 * discovered proposal whose detail read failed stays the honest `{id, source, state:
 * 'unknown'}` shape (`ProposalUnknown`) rather than collapsing into a fabricated detail.
 *
 * There is deliberately no poll interval here (mirrors `use-observed-read.ts`'s reasoning):
 * proposals are a cross-network read lens, not a durable in-flight operation, so a one-shot
 * dependency-driven read is the honest shape — the host owns any refresh cadence.
 */

/** viem's `PublicClient`, obtained transitively through core's read signature — no direct
 *  `viem` import (mirrors `GovernanceEvmClient` in `use-governance.ts`). */
export type ProposalsEvmClient = Parameters<typeof discoverProposals>[0]

// The bounded discovery window (Flare's `eth_getLogs` cap, the gasless-adapter.ts /
// live-governance.mjs precedent): windows <= 30 blocks/call, looking back 4500 blocks.
const LOOKBACK_BLOCKS = 4_500n
const MAX_RANGE = 30n

export interface UseProposalsInput {
  /** The `flare` (mainnet) deployment — proposals are a cross-network read lens; Coston2
   *  hosts none (probe-confirmed). */
  readonly readDeployment: GovernanceDeployment
  readonly publicClient: ProposalsEvmClient
  readonly account: `0x${string}`
  readonly lookbackBlocks?: bigint
  readonly maxRange?: bigint
}

export interface UseProposalsResult {
  /** `[]` when discovery finds nothing — honest-empty, never a fabricated row. */
  readonly proposals: ProposalSummary[]
  /** True until the first discovery read completes (mirrors `useObservedRead`'s `loading`). */
  readonly loading: boolean
  /** The last failed read's message; never overwrites `proposals` with a fabricated result. */
  readonly error: string | undefined
  /** `undefined` until the id has both been discovered AND its detail read has landed. A
   *  discovered proposal whose detail read failed returns the honest `ProposalUnknown`
   *  shape, never a fabricated tally. An id never discovered stays `undefined`. */
  detailOf(id: bigint): ProposalDetailView | ProposalUnknown | undefined
}

export function useProposals(input: UseProposalsInput): UseProposalsResult {
  const { readDeployment, publicClient, account, lookbackBlocks = LOOKBACK_BLOCKS, maxRange = MAX_RANGE } = input
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [details, setDetails] = useState<Map<string, ProposalDetailView | ProposalUnknown>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!publicClient) return
    let live = true
    const run = async () => {
      try {
        const found = await discoverProposals(publicClient, readDeployment, lookbackBlocks, maxRange)
        if (!live) return
        setProposals(found)
        setError(undefined)
        // Eagerly land the detail for every discovered proposal — the observed catalogue is
        // small (at most a couple of ids), so this stays a pure lookup for `detailOf` rather
        // than triggering a fetch from inside a render-time accessor call.
        const entries = await Promise.all(
          found.map(async (p) => [`${p.source}:${p.id}`, await readProposalDetail(publicClient, readDeployment, p.id, p.source, account)] as const),
        )
        if (!live) return
        setDetails(new Map(entries))
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (live) setLoading(false)
      }
    }
    void run()
    return () => {
      live = false
    }
  }, [publicClient, readDeployment, account, lookbackBlocks, maxRange])

  const detailOf = useCallback(
    (id: bigint): ProposalDetailView | ProposalUnknown | undefined => {
      const summary = proposals.find((p) => p.id === id)
      if (!summary) return undefined
      return details.get(`${summary.source}:${summary.id}`)
    },
    [proposals, details],
  )

  return { proposals, loading, error, detailOf }
}
