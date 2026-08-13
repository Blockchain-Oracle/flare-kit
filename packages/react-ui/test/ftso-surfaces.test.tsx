import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedCatalogue } from '../src/FeedCatalogue.js'
import { FeedDetail } from '../src/FeedDetail.js'
import { FeedHistoryTable } from '../src/FeedHistoryTable.js'
import { ScalingProofDetail } from '../src/ScalingProofDetail.js'
import { expectFtsoDistinct } from './ftso-shapes.js'
import {
  ANCHOR_FLR,
  CATALOGUE,
  FLR_USD,
  HISTORY_BOUNDARY,
  HISTORY_EMPTY,
  HISTORY_FULL,
  HISTORY_NONE,
  NOW,
  PAID_READINGS,
  READINGS,
  UNAVAILABLE,
  entryFor,
} from './ftso-fixtures.js'

/** FTSO-01, FTSO-02 and FTSO-03, in every state the M4 spec requires. */

const PROVEN = {
  outcome: 'proven' as const,
  feedId: FLR_USD,
  name: 'FLR/USD',
  votingRoundId: 1_415_859,
}

describe('FTSO-01 FeedCatalogue', () => {
  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      BASE: <FeedCatalogue catalogue={CATALOGUE} readings={READINGS} now={NOW} />,
      loading: <FeedCatalogue loading now={NOW} />,
      noDeployment: <FeedCatalogue now={NOW} />,
      valuesUnavailable: <FeedCatalogue catalogue={CATALOGUE} readings={UNAVAILABLE} now={NOW} />,
      listUnavailable: <FeedCatalogue catalogue={UNAVAILABLE} now={NOW} />,
      stale: <FeedCatalogue catalogue={CATALOGUE} readings={READINGS} now={NOW} stale />,
    })
  })

  it('renders a renamed feed once, carrying its former name', () => {
    // M4-AC1. `getFeedsById` silently resolves MATIC/USD to POL/USD, so a
    // catalogue listing both would print one price under two names.
    const { container } = render(<FeedCatalogue catalogue={CATALOGUE} now={NOW} />)
    expect(container.querySelectorAll('[data-feed="POL/USD"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-feed="MATIC/USD"]')).toHaveLength(0)
    expect(screen.getByText(/Formerly/)).toBeTruthy()
    expect(screen.getByText('MATIC/USD')).toBeTruthy()
  })

  it('states the unused configuration index rather than rendering it as a row', () => {
    // M4-AC1. Index 52 holds an all-zero feed id that reverts when read. A
    // catalogue that silently filtered it leaves the count unexplained.
    const { container } = render(<FeedCatalogue catalogue={CATALOGUE} now={NOW} />)
    expect(container.querySelectorAll('[data-feed=""]')).toHaveLength(0)
    expect(screen.getByText(/unused/)).toBeTruthy()
    expect(screen.getByText('52')).toBeTruthy()
  })

  it('never renders an unread value as a zero or a dash', () => {
    // An unavailable source is not a value of nothing. M2-AC4, carried to FTSO.
    const { container } = render(<FeedCatalogue catalogue={CATALOGUE} readings={UNAVAILABLE} now={NOW} />)
    expect(container.querySelectorAll('.fk-ftso-value')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/\b0(\.0+)?\s+USD\b/)
  })

  it('distinguishes a read that failed from a read nobody attempted', () => {
    // A failed read used to render as `not_read`, whose stated meaning is that
    // nobody asked — an observed failure shown as an absence of observation, on
    // a screen whose own note said the read had been attempted and had failed.
    const failed = render(<FeedCatalogue catalogue={CATALOGUE} readings={UNAVAILABLE} now={NOW} />)
    for (const row of failed.container.querySelectorAll('[data-availability]')) {
      expect(row.getAttribute('data-availability')).toBe('not_answered')
    }
    // One per row: every feed in the list was in the batch that failed.
    expect(failed.getAllByText(/No answer/).length).toBe(failed.container.querySelectorAll('[data-availability]').length)
    failed.unmount()

    const neverAsked = render(<FeedCatalogue catalogue={CATALOGUE} now={NOW} />)
    for (const row of neverAsked.container.querySelectorAll('[data-availability]')) {
      expect(row.getAttribute('data-availability')).toBe('not_read')
    }
  })

  it('shows the fee it paid, and both oracles when they disagree', () => {
    // M4-AC3. Zero is a measured result; a fee is never hidden.
    render(<FeedCatalogue catalogue={CATALOGUE} readings={PAID_READINGS} now={NOW} />)
    expect(screen.getByText('3 wei')).toBeTruthy()
    expect(screen.getByText(/calculateFeeByIds/)).toBeTruthy()
  })

  it('keeps the feed list and the values as two separately dated claims', () => {
    // The list can be current while every value in it is stale. One chip would
    // let the fresh one vouch for the old one.
    const { container } = render(<FeedCatalogue catalogue={CATALOGUE} readings={READINGS} now={NOW} />)
    expect(container.querySelectorAll('.fk-ftso-prov-pair')).toHaveLength(2)
  })
})

