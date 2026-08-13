import {
  type GovernanceDeployment,
  type ProposalDetailView,
  type ProposalSource,
  type ProposalSummary,
  type ProposalUnknown,
  discoverProposals,
  readProposalDetail,
} from '@flare-kit/core'
import { useCallback, useEffect, useState } from 'react'

/**
 * `useProposals` — the M12 mainnet proposal read lens (mirrors `use-observed-read.ts`'s
 * shape: run a read, hold what came back, never let a failed read fabricate an empty or
 * invented result). Unlike `useGovernance`, there is no operation lifecycle here — a
 * proposal is read, not signed; `castVote` is built in core but deliberately CARRIED this
 * milestone, so this hook exposes no write path at all.
 *
 * **Honest-empty vs unavailable (load-bearing — the M12 unavailable-vs-empty rule)**:
 * `proposals` is `ProposalSummary[] | undefined`, and the two non-array-of-real-rows states
 * are NOT the same claim. `undefined` means "not yet loaded" OR "the discovery read
 * FAILED" (`error` is set) — an RPC outage must never wear the shape of an observed-empty
 * catalogue. `[]` means ONLY a CONFIRMED-empty discovery: the read genuinely SUCCEEDED and
 * `discoverProposals` returned zero rows (Coston2 hosts no proposal ever, probe-confirmed) —
 * that is honest-empty, distinct from unavailable, and only a successful call ever produces
 * it. `detailOf(id, source)` only maps a proposal that was actually discovered; one never seen
 * stays `undefined` forever, and a discovered proposal whose detail read failed stays the
 * honest `{id, source, state:'unknown'}` shape (`ProposalUnknown`) rather than collapsing into
 * a fabricated detail.
 *
 * `loading` returns to `true` on every dependency change, and that is load-bearing rather than
 * cosmetic: without it, switching `readDeployment` from `flare` to `coston2` would leave the
 * mainnet rows in place with `loading: false` and no `error`, and the catalogue would stamp
 * every one of them with the NEW network's label — presenting mainnet proposal 1 as a
 * freshly-read Coston2 proposal, on a surface whose per-row network labels exist precisely to
 * prevent that claim. The component's honest "stale" state is keyed on `error`, so this path
 * bypasses it entirely.
 *
 * There is deliberately no poll interval here (mirrors `use-observed-read.ts`'s reasoning):
 * proposals are a cross-network read lens, not a durable in-flight operation, so a one-shot
 * dependency-driven read is the honest shape — the host owns any refresh cadence.
 */

/** viem's `PublicClient`, obtained transitively through core's read signature — no direct
 *  `viem` import (mirrors `GovernanceEvmClient` in `use-governance.ts`). */
export type ProposalsEvmClient = Parameters<typeof discoverProposals>[0]

// The bounded discovery window (Flare's `eth_getLogs` cap, the gasless-adapter.ts /
// live-governance.mjs precedent): windows <= 30 blocks/call, looking back 4500 blocks. Module
// constants, not props: core's `discoverProposals` keeps its positional params (its own tests
// assert the window bounds), but no caller of this hook has ever wanted to vary them.
const LOOKBACK_BLOCKS = 4_500n
const MAX_RANGE = 30n

export interface UseProposalsInput {
  /** The `flare` (mainnet) deployment — proposals are a cross-network read lens; Coston2
   *  hosts none (probe-confirmed). */
  readonly readDeployment: GovernanceDeployment
  readonly publicClient: ProposalsEvmClient
  readonly account: `0x${string}`
}

export interface UseProposalsResult {
  /** `undefined` = not yet loaded OR the discovery read failed (see `error`) — never
   *  conflated with a confirmed-empty catalogue. `[]` = discovery genuinely SUCCEEDED and
   *  found zero proposals — honest-empty. A non-empty array = observed proposals. */
  readonly proposals: ProposalSummary[] | undefined
  /** True until the discovery read for the CURRENT deps completes — it returns to `true`
   *  whenever `readDeployment`/`account` change, so rows read from the previous network are
   *  never presented as a fresh result under the new one. */
  readonly loading: boolean
  /** The last failed read's message; never overwrites `proposals` with a fabricated `[]`. */
  readonly error: string | undefined
  /** `undefined` until the id has both been discovered AND its detail read has landed. A
   *  discovered proposal whose detail read failed returns the honest `ProposalUnknown`
   *  shape, never a fabricated tally. An id never discovered stays `undefined`. Takes the
   *  `source` alongside the id because ids are only unique WITHIN a source — the catalogue's
   *  `onSelect(id, source)` already supplies both. */
  detailOf(id: bigint, source: ProposalSource): ProposalDetailView | ProposalUnknown | undefined
}

export function useProposals(input: UseProposalsInput): UseProposalsResult {
  const { readDeployment, publicClient, account } = input
  const [proposals, setProposals] = useState<ProposalSummary[] | undefined>(undefined)
  const [details, setDetails] = useState<Map<string, ProposalDetailView | ProposalUnknown>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!publicClient) return
    // `live` is the supersession guard: React runs this effect's cleanup BEFORE re-running it,
    // so a run whose deps have changed is already flagged dead at every `await` boundary below
    // and can never write its result over the newer one.
    let live = true
    // A dep change means what is held was read from the PREVIOUS deps. Go back to `loading` so
    // the surface renders its pending state instead of stamping mainnet's rows with the new
    // network's label and calling them a fresh result.
    setLoading(true)
    const run = async () => {
      try {
        const found = await discoverProposals(publicClient, readDeployment, LOOKBACK_BLOCKS, MAX_RANGE)
        if (!live) return
        // `found` came from a SUCCESSFUL call — `[]` here is a confirmed-empty discovery,
        // never conflated with the unavailable (`undefined`) the catch branch below leaves.
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
        // `discoverProposals` THROWS on any failed read (see its contract in proposals.ts) —
        // an RPC outage arrives here. Record it in `error` and deliberately do NOT touch
        // `proposals`: it stays `undefined` (never loaded) on a first failure, or holds its
        // last good value on a later one — either way it must NEVER be set to `[]` from this
        // branch, or an outage would render as honest-empty.
        if (live) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (live) setLoading(false)
      }
    }
    void run()
    return () => {
      live = false
    }
  }, [publicClient, readDeployment, account])

  const detailOf = useCallback(
    (id: bigint, source: ProposalSource): ProposalDetailView | ProposalUnknown | undefined => {
      // Keyed by (source, id), not id alone: the two governance surfaces number their
      // proposals independently, so an id is only unique within its source.
      if (!proposals?.some((p) => p.id === id && p.source === source)) return undefined
      return details.get(`${source}:${id}`)
    },
    [proposals, details],
  )

  return { proposals, loading, error, detailOf }
}
