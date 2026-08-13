import { describe, expect, it } from 'vitest'
import { observe, unavailable } from '../src/observation.js'
import {
  assemblePortfolio,
  isPortfolioEmpty,
  portfolioConflicts,
  portfolioIsStale,
} from '../src/portfolio.js'
import {
  bothConnected,
  c2flr,
  chainSource,
  fAssetPosition,
  flarePosition,
  indexerSource,
  nativeFlare,
  xrp,
  xrplPosition,
  xrplSource,
} from './portfolio-fixtures.js'

// M2-AC4: "A stale or unavailable source renders as stale or unavailable,
// never as zero and never as a confident number."
// USER-01 and USER-03 both require a canonical/indexed conflict state.

describe('empty versus unavailable', () => {
  it('is empty only when every source answered and every holding is zero', () => {
    // Both identities are attached, so both must have answered. An earlier
    // version of this test supplied only the Flare side and still asserted
    // `true`, which pinned the exact defect M2-AC4 forbids.
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [
        flarePosition(observe(c2flr(0n), chainSource, 1_000)),
        xrplPosition(observe(xrp(0n), xrplSource, 1_000)),
      ],
      pending: [],
      at: 2_000,
    })
    expect(isPortfolioEmpty(portfolio)).toBe(true)
  })

  it('is not empty when an attached identity produced no reading at all', () => {
    // The XRPL wallet is connected and nothing came back for it. Rendering
    // "no assets" here is a confident claim about an account nobody read.
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [flarePosition(observe(c2flr(0n), chainSource, 1_000))],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.coverage.xrpl).toBe('unavailable')
    expect(isPortfolioEmpty(portfolio)).toBe(false)
  })

  it('is not empty when one of a family’s reads failed', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [
        flarePosition(observe(c2flr(0n), chainSource, 1_000)),
        fAssetPosition(unavailable(chainSource, 1_000, 'The Coston2 RPC did not respond.')),
        xrplPosition(observe(xrp(0n), xrplSource, 1_000)),
      ],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.coverage.evm).toBe('partial')
    expect(portfolio.partialCoverage).toBe(true)
    expect(isPortfolioEmpty(portfolio)).toBe(false)
  })

  it('is never empty when a source could not be read', () => {
    // "No assets" is a claim about the account. An unread source supports no
    // claim about the account at all.
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [
        flarePosition(unavailable(chainSource, 2_000, 'The Coston2 RPC did not respond.')),
      ],
      pending: [],
      at: 2_000,
    })
    expect(isPortfolioEmpty(portfolio)).toBe(false)
  })

  it('is not empty while an operation is still in flight', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [],
      pending: [
        {
          operationId: 'op_1',
          capability: 'fassets.mint',
          state: 'awaiting_external',
          network: 114,
          updatedAt: 1_900,
          source: {
            class: 'local',
            provider: 'Operation registry',
            network: 'Coston2',
            chainId: 114,
          },
        },
      ],
      at: 2_000,
    })
    expect(isPortfolioEmpty(portfolio)).toBe(false)
  })
})

describe('staleness', () => {
  it('is stale when any observation has outlived its source class budget', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(1_000)],
      pending: [],
      at: 1_000 + 60_000,
    })
    expect(portfolioIsStale(portfolio, 1_000 + 60_000)).toBe(true)
  })

  it('is not stale inside the budget', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(1_000)],
      pending: [],
      at: 2_000,
    })
    expect(portfolioIsStale(portfolio, 2_000)).toBe(false)
  })

  it('counts an unavailable source as stale once its budget passes', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [flarePosition(unavailable(chainSource, 1_000, 'No response.'))],
      pending: [],
      at: 1_000 + 60_000,
    })
    expect(portfolioIsStale(portfolio, 1_000 + 60_000)).toBe(true)
  })
})

describe('canonical versus indexed', () => {
  const portfolio = () =>
    assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(1_000)],
      pending: [],
      at: 2_000,
    })

  it('reports a disagreement rather than choosing one', () => {
    const indexed = flarePosition(observe(c2flr(99_000000000000000000n), indexerSource, 1_100))
    const conflicts = portfolioConflicts(portfolio(), [indexed])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.positionId).toBe('evm:native')
    expect(conflicts[0]?.canonical.source.class).toBe('chain')
    expect(conflicts[0]?.other.source.class).toBe('indexer')
  })

  it('reports no conflict when the index agrees to the base unit', () => {
    const agreeing = flarePosition(observe(c2flr(100_000000000000000000n), indexerSource, 1_100))
    expect(portfolioConflicts(portfolio(), [agreeing])).toHaveLength(0)
  })

  it('does not call an unavailable index a conflict', () => {
    const down = flarePosition(unavailable(indexerSource, 1_100, 'The indexer is down.'))
    expect(portfolioConflicts(portfolio(), [down])).toHaveLength(0)
  })

  it('ignores a position the canonical portfolio does not hold', () => {
    const unknown = flarePosition(observe(c2flr(1n), indexerSource, 1_100))
    const conflicts = portfolioConflicts(
      assemblePortfolio({ context: bothConnected(), positions: [], pending: [], at: 2_000 }),
      [unknown],
    )
    expect(conflicts).toHaveLength(0)
  })
})
