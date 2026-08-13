'use client'

import { CodeWindow } from '@flarekit-dev/react-ui'
import { Preview } from '../preview'

/**
 * The one hook page with no running hook, and the reason is worth stating
 * rather than papering over.
 *
 * `useAnchorProof` takes a `RoundReader` for the on-chain verification — that
 * part a mock can stand in for — but the retrieval goes to the data
 * availability host over HTTP, and the host comes from the network registry
 * rather than from a parameter. There is no seam a documentation page can put a
 * mock behind, and these pages do not make network calls from a reader's
 * browser. So this pane shows the hook's return **type**, and says so. A
 * fixture dressed as a captured return value would be the one thing the docs
 * must never do.
 */

const CODE = `import { FEED_CATEGORY, encodeFeedId, isObserved } from '@flarekit-dev/core'
import { useAnchorProof } from '@flarekit-dev/react'

const FLR_USD = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

function Proof({ reader, votingRoundId }) {
  const { data, loading, error, refresh } = useAnchorProof({
    reader,
    chainId: 114,
    feedIds: [FLR_USD],
    votingRoundId,
  })

  // The rows are reachable only through the observation: a host that could not
  // be asked is not a round with no feeds in it.
  const retrieved = data && isObserved(data.retrieved) ? data.retrieved : undefined
  const verification = data?.verifications[0]

  // 'could_not_check' is neither 'proven' nor 'not_proven'. Rendering the
  // three-valued outcome as a boolean is how an unknown becomes a negative.
  return <ScalingProofDetail anchor={retrieved} verification={verification} />
}`

const SHAPE = `useAnchorProof(options): ObservedRead<AnchorProofState>

interface AnchorProofState {
  // Who served the leaves and when — the proof is a provider's claim until
  // the chain accepts it.
  retrieved: Observation<AnchorFeedsResult>
  verifications: readonly VerificationResult[]
}

interface AnchorFeedsResult {
  votingRoundId: bigint
  found: readonly AnchorFeedWithProof[]
  // Ids the host served nothing for. A first-class outcome, not an error.
  missing: readonly FeedId[]
}

interface VerificationResult {
  outcome: 'proven' | 'not_proven' | 'could_not_check'
  feedId: string
  name: string
  votingRoundId: number
  // The revert reason or transport error, verbatim.
  reason?: string
  // When the chain was asked, not when a surface rendered the answer.
  observedAt?: number
}`

export function UseAnchorProofDemo() {
  return (
    <Preview code={CODE} label="not run here">
      <CodeWindow
        filename="useAnchorProof — the type it returns"
        code={SHAPE}
        caption="This page does not run useAnchorProof. Its retrieval goes to the data availability host over the network and the host comes from the network registry, not from a parameter, so there is no mock to put behind it here. Nothing above is a captured return value — it is the type. ScalingProofDetail's page renders a retrieved proof from the 2026-08-04 run."
      />
    </Preview>
  )
}
