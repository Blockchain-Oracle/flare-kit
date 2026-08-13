import type { FamilyRow, PreparedRequest, SerializedError } from '@flare-kit/core'
import { evidence, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'

/**
 * FDC-02 — everything a person is agreeing to before a request is submitted.
 *
 * The rule this surface keeps: nothing is offered that cannot be paid for or
 * cannot produce a usable proof. A family the deployment does not price, a body
 * the verifier will reject, and a proof bound to an address that is not
 * connected are all refusals shown *here*, not reverts discovered after gas.
 *
 * The fee is always a read value with its asset and full precision, never a
 * placeholder — it is 1000 wei on Coston2 and 20 FLR on mainnet, so a rounded
 * or assumed number would be wrong on one of them.
 */

/** Each is a distinct rendered state, not one "blocked" wearing five hats. */
export type BlockReason =
  | 'none'
  | 'no-builder'
  | 'not-served'
  | 'owner-mismatch'
  | 'rejected'
  | 'not-prepared'
  | 'fee-unread'
  | 'fee-unavailable'

const BLOCK_SENTENCE: Record<Exclude<BlockReason, 'none' | 'rejected'>, string> = {
  'no-builder': 'This kit has no builder for this family.',
  'not-served': 'This deployment does not serve this family.',
  'owner-mismatch': 'The proof owner is not the connected account.',
  'not-prepared': 'The verifier has not canonicalised the request yet.',
  // Pending, and settled. A read still in flight and a deployment that refused
  // to price the request are different facts, and the button said the first
  // while the note above it said the second.
  'fee-unread': 'The fee has not been read yet.',
  'fee-unavailable': 'This deployment would not price the request.',
}

export interface AttestationRequestBuilderProps {
  row: FamilyRow
  /** Which of the family's sources this request targets. */
  sourceId: string
  /**
   * Present once the verifier has canonicalised the body. Core's own
   * `PreparedRequest`, not a copy of it — a second declaration of the same
   * shape is a second thing to keep in step with the client.
   */
  prepared?: PreparedRequest
  /** Read from `getRequestFee` for these exact bytes. Undefined until read. */
  fee?: { value: bigint; asset: string; decimals: number }
  /** Why the fee could not be read, when it could not. */
  feeUnavailableReason?: string
  /** Where a proof would be retrieved from, so the wait names its endpoint. */
  dataAvailabilityBaseUrl?: string
  /**
   * The wait as a range, in seconds. DESIGN.md asks a long wait to state a
   * range, and a single number would be wrong for almost every request: how
   * long you wait depends on where in the collecting round you landed.
   */
  expectedRangeSeconds?: { min: bigint; max: bigint }
  /** The round this request would land in, once it is submitted. */
  expectedRound?: bigint
  /** The address this request would bind the proof to, when the family binds one. */
  proofOwner?: string
  /** The connected account that would submit. */
  sender?: string
  /** A rejected body or a refused precondition. Rendered, never thrown. */
  error?: SerializedError
  submitting?: boolean
  onSubmit?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function AttestationRequestBuilder({
  row,
  sourceId,
  prepared,
  fee,
  feeUnavailableReason,
  dataAvailabilityBaseUrl,
  expectedRangeSeconds,
  expectedRound,
  proofOwner,
  sender,
  error,
  submitting = false,
  onSubmit,
  theme,
  className,
}: AttestationRequestBuilderProps) {
  const source = row.family.sources.coston2.find((entry) => entry.sourceId === sourceId)
  const ownerMismatch = Boolean(
    proofOwner && sender && proofOwner.toLowerCase() !== sender.toLowerCase(),
  )
  const noBuilder = !row.family.hasBuilder
  const notServed = row.status === 'unavailable' || row.status === 'deprecated'

  // Why the request cannot go, decided once. The button's disabled state, the
  // sentence under it and the attribute a test reads all come from this value,
  // so they cannot disagree — and each reason is a distinguishable state rather
  // than one "blocked" that differs only in prose.
  const block: BlockReason = noBuilder
    ? 'no-builder'
    : notServed
      ? 'not-served'
      : ownerMismatch
        ? 'owner-mismatch'
        : error
          ? 'rejected'
          : feeUnavailableReason
            ? 'fee-unavailable'
            : !prepared
              ? 'not-prepared'
              : fee === undefined
                ? 'fee-unread'
                : 'none'
  const blocked = block !== 'none'

  return (
    <div
      className={`fk fk-fdc-builder${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-blocked={blocked ? 'true' : 'false'}
      data-block={block}
    >
      <Panel title={row.family.name} subtitle={row.family.summary}>
        <Details>
          <DetailRow label="Attestation type" value={<span className="fk-mono">{row.family.name}</span>} />
          <DetailRow
            label="Source"
            value={<span className="fk-mono">{sourceId}</span>}
            {...(source ? { sub: `${source.chain}, via verifier group ${source.group}` } : {})}
          />
          {prepared ? (
            <DetailRow
              label="Request"
              value={
                <EvidenceChip
                  item={evidence({
                    kind: 'fdc_request',
                    label: 'Bytes',
                    value: prepared.abiEncodedRequest,
                    observedAt: 0,
                  })}
                />
              }
              sub={`${(prepared.abiEncodedRequest.length - 2) / 2} bytes, canonicalised by the verifier — priced and submitted exactly as shown.`}
            />
          ) : null}
          {prepared ? (
            <DetailRow
              label="Request hash"
              value={
                <EvidenceChip
                  item={evidence({
                    kind: 'fdc_request',
                    label: 'keccak256',
                    value: prepared.requestHash,
                    observedAt: 0,
                  })}
                />
              }
              sub="Compare this, not the bytes."
            />
          ) : null}
          <DetailRow
            label="Request fee"
            value={
              fee ? (
                formatExact(fee)
              ) : (
                <span className="fk-unread">Not read</span>
              )
            }
            sub={
              fee
                ? 'Read for these exact bytes, and sent unchanged.'
                : 'Read on chain, never assumed.'
            }
          />
          {prepared ? (
            <DetailRow
              label="Verifier"
              value={<span className="fk-mono fk-fdc-endpoint">{prepared.verifier}</span>}
            />
          ) : null}
          {dataAvailabilityBaseUrl ? (
            <DetailRow
              label="Proof provider"
              value={<span className="fk-mono fk-fdc-endpoint">{dataAvailabilityBaseUrl}</span>}
              sub="Where the proof is retrieved once the round finalizes."
            />
          ) : null}
          {expectedRound !== undefined ? (
            <DetailRow
              label="Expected round"
              value={<span className="fk-mono">{expectedRound.toString()}</span>}
              sub="The voting round this request would be collected in."
            />
          ) : null}
          {expectedRangeSeconds ? (
            <DetailRow
              label="Expected wait"
              value={
                <span className="fk-mono">
                  {expectedRangeSeconds.min.toString()}–{expectedRangeSeconds.max.toString()}s
                </span>
              }
              sub="The rest of the collecting round, plus one to finalize."
            />
          ) : null}
          {proofOwner ? (
            <DetailRow
              label="Proof owner"
              value={
                <EvidenceChip
                  item={evidence({
                    kind: 'recipient_address',
                    label: 'Bound to',
                    value: proofOwner,
                    observedAt: 0,
                  })}
                />
              }
              sub="Only this address can present the resulting proof."
            />
          ) : null}
          <DetailRow label="Consumed by" value={row.family.consumer} />
        </Details>
      </Panel>

      {noBuilder ? (
        <Note tone="info" title="No builder in this kit">
          The deployment serves {row.family.name}, and this kit ships no request
          builder for it. Nothing here is stubbed or simulated — the family is
          listed because it exists, not because it works.
        </Note>
      ) : null}

      {notServed ? (
        <Note tone="att" title="Not available on this deployment">
          {row.note ??
            row.family.deprecationNote ??
            `This deployment does not serve ${row.family.name}. A request could not be priced, so none can be submitted.`}
        </Note>
      ) : null}

      {feeUnavailableReason ? (
        <Note tone="att" title="The fee could not be read">
          {feeUnavailableReason} Nothing is submitted at a guessed price.
        </Note>
      ) : null}

      {ownerMismatch ? (
        <Note tone="bad" title="This proof would be bound to another address">
          The request binds <span className="fk-mono">{proofOwner}</span> as proof
          owner, and the connected account is <span className="fk-mono">{sender}</span>.
          Only the bound address can present the proof; submitting would spend the
          fee for a proof this account cannot use.
        </Note>
      ) : null}

      {error ? (
        <Note tone="bad" title="The request was not accepted">
          {error.message}
        </Note>
      ) : null}

      <div className="fk-fdc-actions">
        <Button
          variant="primary"
          disabled={blocked || submitting}
          onClick={onSubmit}
          {...(blocked ? { 'aria-describedby': 'fk-fdc-blocked' } : {})}
        >
          {submitting ? 'Submitting the request' : 'Submit the attestation request'}
        </Button>
        {block !== 'none' && block !== 'rejected' ? (
          <p id="fk-fdc-blocked" className="fk-fdc-blocked-why">
            {BLOCK_SENTENCE[block]}
          </p>
        ) : null}
      </div>
    </div>
  )
}
