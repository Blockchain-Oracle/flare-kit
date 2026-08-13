'use client'

import { M4_PROOF_SECTIONS } from '@gallery/m4-proof-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ScalingProofDetail's live preview, running the gallery's `ftso-03` cases.
 *
 * The two cases worth switching between deliberately: `could not be checked`
 * and `verification failed`. `verifyFeedData` reverts on a bad proof rather
 * than returning false, so the first is the common outcome and the second is
 * the rare one — if they ever render alike, an unknown is being shown as a
 * negative fact.
 */
const PROOF_CASES = M4_PROOF_SECTIONS.find((section) => section.id === 'ftso-03')!.cases

const CODE = `import { FEED_CATEGORY, encodeFeedId, isObserved, observe } from '@flare-kit/core'
import type { RoundReader } from '@flare-kit/core'
import { useAnchorProof } from '@flare-kit/react'
import { ScalingProofDetail } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const FLR_USD = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

export function Proof({ reader, votingRoundId }: { reader: RoundReader; votingRoundId: bigint }) {
  const { data, loading, refresh } = useAnchorProof({
    reader,
    chainId: 114,
    feedIds: [FLR_USD],
    votingRoundId,
  })

  // One feed out of the batch, carrying the batch's own provenance.
  const retrieved = data && isObserved(data.retrieved) ? data.retrieved : undefined
  const found = retrieved?.value.found[0]

  return (
    <ScalingProofDetail
      feedName="FLR/USD"
      votingRoundId={votingRoundId}
      loading={loading}
      now={Date.now()}
      onRetry={refresh}
      {...(retrieved && found
        ? {
            availability: 'retrieved' as const,
            anchor: observe(found, retrieved.source, retrieved.observedAt),
          }
        : {})}
      {...(data?.verifications[0] ? { verification: data.verifications[0] } : {})}
    />
  )
}`

export function ScalingProofDetailDemo() {
  return <GalleryDemo cases={PROOF_CASES} code={CODE} />
}
