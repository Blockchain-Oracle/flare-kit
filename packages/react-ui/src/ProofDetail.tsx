import type { AttestationProof, FamilyRow } from '@flarekit-dev/core'
import { decodeAttestationName, evidence } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { ProofHandoff } from './ProofHandoff.js'
import { ResponseFields, VerificationChip } from './ProofResponseFields.js'
import { ToneChip } from './primitives/StateChip.js'

/**
 * FDC-04 — the proof itself, and what may be done with it.
 *
 * Two rules govern this surface. First, **verification and consumption are
 * different facts**: three of the four families have no deployed consumer, and
 * a proof that verifies on chain but has nowhere to go must say exactly that
 * rather than offering an action that does not exist. Second, **every attested
 * value renders at full precision in the mono face** — the response carries
 * `uint64` fields whose whole point is that they survive intact, so a rounded
 * or abbreviated rendering here would hide the corruption the kit exists to
 * prevent.
 */

export interface ProofDetailProps {
  row: FamilyRow
  /**
   * Any family's proof. The response body is `object` rather than a mapped type
   * because this surface renders whatever fields the family attested without
   * knowing them — which is what lets one screen serve all four.
   */
  proof: AttestationProof<unknown, object>
  /** The chain's own boolean. Undefined until verification has run. */
  verified?: boolean
  /**
   * Whether the Relay still holds the merkle root for this proof's voting round
   * — **M4-R14's definition of `expired`**, which M3 declared unbuilt for want
   * of one.
   *
   * A proof carries no expiry of its own. But `FdcVerification` checks against
   * `Relay.merkleRoots`, and those roots are not kept forever — measured on
   * Coston2, protocol 200's root is set at round 1130919 and zero at 900000.
   * Once it is gone the proof can never be verified on chain again, by anyone:
   * permanent, observable, and distinct from all three verification outcomes.
   * `undefined` means nobody checked, which is not "still valid".
   */
  relayRootPresent?: boolean
  /**
   * The source this proof was attested from, when the caller knows it. Carries
   * the native unit an amount on that source is denominated in — without it an
   * `EVMTransaction` `value` renders as a bare integer rather than risking the
   * wrong ticker (M4-R14).
   */
  source?: { readonly nativeUnit?: { readonly asset: string; readonly decimals: number } }
  /** The address bound to the proof, when the family binds one. */
  proofOwner?: string
  /**
   * The proof owner's explorer page, when the host resolves one. Presentational
   * like `consumptionExplorerUrl`: this surface holds no chain id, so the host
   * builds the link (`accountExplorerLink`/`explorerAddressUrl`) and passes it.
   * Absent → the address degrades to copy-only, never a guessed URL.
   */
  proofOwnerExplorerUrl?: string
  /** The connected account, for the replay and ownership rules. */
  sender?: string
  /**
   * The ABI-ready struct, from the family module's `toProofStruct`. Supplied by
   * the caller because only it holds the family implementation; when present,
   * the handoff panel renders.
   */
  abiStruct?: unknown
  /** Set when this proof has already been consumed. */
  consumptionTxHash?: string
  consumptionExplorerUrl?: string
  /** Why a consumption attempt failed, when one did. */
  consumptionError?: string
  consuming?: boolean
  onConsume?: () => void
  onDownload?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function ProofDetail({
  row,
  proof,
  verified,
  relayRootPresent,
  source,
  proofOwner,
  proofOwnerExplorerUrl,
  sender,
  abiStruct,
  consumptionTxHash,
  consumptionExplorerUrl,
  consumptionError,
  consuming = false,
  onConsume,
  onDownload,
  theme,
  className,
}: ProofDetailProps) {
  // Verifier-only is a fact about the **family**, not about whether this caller
  // happened to pass a handler. Deriving it from `!onConsume` said "nothing
  // deployed consumes this" on any screen that simply had not wired the button —
  // including XRPPaymentNonexistence, which FAssets consumes through
  // `xrpRedemptionPaymentDefault` on the very AssetManager this kit already
  // mints and redeems against.
  // Expired is a property of the round's root, not of the proof's contents.
  const expired = relayRootPresent === false
  const verifierOnly = !row.family.hasDeployedConsumer
  const consumed = Boolean(consumptionTxHash)
  const ownerMismatch = Boolean(
    proofOwner && sender && proofOwner.toLowerCase() !== sender.toLowerCase(),
  )

  // A consumption that reverted is its own state. Without it in the shape, a
  // failed consumption is indistinguishable from a proof waiting to be
  // consumed, and the two would differ only by the colour of a note.
  return (
    <div
      className={`fk fk-fdc-proof${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-verified={verified === undefined ? 'unknown' : String(verified)}
      data-expired={relayRootPresent === undefined ? 'unknown' : String(expired)}
      data-consumed={consumed ? 'true' : 'false'}
      data-consumption={consumptionError ? 'failed' : consumed ? 'done' : 'none'}
    >
      <Panel
        title={row.family.name}
        subtitle={`Attested in voting round ${proof.data.votingRound}`}
        aside={
          expired ? (
            <ToneChip tone="att" glyph="unknown">
              Expired — root no longer held
            </ToneChip>
          ) : (
            <VerificationChip {...(verified === undefined ? {} : { verified })} />
          )
        }
      >
        <Details>
          <DetailRow
            label="Source"
            value={<span className="fk-mono">{decodeAttestationName(proof.data.sourceId)}</span>}
            /* The padded bytes32 is what the protocol carries; the name is what
               a person can check against the row they chose. Both, not one. */
            sub={proof.data.sourceId}
          />
          <DetailRow
            label="Voting round"
            value={
              <EvidenceChip
                item={evidence({
                  kind: 'fdc_round',
                  label: 'Round',
                  value: proof.data.votingRound.toString(),
                  observedAt: 0,
                })}
              />
            }
          />
          <DetailRow
            label="Lowest used timestamp"
            value={
              <span className="fk-mono fk-fdc-value">
                {proof.data.lowestUsedTimestamp.toString()}
              </span>
            }
            sub="Full precision. This field carries uint64 sentinels that a naive JSON parse corrupts."
          />
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
                    ...(proofOwnerExplorerUrl ? { href: proofOwnerExplorerUrl } : {}),
                  })}
                />
              }
              sub="Only this address can present the proof."
            />
          ) : (
            <DetailRow
              label="Proof owner"
              value="Not bound"
              sub="This family binds no owner; anyone may present the proof."
            />
          )}
          <DetailRow
            label="Merkle proof"
            value={
              <span className="fk-mono">
                {proof.merkleProof.length}{' '}
                {proof.merkleProof.length === 1 ? 'node' : 'nodes'}
              </span>
            }
          />
          {consumptionTxHash ? (
            <DetailRow
              label="Consumed by"
              value={
                <EvidenceChip
                  item={evidence({
                    kind: 'flare_tx',
                    label: 'Transaction',
                    value: consumptionTxHash,
                    observedAt: 0,
                    ...(consumptionExplorerUrl ? { href: consumptionExplorerUrl } : {}),
                  })}
                />
              }
              sub={row.family.consumer}
            />
          ) : null}
        </Details>
      </Panel>

      <Panel title="Attested response" subtitle="Every value as attested, at full precision.">
        <ResponseFields
          body={proof.data.responseBody}
          amounts={row.family.amountResponseFields}
          {...(source?.nativeUnit ? { sourceUnit: source.nativeUnit } : {})}
          sourceUnitFields={row.family.nativeUnitResponseFields ?? []}
        />
      </Panel>

      {/* An expiry is an end state, not a fault — `att`, never `bad`. Nothing
          failed and the proof was never wrong; the chain stopped keeping the
          root it would be checked against, for everyone at once. */}
      {expired ? (
        <Note tone="att" title="This proof can no longer be verified on chain">
          The Relay no longer holds the merkle root for voting round{' '}
          <span className="fk-mono">{proof.data.votingRound}</span>, and{' '}
          <span className="fk-mono">FdcVerification</span> checks against exactly that root. No
          account can verify it now or later. This is not a verdict on the attested value — what it
          said is still in the response above; it simply cannot be proven on chain any more.
        </Note>
      ) : null}

      {verified === false ? (
        <Note tone="bad" title="This proof did not verify">
          FdcVerification returned false on chain. A proof that does not verify
          cannot be consumed, and this is a fact about the proof rather than
          about the data it describes.
        </Note>
      ) : null}

      {consumed ? (
        <Note tone="ok" title="Already consumed">
          This proof has been used. Presenting it again would revert — that is
          not a second execution, it is the same one.{' '}
          {consumptionExplorerUrl ? (
            <a className="fk-linkish" href={consumptionExplorerUrl} rel="noreferrer" target="_blank">
              View the transaction
            </a>
          ) : null}
        </Note>
      ) : null}

      {consumptionError ? (
        <Note tone="bad" title="The consuming transaction failed">
          {consumptionError} The proof is unchanged and can be presented again.
        </Note>
      ) : null}

      {ownerMismatch && !consumed ? (
        <Note tone="att" title="This account cannot present this proof">
          The proof is bound to <span className="fk-mono">{proofOwner}</span>; the
          connected account is <span className="fk-mono">{sender}</span>.
          Presenting it from here reverts with OnlyProofOwner().
        </Note>
      ) : null}

      {verifierOnly ? (
        <Note tone="info" title="Verification only">
          {row.family.consumer} The proof above is real and verified on chain.
          Nothing deployed takes it because nothing deployed could know what it
          means — this is a declared end state, not a step that failed.
        </Note>
      ) : null}

      {!verifierOnly && !onConsume ? (
        <Note tone="info" title="Consumption is not wired up here">
          {/* Distinct from verifier-only on purpose: a consumer exists, this
              screen just does not offer it. Saying "verification only" here
              would understate what the protocol can already do. */}
          {row.family.consumer} This screen does not offer that step.
        </Note>
      ) : null}

      {/* The next step's inputs, for the families whose consumer is the
          integrator's own contract. Without this, verifier-only is a dead end. */}
      {abiStruct !== undefined ? <ProofHandoff row={row} abiStruct={abiStruct} /> : null}

      <div className="fk-fdc-actions">
        {onConsume ? (
          <Button
            variant="primary"
            disabled={consuming || consumed || verified !== true || ownerMismatch}
            onClick={onConsume}
          >
            {consuming ? 'Presenting the proof' : 'Consume the proof'}
          </Button>
        ) : null}
        {onDownload ? (
          <Button variant="ghost" icon="code" onClick={onDownload}>
            Download the proof
          </Button>
        ) : null}
      </div>
    </div>
  )
}
