import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  buildActivity,
  mockOperationRecords,
  mockPortfolio,
  mockSourceConflicts,
  MOCK_EPOCH,
  networkName,
  type PendingOperation,
} from '@flarekit-dev/core'
import { PortfolioTable } from '../src/PortfolioTable.js'
import { ActivityTable } from '../src/ActivityTable.js'
import { SourceDrawer } from '../src/SourceDrawer.js'
import { PendingTray } from '../src/PendingTray.js'

// M2-AC1: every required state of USER-01, USER-02, USER-03 and SH-10 is
// reachable against the mock.
// M2-AC4: a stale or unavailable source renders as stale or unavailable, never
// as zero and never as a confident number.

const NOW = MOCK_EPOCH

const pending = (
  state: PendingOperation['state'],
  operationId = 'op_mock_1',
): PendingOperation => ({
  operationId,
  capability: 'fassets.direct-mint',
  state,
  network: 114,
  updatedAt: NOW - 30_000,
  source: {
    class: 'local',
    provider: 'Operation registry',
    network: networkName(114),
    chainId: 114,
  },
})

describe('USER-01 PortfolioTable', () => {
  it('loading shows no values at all, not zeroes', () => {
    const { container } = render(<PortfolioTable loading now={NOW} />)
    expect(screen.getByRole('status').textContent).toMatch(/reading balances/i)
    expect(container.textContent).not.toMatch(/\b0\.0+\b/)
  })

  it('ready states every balance at full precision with its asset', () => {
    render(<PortfolioTable portfolio={mockPortfolio('ready')} now={NOW} />)
    expect(screen.getByText('120.500000000000000000 MFLR')).toBeInTheDocument()
    expect(screen.getByText('31.250000 FMockXRP')).toBeInTheDocument()
    expect(screen.getByText('84.950000 MXRP')).toBeInTheDocument()
  })

  it('no assets says every source answered', () => {
    render(<PortfolioTable portfolio={mockPortfolio('no-assets')} now={NOW} />)
    expect(screen.getByText(/every source answered/i)).toBeInTheDocument()
  })

  it('read-only mode says nothing here can be signed', () => {
    render(<PortfolioTable portfolio={mockPortfolio('read-only')} now={NOW} />)
    expect(screen.getByText(/nothing here can be signed/i)).toBeInTheDocument()
  })

  it('partial coverage names the chain that is missing', () => {
    render(<PortfolioTable portfolio={mockPortfolio('partial-coverage')} now={NOW} />)
    expect(screen.getByText(/no xrp ledger account is connected/i)).toBeInTheDocument()
  })

  it('stale marks the source rather than hiding the value', () => {
    render(<PortfolioTable portfolio={mockPortfolio('stale')} now={NOW} />)
    expect(screen.getAllByText(/stale/i).length).toBeGreaterThan(0)
    // The last value we actually saw stays on screen.
    expect(screen.getByText('120.500000000000000000 MFLR')).toBeInTheDocument()
  })

  it('an unreadable source renders as not read, never as zero', () => {
    const { container } = render(
      <PortfolioTable portfolio={mockPortfolio('provider-unavailable')} now={NOW} />,
    )
    expect(screen.getAllByText(/not read/i).length).toBeGreaterThan(0)
    // Each silent source reports its own endpoint's words. One shared
    // "failed to load" would hide which of the two chains went quiet.
    const reasons = screen.getAllByText(/did not respond/i).map((el) => el.textContent)
    expect(reasons).toHaveLength(2)
    expect(new Set(reasons).size).toBe(2)
    expect(container.textContent).not.toMatch(/0\.000000 FMockXRP/)
  })

  it('a source conflict is announced and points at the drawer', () => {
    render(<PortfolioTable portfolio={mockPortfolio('ready')} now={NOW} hasConflict onOpenSources={() => {}} />)
    expect(screen.getByText(/two sources disagree/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compare the sources/i })).toBeInTheDocument()
  })

  it('declares the unbuilt position types with no value column', () => {
    render(<PortfolioTable portfolio={mockPortfolio('ready')} now={NOW} />)
    expect(screen.getByText('Vault positions')).toBeInTheDocument()
    expect(screen.getByText(/no vault capability is built yet/i)).toBeInTheDocument()
  })
})

