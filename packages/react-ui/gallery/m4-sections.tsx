import { observe } from '@flare-kit/core'
import { FeedCatalogue, FeedDetail, FeedHistoryTable } from '../src/index.js'
import type { GallerySection } from './m3-sections.js'
import {
  ANCHOR_DIVERGENT,
  ANCHOR_FLR,
  CATALOGUE,
  CATALOGUE_UNAVAILABLE,
  COSTON2,
  CUSTOM_CATALOGUE,
  FLR_USD,
  HISTORY_BOUNDARY,
  HISTORY_EMPTY,
  HISTORY_FULL,
  HISTORY_NONE,
  HISTORY_UNAVAILABLE,
  M4_NOW,
  PAID_READINGS,
  READINGS,
  READINGS_UNAVAILABLE,
  SOURCE,
  entryFor,
} from './m4-fixtures.js'

/**
 * FTSO-01 and FTSO-02, in every state the M4 spec's Surfaces table requires.
 *
 * The two cases worth looking at hardest: the `BASE` catalogue is where a
 * renamed feed has to read as **one** feed with a former name rather than two,
 * and the FeedDetail cases are where the six-decimal anchor value and the
 * eight-decimal block-latency value of the same asset sit side by side. If those
 * two ever render as one number, the surface has picked one and hidden the
 * choice.
 */

const EMPTY_CATALOGUE = observe(
  {
    network: 'Coston2',
    chainId: COSTON2,
    entries: [],
    renames: [],
    unusedIndices: [],
    customFeedCount: 0,
  },
  SOURCE,
  M4_NOW - 5_000,
)

export const M4_SECTIONS: GallerySection[] = [
  {
    id: 'ftso-01',
    title: 'FTSO-01 FeedCatalogue',
    cases: [
      { name: 'loading', node: <FeedCatalogue loading now={M4_NOW} /> },
      { name: 'no deployment selected', node: <FeedCatalogue now={M4_NOW} /> },
      {
        name: 'BASE — list and values, one renamed feed, unused index stated',
        node: <FeedCatalogue catalogue={CATALOGUE} readings={READINGS} now={M4_NOW} />,
      },
      {
        name: 'AVAIL — custom feeds listed, their updater returned nothing',
        node: <FeedCatalogue catalogue={CUSTOM_CATALOGUE} readings={READINGS} now={M4_NOW} />,
      },
      {
        name: 'legitimate empty — this deployment serves no feeds',
        node: <FeedCatalogue catalogue={EMPTY_CATALOGUE} now={M4_NOW} />,
      },
      {
        name: 'typed error — the list could not be read',
        node: <FeedCatalogue catalogue={CATALOGUE_UNAVAILABLE} now={M4_NOW} onRefresh={() => {}} />,
      },
      {
        name: 'SOURCE — list read, values unavailable',
        node: <FeedCatalogue catalogue={CATALOGUE} readings={READINGS_UNAVAILABLE} now={M4_NOW} />,
      },
      {
        name: 'stale metadata',
        node: (
          <FeedCatalogue
            catalogue={CATALOGUE}
            readings={READINGS}
            now={M4_NOW}
            stale
            onRefresh={() => {}}
          />
        ),
      },
      {
        name: 'paid read — 3 wei quoted from FtsoV2 and actually paid',
        node: <FeedCatalogue catalogue={CATALOGUE} readings={PAID_READINGS} now={M4_NOW} />,
      },
    ],
  },
  {
    id: 'ftso-02-detail',
    title: 'FTSO-02 FeedDetail',
    cases: [
      { name: 'loading', node: <FeedDetail feed={entryFor('FLR/USD')} loading now={M4_NOW} /> },
      {
        name: 'BASE — both paths, six decimals against eight',
        node: (
          <FeedDetail
            feed={entryFor('FLR/USD')}
            reading={READINGS}
            anchor={ANCHOR_FLR}
            verification={{
              outcome: 'proven',
              feedId: FLR_USD,
              name: 'FLR/USD',
              votingRoundId: 1_415_859,
            }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'block latency only — no anchor retrieved',
        node: <FeedDetail feed={entryFor('BTC/USD')} reading={READINGS} now={M4_NOW} />,
      },
      {
        name: 'anchor only — nothing read at block latency',
        node: <FeedDetail feed={entryFor('FLR/USD')} anchor={ANCHOR_FLR} now={M4_NOW} />,
      },
      {
        name: 'the two paths differ widely — NOT a computed provider conflict',
        node: (
          <FeedDetail
            feed={entryFor('FLR/USD')}
            reading={READINGS}
            anchor={ANCHOR_DIVERGENT}
            verification={{
              outcome: 'proven',
              feedId: FLR_USD,
              name: 'FLR/USD',
              votingRoundId: 1_411_002,
            }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'renamed feed — one feed carrying a former name',
        node: <FeedDetail feed={entryFor('POL/USD')} reading={READINGS} now={M4_NOW} />,
      },
      {
        name: 'proof could not be checked — a revert, not a negative',
        node: (
          <FeedDetail
            feed={entryFor('FLR/USD')}
            reading={READINGS}
            anchor={ANCHOR_FLR}
            verification={{
              outcome: 'could_not_check',
              feedId: FLR_USD,
              name: 'FLR/USD',
              votingRoundId: 1_415_859,
              reason: 'merkle proof invalid',
            }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'typed error — the value could not be read',
        node: <FeedDetail feed={entryFor('FLR/USD')} reading={READINGS_UNAVAILABLE} now={M4_NOW} />,
      },
      {
        name: 'stale, still rendered',
        node: (
          <FeedDetail
            feed={entryFor('FLR/USD')}
            reading={READINGS}
            anchor={ANCHOR_FLR}
            now={M4_NOW}
            stale
            onRefresh={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'ftso-02-history',
    title: 'FTSO-02 FeedHistoryTable',
    cases: [
      { name: 'loading', node: <FeedHistoryTable loading /> },
      { name: 'no range selected', node: <FeedHistoryTable /> },
      {
        name: 'BASE — every round retrieved, with its provenance',
        node: <FeedHistoryTable history={HISTORY_FULL} feedName="FLR/USD" now={M4_NOW} />,
      },
      {
        name: 'retention boundary inside the range',
        node: <FeedHistoryTable history={HISTORY_BOUNDARY} feedName="FLR/USD" now={M4_NOW} />,
      },
      {
        name: 'nothing retrievable — committed, no root, not asked',
        node: (
          <FeedHistoryTable
            history={HISTORY_NONE}
            feedName="FLR/USD"
            now={M4_NOW}
            onRefresh={() => {}}
          />
        ),
      },
      {
        name: 'stale — rounds read hours ago, now reachable at last',
        node: (
          <FeedHistoryTable
            history={HISTORY_FULL}
            feedName="FLR/USD"
            now={M4_NOW}
            stale
            onRefresh={() => {}}
          />
        ),
      },
      {
        name: 'the host could not be asked for the range at all',
        node: <FeedHistoryTable history={HISTORY_UNAVAILABLE} feedName="FLR/USD" now={M4_NOW} />,
      },
      {
        name: 'empty range',
        node: <FeedHistoryTable history={HISTORY_EMPTY} feedName="FLR/USD" now={M4_NOW} />,
      },
    ],
  },
]
