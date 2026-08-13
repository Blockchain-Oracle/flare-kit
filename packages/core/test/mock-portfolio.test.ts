import { describe, expect, it } from 'vitest'
import {
  MOCK_PORTFOLIO_SCENARIOS,
  mockOperationRecords,
  mockPortfolio,
  mockSourceConflicts,
} from '../src/mock-portfolio.js'
import { buildActivity } from '../src/activity.js'
import { isObserved } from '../src/observation.js'
import { isPortfolioEmpty, portfolioIsStale } from '../src/portfolio.js'
import { MOCK_EPOCH } from '../src/mock-config.js'

// M2-AC1: "Mock: every state above is reachable."
// CLAUDE.md: mock mode is explicit, labelled, and never a fallback triggered by
// a failure.

describe('every USER-01 state is reachable', () => {
  it('ready shows observed balances on both chains', () => {
    const portfolio = mockPortfolio('ready')
    expect(portfolio.positions).toHaveLength(3)
    expect(portfolio.positions.every((entry) => isObserved(entry.balance))).toBe(true)
    expect(portfolio.partialCoverage).toBe(false)
  })

  it('no-assets is every source answering zero, not a source failing', () => {
    expect(isPortfolioEmpty(mockPortfolio('no-assets'))).toBe(true)
  })

  it('read-only mode carries balances and still cannot sign', () => {
    const portfolio = mockPortfolio('read-only')
    expect(portfolio.readOnly).toBe(true)
    expect(portfolio.positions.some((entry) => isObserved(entry.balance))).toBe(true)
  })

  it('partial coverage leaves the unattached family not-connected', () => {
    const portfolio = mockPortfolio('partial-coverage')
    expect(portfolio.coverage.xrpl).toBe('not-connected')
    expect(portfolio.partialCoverage).toBe(true)
  })

  it('stale is past the source class budget', () => {
    expect(portfolioIsStale(mockPortfolio('stale'), MOCK_EPOCH)).toBe(true)
    expect(portfolioIsStale(mockPortfolio('ready'), MOCK_EPOCH)).toBe(false)
  })

  it('provider-unavailable reports unavailable rather than zero', () => {
    const portfolio = mockPortfolio('provider-unavailable')
    const down = portfolio.positions.filter((entry) => !isObserved(entry.balance))
    expect(down.length).toBeGreaterThan(0)
    expect(isPortfolioEmpty(portfolio)).toBe(false)
    for (const entry of down) {
      expect(entry.balance.status === 'unavailable' && entry.balance.reason.length).toBeGreaterThan(0)
    }
  })

  it('source-conflict produces a canonical/indexed disagreement', () => {
    const conflicts = mockSourceConflicts('source-conflict')
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts[0]?.canonical.source.class).toBe('chain')
    expect(conflicts[0]?.other.source.class).toBe('indexer')
  })

  it('produces no conflict when the mock index agrees', () => {
    expect(mockSourceConflicts('ready')).toHaveLength(0)
  })

  it('builds every declared scenario without throwing', () => {
    for (const scenario of MOCK_PORTFOLIO_SCENARIOS) {
      expect(mockPortfolio(scenario).assembledAt).toBe(MOCK_EPOCH)
    }
  })
})

describe('the mock is the only producer of non-chain source classes', () => {
  it('offers indexer and provider observations the live kit never makes', () => {
    const classes = new Set([
      ...mockSourceConflicts('source-conflict').map((conflict) => conflict.other.source.class),
      ...mockPortfolio('provider-unavailable').positions.map((entry) => entry.balance.source.class),
    ])
    expect(classes.has('indexer')).toBe(true)
    expect(classes.has('provider')).toBe(true)
  })

  it('labels every mock source and account so a screenshot cannot pass as live', () => {
    // Never fake protocol reality: these must not look like Coston2 values.
    const portfolio = mockPortfolio('ready')
    for (const entry of portfolio.positions) {
      expect(entry.balance.source.provider).toMatch(/mock/i)
      expect(entry.account).toMatch(/M0CK|MOCK/)
      expect(entry.asset).toMatch(/^(MFLR|MXRP|FMockXRP)$/)
    }
  })
})

describe('mock operation records', () => {
  it('keep a ledger payment, an attestation round and an execution as three', () => {
    for (const record of mockOperationRecords()) {
      expect(record.evidence).toHaveLength(3)
      expect(new Set(record.evidence.map((item) => item.kind)).size).toBe(3)
    }
  })

  it('reach the active, action-required and settled activity states', () => {
    const states = mockOperationRecords().map((record) => record.state)
    expect(states).toContain('succeeded')
    expect(states).toContain('awaiting_external')
    expect(states).toContain('action_required')
  })

  it('feed an activity list that declares its partial coverage', () => {
    const feed = buildActivity({ records: mockOperationRecords(), at: MOCK_EPOCH })
    expect(feed.entries).toHaveLength(3)
    expect(feed.empty).toBe(false)
    expect(feed.coverage.complete).toBe(false)
  })

  it('carry visibly fake identifiers', () => {
    for (const record of mockOperationRecords()) {
      for (const item of record.evidence) {
        expect(item.value).toMatch(/MOCK|M0CK|^900001$/)
      }
    }
  })
})