describe('USER-02 ActivityTable', () => {
  const feed = () => buildActivity({ records: mockOperationRecords(NOW), at: NOW })

  it('loading announces itself', () => {
    render(<ActivityTable loading />)
    expect(screen.getByRole('status').textContent).toMatch(/reading your operations/i)
  })

  it('empty says nothing was started on this device', () => {
    render(<ActivityTable feed={buildActivity({ records: [], at: NOW })} />)
    expect(screen.getByText(/have not started an operation/i)).toBeInTheDocument()
  })

  it('keeps the ledger payment, the round and the execution as three groups', () => {
    // R-DATA-003: never one hash standing in for a multi-chain journey.
    render(<ActivityTable feed={feed()} />)
    expect(screen.getAllByText('XRP Ledger').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Data Connector').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Flare').length).toBeGreaterThan(0)
  })

  it('backfilling says the list will grow, and is not called empty', () => {
    render(<ActivityTable feed={buildActivity({ records: [], at: NOW, backfilling: true })} />)
    expect(screen.getByText(/still being reconciled/i)).toBeInTheDocument()
    expect(screen.getByText(/history is still being read/i)).toBeInTheDocument()
  })

  it('states its partial coverage', () => {
    render(<ActivityTable feed={feed()} />)
    expect(screen.getByText(/no indexer is connected/i)).toBeInTheDocument()
  })

  it('an export error says no file was written', () => {
    render(<ActivityTable feed={feed()} exportError="Refusing to export a secret." onExport={() => {}} />)
    expect(screen.getByText(/no file was written/i)).toBeInTheDocument()
  })

  it('a filter hiding everything is not the same as no history', () => {
    render(<ActivityTable feed={feed()} entries={[]} />)
    expect(screen.getByText(/no operation matches this filter/i)).toBeInTheDocument()
  })
})

describe('USER-03 SourceDrawer', () => {
  it('ready lists every value with its provider and network', () => {
    render(<SourceDrawer portfolio={mockPortfolio('ready')} now={NOW} />)
    expect(screen.getByText(/every value on this portfolio/i)).toBeInTheDocument()
    expect(screen.getAllByText('Mock chain reader').length).toBeGreaterThan(0)
  })

  it('a canonical/indexed conflict shows both claims, resolving neither', () => {
    render(
      <SourceDrawer
        portfolio={mockPortfolio('source-conflict')}
        conflicts={mockSourceConflicts('source-conflict', NOW)}
        now={NOW}
      />,
    )
    expect(screen.getAllByText('Canonical').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Other source').length).toBeGreaterThan(0)
    expect(screen.getByText(/neither is discarded/i)).toBeInTheDocument()
  })

  it('a provider that did not answer is listed with its reason', () => {
    render(<SourceDrawer portfolio={mockPortfolio('provider-unavailable')} now={NOW} />)
    expect(screen.getByText(/sources that did not answer/i)).toBeInTheDocument()
    expect(screen.getByText(/mock price provider did not respond/i)).toBeInTheDocument()
  })

  it('declares the source classes this build never asked', () => {
    render(<SourceDrawer portfolio={mockPortfolio('ready')} now={NOW} />)
    expect(screen.getByText(/no indexer is connected/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing is served from a cache/i)).toBeInTheDocument()
  })
})

describe('SH-10 PendingTray', () => {
  it('loading announces itself', () => {
    render(<PendingTray pending={[]} loading now={NOW} />)
    expect(screen.getByRole('status').textContent).toMatch(/checking for operations/i)
  })

  it('empty says nothing is in flight', () => {
    render(<PendingTray pending={[]} now={NOW} />)
    expect(screen.getByText(/nothing is in flight/i)).toBeInTheDocument()
  })

  it('active shows the operation with its state and its source', () => {
    render(<PendingTray pending={[pending('awaiting_external')]} now={NOW} />)
    expect(screen.getByText('op_mock_1')).toBeInTheDocument()
    expect(screen.getByText(/this device/i)).toBeInTheDocument()
  })

  it('action required is called out separately, and counts read as English', () => {
    // The browser pass found "1 need you". A count in a sentence needs both
    // forms written out, not a template over a bare number.
    render(<PendingTray pending={[pending('action_required')]} now={NOW} />)
    expect(screen.getByText(/one operation needs you/i)).toBeInTheDocument()

    render(
      <PendingTray
        pending={[pending('action_required'), pending('action_required', 'op_mock_2')]}
        now={NOW}
      />,
    )
    expect(screen.getByText(/2 operations need you/i)).toBeInTheDocument()
  })

  it('a degraded source says an operation started elsewhere will not appear', () => {
    render(<PendingTray pending={[pending('submitted')]} degraded now={NOW} />)
    expect(screen.getByText(/another browser will not appear/i)).toBeInTheDocument()
  })

  it('restored says it is the last state we recorded, not the chain', () => {
    render(<PendingTray pending={[pending('submitted')]} restored now={NOW} />)
    expect(screen.getByText(/last state we recorded/i)).toBeInTheDocument()
  })

  it('never renders submitted as succeeded', () => {
    const { container } = render(<PendingTray pending={[pending('submitted')]} now={NOW} />)
    expect(container.textContent).not.toMatch(/succeeded/i)
  })
})
