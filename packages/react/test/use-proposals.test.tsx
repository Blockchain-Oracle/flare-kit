import { governanceFor } from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useProposals, type ProposalsEvmClient } from '../src/use-proposals.js'

type Hex0x = `0x${string}`
const ACCOUNT: Hex0x = '0x00000000000000000000000000000000000000C3'
const PROPOSER: Hex0x = '0x000000000000000000000000000000000000abC1'

// `useProposals` is a cross-network READ LENS onto Flare mainnet — real proposals live
// there (Coston2 hosts none, probe-confirmed). Mirrors proposals.test.ts's fixtures.
const readDeployment = governanceFor('flare')

/** No proposal anywhere — `getLastProposal` id 0, no events. A CONFIRMED-empty discovery
 *  (the read succeeds) — honest-empty, distinct from the unavailable/`undefined` case below. */
function makeEmptyClient(): ProposalsEvmClient {
  return {
    async getBlockNumber() {
      return 1000n
    },
    async getContractEvents() {
      return []
    },
    async readContract({ functionName }: { functionName: string }) {
      if (functionName === 'getLastProposal') return [0n, '']
      throw new Error(`unexpected read ${functionName}`)
    },
  } as unknown as ProposalsEvmClient
}

/** Every discovery-scope call throws (an RPC outage) — `discoverProposals`'s own
 *  `getBlockNumber`/`getContractEvents` calls are NOT caught at that scope (proposals.ts),
 *  so this rejects the whole discovery read rather than yielding a confirmed `[]`. */
function makeThrowingClient(): ProposalsEvmClient {
  return {
    async getBlockNumber() {
      throw new Error('rpc down')
    },
    async getContractEvents() {
      throw new Error('rpc down')
    },
    async readContract() {
      throw new Error('rpc down')
    },
  } as unknown as ProposalsEvmClient
}

const FTSO_INFO = [
  247n,
  '{"name":"Block-latency parameter changes"}',
  PROPOSER,
  1_733_413_499n,
  1_733_586_299n,
  6_600n,
  5_000n,
  5_217_782_567_582_675_528_275n,
] as const

/** The one real observed proposal (Flare mainnet, source 'ftso', id 1) — mirrors
 *  `mock-governance.ts`'s `MOCK_GOVERNANCE_OBSERVED.proposal`. */
function makeOneProposalClient(): ProposalsEvmClient {
  return {
    async getBlockNumber() {
      return 1000n
    },
    async getContractEvents() {
      return []
    },
    async readContract({ address, functionName }: { address: Hex0x; functionName: string }) {
      if (address.toLowerCase() !== readDeployment.pollingFtso.toLowerCase()) {
        throw new Error(`unexpected read ${functionName} on ${address}`)
      }
      if (functionName === 'getLastProposal') return [1n, FTSO_INFO[1]]
      if (functionName === 'getProposalInfo') return FTSO_INFO
      if (functionName === 'getProposalVotes') return [2_354_308_387_975_507_843_417n, 0n]
      if (functionName === 'state') return 3 // FTSO index 3 -> defeated (live probe)
      throw new Error(`unexpected read ${functionName}`)
    },
  } as unknown as ProposalsEvmClient
}

describe('useProposals — confirmed-empty vs unavailable (M12, load-bearing)', () => {
  it('renders [] when discovery SUCCEEDS and finds nothing — confirmed honest-empty, never a fabricated row', async () => {
    const publicClient = makeEmptyClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proposals).toEqual([])
    expect(result.current.error).toBeUndefined()
    expect(result.current.detailOf(1n)).toBeUndefined()
  })

  it('a failed discovery read leaves proposals undefined (unavailable) — NEVER collapsed to a fabricated []', async () => {
    const publicClient = makeThrowingClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proposals).toBeUndefined()
    expect(result.current.error).toBeDefined()
    // The load-bearing distinction: an outage must never wear the shape of a confirmed-empty
    // catalogue — [] would tell a consumer "no proposals on this network", a different claim.
    expect(result.current.proposals).not.toEqual([])
  })
})

describe('useProposals — the mainnet catalogue + detail (M12)', () => {
  it('discovers the real proposal and detailOf maps it once the detail read lands', async () => {
    const publicClient = makeOneProposalClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const proposals = result.current.proposals
    expect(proposals).toHaveLength(1)
    expect(proposals?.[0]?.id).toBe(1n)
    expect(proposals?.[0]?.state).toBe('defeated')

    await waitFor(() => expect(result.current.detailOf(1n)).toBeDefined())
    const detail = result.current.detailOf(1n)
    expect(detail?.state).toBe('defeated')
    if (detail && 'for' in detail) {
      expect(detail.for).toBe(2_354_308_387_975_507_843_417n)
      expect(detail.thresholdBIPS).toBe(6_600)
    } else {
      throw new Error('expected a full ProposalDetailView, not the unknown shape')
    }
  })

  it('detailOf is undefined for an id that was never discovered — an unknown proposal stays unknown', async () => {
    const publicClient = makeOneProposalClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.proposals).toHaveLength(1))
    expect(result.current.detailOf(999n)).toBeUndefined()
  })
})
