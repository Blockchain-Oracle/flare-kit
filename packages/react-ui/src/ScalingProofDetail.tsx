import type { AnchorFeedWithProof, Observation, VerificationResult } from '@flare-kit/core'
import { amount, evidence, formatExact, isObserved, quoteAssetOf } from '@flare-kit/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'
import {
  PROOF_AVAILABILITY_VISUAL,
  type ProofAvailability,
  VERIFICATION_VISUAL,
} from './ftso-visuals.js'

/**
 * FTSO-03 — retrieve a scaling-feed proof and check it on chain, separately
 * from reading the value.
 *
 * Two independent questions, asked in order, and the surface keeps them apart:
 * *did the proof arrive* and *does the chain accept it*. Answering the first
 * with "no" is not an answer to the second.
 *
 * The verification is three-valued and stays that way.
 * `FtsoV2.verifyFeedData` **reverts** on a bad proof rather than returning
 * false — a value off by one, a shifted round, a truncated proof and an empty
 * proof array all revert `merkle proof invalid` on Coston2. Catching that and
 * coercing it to false would put "this is not proven" on screen when the truth
 * is "we could not check this", which is an unknown rendered as a negative fact.
 * `FdcVerification.verifyEVMTransaction` on the same chain does return false, so
 * the two protocols cannot share a boolean and do not share one here.
 */

