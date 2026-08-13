import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CustomFeedReview } from '../src/CustomFeedReview.js'
import { IncentiveComposer } from '../src/IncentiveComposer.js'
import { SecureRandomPanel } from '../src/SecureRandomPanel.js'
import { expectFtsoDistinct } from './ftso-shapes.js'
import {
  CUSTOM_EMPTY,
  CUSTOM_MAINNET,
  EFFECT,
  MEASURED_OFFER_WEI,
  NOW,
  CUSTOM_READINGS,
  PAYER,
  QUOTE,
  RANDOM_INSECURE,
  RANDOM_REFUSED,
  RANDOM_SECURE,
  UNAVAILABLE,
} from './ftso-fixtures.js'

/**
 * FTSO-04, FTSO-05 and FTSO-06 — the three surfaces where a wrong rendering
 * would be a lie rather than a blemish: a value that should have been refused, a
 * decayed incentive shown as a failure, and a custom feed presented as though the
 * providers had voted on it.
 */

describe('FTSO-04 SecureRandomPanel', () => {
  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      secure: <SecureRandomPanel random={RANDOM_SECURE} now={NOW} />,
      policyAccepted: <SecureRandomPanel random={RANDOM_SECURE} requireSecure now={NOW} />,
      insecureReturned: <SecureRandomPanel random={RANDOM_INSECURE} now={NOW} />,
      policyRejected: <SecureRandomPanel random={RANDOM_REFUSED} requireSecure now={NOW} />,
      belowFloor: <SecureRandomPanel votingRoundId={800_000n} floorRound={864_606n} now={NOW} />,
      unavailable: <SecureRandomPanel random={UNAVAILABLE} now={NOW} />,
      loading: <SecureRandomPanel loading now={NOW} />,
      stale: <SecureRandomPanel random={RANDOM_SECURE} now={NOW} stale />,
    })
  })

  it('renders no value at all when the read refused', () => {
    // M4-AC6. A flag beside a usable number is an invitation to use the number,
    // so a refusal must leave nothing on the surface to reach for.
    const { container } = render(
      <SecureRandomPanel random={RANDOM_REFUSED} requireSecure votingRoundId={872_874n} now={NOW} />,
    )
    expect(container.querySelectorAll('.fk-ftso-random-value')).toHaveLength(0)
    expect(container.querySelector('[data-secure]')).toBeNull()
    expect(screen.getByText(/returned no value/i)).toBeTruthy()
  })

  it('marks an insecure value that was returned because nothing required otherwise', () => {
    // The flag is never left sitting quietly beside a perfectly usable number.
    const { container } = render(<SecureRandomPanel random={RANDOM_INSECURE} now={NOW} />)
    expect(container.querySelector('[data-secure="false"]')).toBeTruthy()
    expect(screen.getByText('Not secure')).toBeTruthy()
    expect(screen.getByText(/no requirement stopped it/i)).toBeTruthy()
  })

  it('renders a round below the retained range as an edge, not a failure', () => {
    render(<SecureRandomPanel votingRoundId={800_000n} floorRound={864_606n} now={NOW} />)
    expect(screen.getByText(/below the retained range/i)).toBeTruthy()
    expect(screen.getByText(/not a claim that the round had no randomness/i)).toBeTruthy()
  })
})