describe('FTSO-02 FeedDetail', () => {
  it('renders its required states as distinct shapes', () => {
    const feed = entryFor('FLR/USD')
    expectFtsoDistinct({
      both: <FeedDetail feed={feed} reading={READINGS} anchor={ANCHOR_FLR} verification={PROVEN} now={NOW} />,
      latencyOnly: <FeedDetail feed={feed} reading={READINGS} now={NOW} />,
      anchorOnly: <FeedDetail feed={feed} anchor={ANCHOR_FLR} now={NOW} />,
      loading: <FeedDetail feed={feed} loading now={NOW} />,
      unavailable: <FeedDetail feed={feed} reading={UNAVAILABLE} now={NOW} />,
      couldNotCheck: (
        <FeedDetail
          feed={feed}
          reading={READINGS}
          anchor={ANCHOR_FLR}
          verification={{ ...PROVEN, outcome: 'could_not_check', reason: 'merkle proof invalid' }}
          now={NOW}
        />
      ),
    })
  })

  it('renders each path at its own exponent, never a shared one', () => {
    // M4-AC2. FLR/USD is 6 decimals on the anchor path and 8 at block latency.
    // A cached per-feed exponent is wrong by two orders of magnitude here, and
    // wrong quietly — the number still renders.
    render(<FeedDetail feed={entryFor('FLR/USD')} reading={READINGS} anchor={ANCHOR_FLR} now={NOW} />)
    expect(screen.getByText('0.00606301 USD')).toBeTruthy()
    expect(screen.getByText('0.006063 USD')).toBeTruthy()
    // Each exponent renders in mono — a number in the body face is a bug — so
    // the digits and the word "decimals" are separate elements.
    const claims = [...document.querySelectorAll('.fk-ftso-claim')].map((n) => n.textContent)
    expect(claims.some((text) => text?.includes('8 decimals'))).toBe(true)
    expect(claims.some((text) => text?.includes('6 decimals'))).toBe(true)
  })

  it('never presents either path as the price', () => {
    // Two claims, both rendered, neither reconciled into one.
    const { container } = render(
      <FeedDetail feed={entryFor('FLR/USD')} reading={READINGS} anchor={ANCHOR_FLR} now={NOW} />,
    )
    expect(container.querySelectorAll('.fk-ftso-claim')).toHaveLength(2)
    expect(screen.getByText(/not the same claim/i)).toBeTruthy()
  })

  it('does not paint the two-path state in the attention tint', () => {
    // The claim pair is the normal state. Reusing `.fk-conflict` painted the
    // happy path in the same amber as a warning, which spends the warning
    // colour everywhere else it is used.
    const { container } = render(
      <FeedDetail feed={entryFor('FLR/USD')} reading={READINGS} anchor={ANCHOR_FLR} now={NOW} />,
    )
    expect(container.querySelector('.fk-ftso-claims')?.classList.contains('fk-conflict')).toBe(false)
  })
})

