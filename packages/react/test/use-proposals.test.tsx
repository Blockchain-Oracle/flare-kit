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

/** No proposal anywhere — `getLastProposal` id 0, no events. Honest-empty. */
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

describe('useProposals — honest-empty (M12)', () => {
  it('renders [] when discovery finds nothing — never a fabricated row', async () => {
    const publicClient = makeEmptyClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proposals).toEqual([])
    expect(result.current.detailOf(1n)).toBeUndefined()
  })
})

describe('useProposals — the mainnet catalogue + detail (M12)', () => {
  it('discovers the real proposal and detailOf maps it once the detail read lands', async () => {
    const publicClient = makeOneProposalClient()
    const { result } = renderHook(() => useProposals({ readDeployment, publicClient, account: ACCOUNT }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proposals).toHaveLength(1)
    expect(result.current.proposals[0]?.id).toBe(1n)
    expect(result.current.proposals[0]?.state).toBe('defeated')

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