describe('FTSO-05 IncentiveComposer', () => {
  const base = { nativeAsset: 'C2FLR', now: NOW }

  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      quotedNoSigner: <IncentiveComposer {...base} quote={QUOTE} />,
      ready: <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} onSubmit={() => {}} />,
      notEligible: <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} eligible={false} />,
      quoteStale: <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} quoteStale />,
      overLimit: (
        <IncentiveComposer
          {...base}
          quote={{ ...QUOTE, rangeLimit: QUOTE.rangeIncrease / 2n }}
          payer={PAYER}
        />
      ),
      submitted: <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} state="submitted" />,
      confirmed: <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} state="succeeded" effect={EFFECT} />,
      expired: (
        <IncentiveComposer
          {...base}
          quote={QUOTE}
          payer={PAYER}
          state="succeeded"
          effect={EFFECT}
          effectExpired
        />
      ),
      loading: <IncentiveComposer {...base} loading />,
    })
  })

  it('offers the exact live-bisected amount, at full precision, with its asset', () => {
    // The price is a function of this offer. Pricing against getRange() — the
    // obvious reading — overstates by ~5,500x, which only driving the contract
    // caught. The button carries the number somebody is about to sign for.
    render(<IncentiveComposer {...base} quote={QUOTE} payer={PAYER} onSubmit={() => {}} />)
    expect(QUOTE.offerAmountWei).toBe(MEASURED_OFFER_WEI)
    expect(screen.getByText(`Offer 0.${'366210937499999999'} C2FLR`)).toBeTruthy()
    expect(screen.getByText(`${MEASURED_OFFER_WEI.toString()} wei`, { exact: false })).toBeTruthy()
  })

  it('never renders submitted as succeeded', () => {
    render(<IncentiveComposer {...base} quote={QUOTE} payer={PAYER} state="submitted" />)
    expect(screen.getByText('Submitted')).toBeTruthy()
    expect(screen.getByText(/not yet confirmed/i)).toBeTruthy()
    expect(screen.queryByText('Succeeded')).toBeNull()
  })

  it('renders a zero sample-size increase as exactly that', () => {
    // M4-R7. It was 0 in the real mainnet offer. Dressing a zero up as a
    // purchase would be inventing a result.
    render(<IncentiveComposer {...base} quote={QUOTE} payer={PAYER} effect={EFFECT} />)
    expect(screen.getByText(/bought no additional sampling/i)).toBeTruthy()
  })

  it('renders a decayed effect as expired rather than as a failed offer', () => {
    // M4-AC7. The widening lasts a stated duration; a later read showing no
    // effect is the incentive ending, never the transaction failing.
    const { container } = render(
      <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} effect={EFFECT} effectExpired />,
    )
    expect(container.querySelector('[data-expired="true"]')).toBeTruthy()
    expect(screen.getByText(/has expired/i)).toBeTruthy()
    expect(screen.queryByText(/failed/i)).toBeNull()
  })

  it('refuses to submit without a payer or on a stale quote', () => {
    // Nothing that could spend is reachable until the offer is current and
    // somebody can actually fund it.
    const noPayer = render(<IncentiveComposer {...base} quote={QUOTE} onSubmit={() => {}} />)
    expect(noPayer.container.querySelector('.fk-btn-primary')).toHaveProperty('disabled', true)
    noPayer.unmount()
    const stale = render(
      <IncentiveComposer {...base} quote={QUOTE} payer={PAYER} quoteStale onSubmit={() => {}} />,
    )
    expect(stale.container.querySelector('.fk-btn-primary')).toHaveProperty('disabled', true)
  })
})

describe('FTSO-06 CustomFeedReview', () => {
  it('renders its required states as distinct shapes', () => {
    expectFtsoDistinct({
      empty: <CustomFeedReview feeds={CUSTOM_EMPTY} now={NOW} />,
      populated: <CustomFeedReview feeds={CUSTOM_MAINNET} readings={CUSTOM_READINGS} now={NOW} />,
      noValues: <CustomFeedReview feeds={CUSTOM_MAINNET} now={NOW} />,
      excluded: (
        <CustomFeedReview
          feeds={CUSTOM_MAINNET}
          now={NOW}
          excluded={[
            {
              feedId: '0x000000000000000000000000d1002f3820ad32145b',
              condition: 'invalid_metadata',
              reportedBy: 'FtsoV2.getCustomFeeds()',
              detail: 'Category 0x00 with no decodable name.',
            },
          ]}
        />
      ),
      unavailable: <CustomFeedReview feeds={UNAVAILABLE} now={NOW} />,
      loading: <CustomFeedReview loading now={NOW} />,
    })
  })

  it('renders an empty network as a dated observation, not an error', () => {
    // M4-AC8. Coston2 genuinely has none. An unread set and an empty one must
    // not look the same.
    render(<CustomFeedReview feeds={CUSTOM_EMPTY} now={NOW} />)
    expect(screen.getByText(/carries no custom feeds/i)).toBeTruthy()
    expect(screen.getByText(/not a failed read/i)).toBeTruthy()
    expect(screen.getByText('2026-08-04')).toBeTruthy()
  })

  it('names the network it read on the surface', () => {
    // M4-R8. The set is network-specific and one of the two is empty, so a
    // reader must never have to guess which one they are looking at.
    render(<CustomFeedReview feeds={CUSTOM_MAINNET} now={NOW} />)
    expect(screen.getAllByText(/Coston2/).length).toBeGreaterThan(0)
  })

  it('declares creation blocked with its governance evidence', () => {
    // Not unimplemented — unavailable. addCustomFeeds is governance-gated.
    render(<CustomFeedReview feeds={CUSTOM_EMPTY} now={NOW} />)
    expect(screen.getByText(/blocked/i)).toBeTruthy()
    expect(screen.getByText(/governance-restricted/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull()
  })

  it('never presents a custom feed as protocol-equivalent', () => {
    render(<CustomFeedReview feeds={CUSTOM_MAINNET} readings={CUSTOM_READINGS} now={NOW} />)
    expect(screen.getByText(/not protocol feeds/i)).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })
})
