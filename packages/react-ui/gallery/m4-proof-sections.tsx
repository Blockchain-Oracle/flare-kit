import { createMockFtsoReader, readSecureRandom } from '@flarekit-dev/core'
import { ScalingProofDetail, SecureRandomPanel } from '@flarekit-dev/react-ui'
import type { GallerySection } from './m3-sections'
import {
  ANCHOR_FLR,
  ANCHOR_SINGLE_LEAF,
  COSTON2,
  FLR_USD,
  M4_NOW,
  SOURCE,
} from './m4-fixtures'

/**
 * FTSO-03 and FTSO-04, in every state the M4 spec requires.
 *
 * The cases worth looking at hardest:
 *
 * - **`could not be checked`** must not read like a failure.
 *   `FtsoV2.verifyFeedData` reverts on a bad proof rather than returning false,
 *   so this is the *common* outcome and `not proven` is the rare one. If the two
 *   ever render alike, an unknown is being shown as a negative fact.
 * - **The refused random** is the only case where a value exists on chain and
 *   deliberately does not reach the screen. Round 872874 genuinely reports
 *   `isSecureRandom = false` on Coston2 — one of four found by sampling 401
 *   rounds — so the refusal is driven through the real read rather than staged.
 */

const ROUND = 1_415_859n

const reader = createMockFtsoReader()
const insecureReader = createMockFtsoReader({ currentRandomIsSecure: false })

/** Driven through the real read, so the policy is the one that ships. */
const CURRENT_SECURE = await readSecureRandom({
  reader,
  chainId: COSTON2,
  now: () => M4_NOW - 3_000,
})
const CURRENT_INSECURE = await readSecureRandom({
  reader: insecureReader,
  chainId: COSTON2,
  now: () => M4_NOW - 3_000,
})
/** 872874 is one of the four rounds Coston2 really reports as not secure. */
const HISTORICAL_REFUSED = await readSecureRandom({
  reader,
  chainId: COSTON2,
  votingRoundId: 872_874n,
  requireSecure: true,
  now: () => M4_NOW - 3_000,
})
const HISTORICAL_INSECURE = await readSecureRandom({
  reader,
  chainId: COSTON2,
  votingRoundId: 872_874n,
  now: () => M4_NOW - 3_000,
})

const RANDOM_UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'The Relay call reverted: getRandomNumberHistorical is not served by this node.',
  source: { ...SOURCE, provider: 'Relay (RandomNumberV2)' },
  observedAt: M4_NOW - 30_000,
}

/** `observedAt` is when the chain was asked — never the surface's render clock. */
const PROVEN = {
  outcome: 'proven' as const,
  feedId: FLR_USD,
  name: 'FLR/USD',
  votingRoundId: 1_415_859,
  observedAt: M4_NOW - 2_000,
}

export const M4_PROOF_SECTIONS: GallerySection[] = [
  {
    id: 'ftso-03',
    title: 'FTSO-03 ScalingProofDetail',
    cases: [
      {
        name: 'loading — nothing asserted about the round yet',
        node: <ScalingProofDetail feedName="FLR/USD" votingRoundId={ROUND} loading now={M4_NOW} />,
      },
      {
        name: 'BASE — retrieved and proven on chain',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="retrieved"
            anchor={ANCHOR_FLR}
            verification={PROVEN}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'could not be checked — verifyFeedData reverted',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="retrieved"
            anchor={ANCHOR_FLR}
            verification={{
              ...PROVEN,
              outcome: 'could_not_check',
              reason: 'merkle proof invalid',
            }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'verification failed — a definite no from the chain',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="retrieved"
            anchor={ANCHOR_FLR}
            verification={{ ...PROVEN, outcome: 'not_proven' }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'retrieved, nothing has asked the chain yet',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="retrieved"
            anchor={ANCHOR_FLR}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'single-leaf round — an empty proof is valid, not truncated',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={1_415_402n}
            availability="retrieved"
            anchor={ANCHOR_SINGLE_LEAF}
            verification={{ ...PROVEN, votingRoundId: 1_415_402 }}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'proof pending — finalized, host has not indexed it',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="pending"
            now={M4_NOW}
            onRetry={() => {}}
          />
        ),
      },
      {
        name: 'proof unavailable — the host answered and had nothing',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={1_100_000n}
            availability="unavailable"
            reason="The host answered 400: anchor feeds not found for this round."
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'host could not be asked',
        node: (
          <ScalingProofDetail
            feedName="FLR/USD"
            votingRoundId={ROUND}
            availability="could_not_ask"
            reason="The request timed out after 30s."
            now={M4_NOW}
            onRetry={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'ftso-04',
    title: 'FTSO-04 SecureRandomPanel',
    cases: [
      { name: 'loading', node: <SecureRandomPanel loading now={M4_NOW} /> },
      {
        name: 'BASE — current value, secure, nothing required',
        node: <SecureRandomPanel random={CURRENT_SECURE} now={M4_NOW} />,
      },
      {
        name: 'policy accepted — secure required, secure returned',
        node: <SecureRandomPanel random={CURRENT_SECURE} requireSecure now={M4_NOW} />,
      },
      {
        name: 'isSecure=false — returned, because nothing required otherwise',
        node: <SecureRandomPanel random={CURRENT_INSECURE} now={M4_NOW} />,
      },
      {
        name: 'policy rejected — round 872874 refused, no value at all',
        node: (
          <SecureRandomPanel
            random={HISTORICAL_REFUSED}
            requireSecure
            votingRoundId={872_874n}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'historical, insecure, no requirement set',
        node: (
          <SecureRandomPanel random={HISTORICAL_INSECURE} votingRoundId={872_874n} now={M4_NOW} />
        ),
      },
      {
        name: 'below the retained range — nothing to retrieve',
        node: (
          <SecureRandomPanel votingRoundId={800_000n} floorRound={864_606n} now={M4_NOW} />
        ),
      },
      {
        name: 'typed error — the random could not be read',
        node: (
          <SecureRandomPanel random={RANDOM_UNAVAILABLE} now={M4_NOW} onRefresh={() => {}} />
        ),
      },
      {
        name: 'stale, still rendered',
        node: <SecureRandomPanel random={CURRENT_SECURE} now={M4_NOW} stale onRefresh={() => {}} />,
      },
    ],
  },
]