describe('FTSO-02 FeedHistoryTable', () => {
  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      full: <FeedHistoryTable history={HISTORY_FULL} />,
      boundary: <FeedHistoryTable history={HISTORY_BOUNDARY} />,
      none: <FeedHistoryTable history={HISTORY_NONE} />,
      empty: <FeedHistoryTable history={HISTORY_EMPTY} />,
      loading: <FeedHistoryTable loading />,
      noRange: <FeedHistoryTable />,
    })
  })

  it('renders committed-but-unretrievable as neither an error nor a missing value', () => {
    // M4-AC5. The Relay's root outlives the host's leaves by ~297 days, so the
    // chain asserts a commitment for a value nobody can fetch. Nothing failed.
    const { container } = render(<FeedHistoryTable history={HISTORY_BOUNDARY} />)
    const row = container.querySelector('[data-status="committed_not_retrievable"]')
    expect(row).toBeTruthy()
    expect(row?.getAttribute('data-status')).not.toBe('could_not_ask')
    expect(row?.getAttribute('data-status')).not.toBe('not_finalized')
    expect(screen.getByText(/retention boundary/i)).toBeTruthy()
    // Twice on purpose: once as the row's own round, once named in the note as
    // the observed edge of the window.
    expect(screen.getAllByText('1130919').length).toBeGreaterThan(0)
  })

  it('keeps all four round answers apart', () => {
    // Conflating any two of them would state something the chain did not.
    const { container } = render(<FeedHistoryTable history={HISTORY_NONE} />)
    expect(container.querySelector('[data-status="not_finalized"]')).toBeTruthy()
    expect(container.querySelector('[data-status="could_not_ask"]')).toBeTruthy()
  })

  it('renders a missing round as its own row rather than closing the gap', () => {
    // The spec forbids a chart precisely so a gap cannot be smoothed into a
    // line between the values either side of it.
    const { container } = render(<FeedHistoryTable history={HISTORY_BOUNDARY} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(HISTORY_BOUNDARY.value.points.length)
  })
})

describe('FTSO-03 ScalingProofDetail', () => {
  const common = { feedName: 'FLR/USD', votingRoundId: 1_415_859n, now: NOW }

  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      proven: <ScalingProofDetail {...common} availability="retrieved" anchor={ANCHOR_FLR} verification={PROVEN} />,
      notProven: (
        <ScalingProofDetail
          {...common}
          availability="retrieved"
          anchor={ANCHOR_FLR}
          verification={{ ...PROVEN, outcome: 'not_proven' }}
        />
      ),
      couldNotCheck: (
        <ScalingProofDetail
          {...common}
          availability="retrieved"
          anchor={ANCHOR_FLR}
          verification={{ ...PROVEN, outcome: 'could_not_check', reason: 'merkle proof invalid' }}
        />
      ),
      unchecked: <ScalingProofDetail {...common} availability="retrieved" anchor={ANCHOR_FLR} />,
      pending: <ScalingProofDetail {...common} availability="pending" />,
      unavailable: <ScalingProofDetail {...common} availability="unavailable" />,
      couldNotAsk: <ScalingProofDetail {...common} availability="could_not_ask" />,
    })
  })

  it('renders a revert as could-not-check, carrying the reason', () => {
    // M4-AC4. `verifyFeedData` reverts on a bad proof rather than returning
    // false, so mapping a revert to not-proven renders an unknown as a negative.
    const { container } = render(
      <ScalingProofDetail
        {...common}
        availability="retrieved"
        anchor={ANCHOR_FLR}
        verification={{ ...PROVEN, outcome: 'could_not_check', reason: 'merkle proof invalid' }}
      />,
    )
    expect(container.querySelector('[data-outcome="could_not_check"]')).toBeTruthy()
    expect(container.querySelector('[data-outcome="not_proven"]')).toBeNull()
    expect(screen.getByText('merkle proof invalid')).toBeTruthy()
    expect(screen.getByText(/not a failed proof/i)).toBeTruthy()
  })

  it('keeps a pending proof apart from an absent one', () => {
    // The Relay publishing a root does not mean the leaves are fetchable; the
    // host indexes minutes later. A wait is not an absence.
    const { container: pending } = render(<ScalingProofDetail {...common} availability="pending" />)
    expect(pending.textContent).toMatch(/has not indexed it yet/i)
    const { container: gone } = render(<ScalingProofDetail {...common} availability="unavailable" />)
    expect(gone.textContent).toMatch(/served no proof/i)
  })

  it('renders an empty proof array as valid rather than truncated', () => {
    // A round whose tree holds one leaf has no siblings to supply.
    render(
      <ScalingProofDetail
        {...common}
        availability="retrieved"
        anchor={{ ...ANCHOR_FLR, value: { ...ANCHOR_FLR.value, proof: [] } }}
        verification={PROVEN}
      />,
    )
    expect(screen.getByText(/single leaf/i)).toBeTruthy()
  })
})