export interface ScalingProofDetailProps {
  /** Which feed and which round this is about, whatever the outcome. */
  feedName: string
  votingRoundId: bigint
  /**
   * How the retrieval went, classified by the caller against the Relay's root.
   * Omitted while `loading`: every member asserts a terminal answer, and
   * `pending` in particular claims the round is finalized — a fact about the
   * chain, not about a request still in flight.
   */
  availability?: ProofAvailability
  /** The read is still running. Nothing is asserted about the round yet. */
  loading?: boolean
  /** Present exactly when `availability` is `retrieved`, with its provenance. */
  anchor?: Observation<AnchorFeedWithProof>
  /** Present once the chain has been asked. Absent means nobody asked. */
  verification?: VerificationResult
  /** Why the proof did not arrive, in the host's or the transport's own words. */
  reason?: string
  now: number
  onRetry?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function ScalingProofDetail({
  feedName,
  votingRoundId,
  availability,
  loading = false,
  anchor,
  verification,
  reason,
  now,
  onRetry,
  theme,
  className,
}: ScalingProofDetailProps) {
  const retrieval = availability ? PROOF_AVAILABILITY_VISUAL[availability] : undefined
  const anchored = anchor && isObserved(anchor) ? anchor.value : undefined
  const price = anchored
    ? amount(BigInt(anchored.body.value), anchored.body.decimals, quoteAssetOf(anchored.name))
    : undefined

  return (
    <Panel
      title="Scaling-feed proof"
      subtitle={
        <>
          <span className="fk-mono">{feedName}</span> · voting round{' '}
          <span className="fk-mono">{votingRoundId.toString()}</span>
        </>
      }
      aside={
        retrieval ? (
          <ToneChip tone={retrieval.tone} glyph={retrieval.glyph}>
            {retrieval.word}
          </ToneChip>
        ) : (
          <ToneChip tone="neutral" glyph="working">
            Retrieving
          </ToneChip>
        )
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
    >
      {loading ? (
        <div className="fk-ftso-proof" aria-busy="true">
          <span className="fk-sr" role="status">
            Retrieving the proof
          </span>
          <span className="fk-skeleton" />
          <span className="fk-skeleton" />
        </div>
      ) : null}

      <Details aria-label="Proof">
        <DetailRow
          label="Committed value"
          value={
            price ? (
              <span className="fk-ftso-value">{formatExact(price)}</span>
            ) : (
              <span className="fk-unread">no value retrieved</span>
            )
          }
          {...(anchored
            ? {
                sub: (
                  <>
                    <span className="fk-mono">{anchored.body.decimals}</span> decimals,{' '}
                    <span className="fk-mono">{anchored.body.turnoutBIPS}</span> BIPS turnout
                  </>
                ),
              }
            : {})}
        />
        {anchor ? (
          <DetailRow
            label="Proof provider"
            value={<SourceChip observation={anchor} now={now} />}
            sub="Serves the leaves; the Relay publishes the root they hash to. Two different sources, and only the second is on chain."
          />
        ) : null}
        {/* Only once the chain has actually been asked. Rendered
            unconditionally these two said "verified against FtsoV2" and
            "checked at <now>" on a surface where nothing had been checked and
            no verdict existed — an unasked question shown as a completed one,
            with the render clock standing in for a measurement. The time comes
            from the verification's own `observedAt`, never from this render. */}
        {verification ? (
          <DetailRow
            label="Verified against"
            value={<span className="fk-mono">FtsoV2.verifyFeedData</span>}
            sub="Protocol 100 on the same Relay the Data Connector uses at 200. The two finalize independently."
          />
        ) : null}
        {verification?.observedAt === undefined ? null : (
          <DetailRow label="Checked at" value={<Timestamp ms={verification.observedAt} />} />
        )}
      </Details>

      {anchored ? (
        <div className="fk-ftso-proof">
          <span className="fk-ftso-claim-head">
            Proof nodes (<span className="fk-mono">{anchored.proof.length}</span>)
          </span>
          {anchored.proof.length === 0 ? (
            // A real and legitimate shape: a round with one leaf needs no
            // siblings. It is not a truncated proof, and it verifies.
            <span className="fk-fdc-note">
              None. This round's tree has a single leaf, so the root is the leaf and there are no
              siblings to supply.
            </span>
          ) : (
            anchored.proof.map((node) => (
              <EvidenceChip
                key={node}
                item={evidence({
                  kind: 'ftso_proof',
                  label: 'node',
                  value: node,
                  observedAt: now,
                })}
              />
            ))
          )}
        </div>
      ) : null}

      {availability === 'pending' ? (
        <Note tone="info" title="The round is finalized; the host has not indexed it yet">
          The Relay publishing a root does not mean the leaves are fetchable — the data-availability
          layer indexes a round minutes later. This is a wait, not an absence, and a single missing
          answer is never grounds for concluding there is no proof.
          {onRetry ? (
            <button type="button" className="fk-linkish" onClick={onRetry}>
              Ask again
            </button>
          ) : null}
        </Note>
      ) : null}

      {availability === 'unavailable' ? (
        <Note tone="att" title="The host served no proof for this round">
          {reason ?? 'It answered, and it had nothing for this feed in this round.'} Whether the
          round was finalized on chain is a separate question, answered by the Relay rather than by
          the host.
        </Note>
      ) : null}

      {availability === 'could_not_ask' ? (
        <Note tone="att" title="The host could not be reached">
          {reason ?? 'The request did not complete.'} Silence from a provider says nothing about the
          round, so nothing above is presented as an answer.
          {onRetry ? (
            <button type="button" className="fk-linkish" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </Note>
      ) : null}

      {verification ? (
        <div className="fk-ftso-verdict" data-outcome={verification.outcome}>
          <ToneChip
            tone={VERIFICATION_VISUAL[verification.outcome].tone}
            glyph={VERIFICATION_VISUAL[verification.outcome].glyph}
          >
            {VERIFICATION_VISUAL[verification.outcome].word}
          </ToneChip>
          {verification.reason ? (
            <span className="fk-mono fk-fdc-value">{verification.reason}</span>
          ) : null}
        </div>
      ) : anchored ? (
        <Note tone="info" title="Not yet checked on chain">
          The proof is here. Nothing has asked <span className="fk-mono">FtsoV2</span> whether it
          matches the round's published root, so no verdict is shown.
        </Note>
      ) : null}

      {verification?.outcome === 'could_not_check' ? (
        <Note tone="att" title="This is not a failed proof">
          The check itself did not complete, so the value is neither proven nor disproven.
          <span className="fk-mono"> verifyFeedData</span> reverts on a bad proof instead of
          returning false, so a revert here means the call could not answer — read the reason above
          before concluding anything about the value.
        </Note>
      ) : null}

      {verification?.outcome === 'not_proven' ? (
        <Note tone="bad" title="The chain returned a definite no">
          <span className="fk-mono">verifyFeedData</span> returned false rather than reverting. That
          is a genuine negative and it is rare on this path: this value is not in the round's
          published root.
        </Note>
      ) : null}
    </Panel>
  )
}
