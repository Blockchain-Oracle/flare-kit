import type { OperationRecord, RecoveryAction } from '@flarekit-dev/core'
import { availableActions, isTerminal } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { StateChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'

/**
 * What moved, what remains, and whether a recovery reuses the existing payment
 * or creates a new one.
 *
 * The rule this component exists to enforce: an action that would move new
 * value is never presented like an ordinary button. It is labelled as such, so
 * "retry" can never quietly mean "pay again".
 */

/**
 * The value classification, carried by every action whether or not its own
 * description mentions it. That guarantee is the point of this component: an
 * action's own copy can be wrong or missing, this line cannot.
 *
 * It does partly restate the description for actions whose copy already says
 * so ("It sends no further XRP." then "It sends no further funds."). That
 * redundancy is deliberate — this is the single most dangerous claim in the
 * product, and `timeline-states.test.tsx:89` pins both halves of the sentence
 * as a requirement, not as an accident of phrasing.
 */
function describe(action: RecoveryAction): string {
  return action.movesNewValue
    ? 'This creates a new payment. It is not a retry of the one you already made.'
    : 'This reuses the payment and proof you already made. It sends no further funds.'
}

/**
 * What to say while an operation is progressing with nothing for a person to do.
 *
 * Derived from the evidence rather than hardcoded, because "your payment is
 * recorded" is only true of an operation that made a payment. An attestation
 * request moves no funds, and this panel now serves both — reassuring somebody
 * about a payment they never made is the same class of untruth as rendering
 * `submitted` as `succeeded`.
 */
function idleSentence(operation: OperationRecord<unknown, unknown, unknown>): string {
  const paid = operation.evidence.some((item) => item.kind === 'xrpl_tx')
  return paid
    ? 'This operation is progressing on its own. Your payment is recorded and nothing is at risk while it completes.'
    : 'This operation is progressing on its own. Nothing has to be resubmitted, and nothing is at risk while it completes.'
}

export interface RecoveryPanelProps {
  /**
   * The clock, as data. It was `Date.now()` read during render, so an action
   * that became available at T never appeared until something else forced a
   * re-render — and no time-gated state could be reached in a test or a gallery
   * case. Every audited M3/M4 surface takes this.
   */
  nowMs?: number
  operation: OperationRecord<unknown, unknown, unknown>
  onAction?: (actionId: string) => void
  className?: string
}

export function RecoveryPanel({ operation, onAction, nowMs, className }: RecoveryPanelProps) {
  if (isTerminal(operation.state)) return null

  // `expired` is deliberately NOT in the canonical terminal set — an expired QUOTE is
  // re-quotable, and that decision is right for swaps and bridges. But it meant an expired
  // operation with no recovery actions fell through to the idle sentence below and said
  // "this operation is progressing on its own… nothing is at risk while it completes".
  // Nothing is progressing, and for M13's expired proof window the XRP is already the
  // operator's — the surface's own terminal copy is the only honest thing on screen, and
  // this panel must not contradict it. Found by looking at the rendered expiry state.
  if (operation.state === 'expired') return null

  const now = nowMs ?? Date.now()
  const all = operation.recovery ?? []
  const offered = availableActions(all, now)

  // No safe action is a real answer, not an empty state. Saying nothing here
  // would leave a user hunting for a button that should not exist.
  if (offered.length === 0) {
    // Three different absences, and they were one. `availableActions` filters on
    // blocked, not-yet-available AND past-expiry, but this only ever looked at
    // the first two — so a recovery whose window had CLOSED fell through to
    // "nothing is at risk while it completes". That is an affirmative safety
    // claim about a state the component never established, on the one surface
    // whose whole job is telling somebody what they can still do.
    const expiredAction = all.find(
      (action) => action.expiresAt !== undefined && action.expiresAt <= now,
    )
    const blockedAction = all.find((action) => action.blocked)
    const earlyAction = all.find(
      (action) => action.availableAt !== undefined && action.availableAt > now,
    )

    const [tone, title, body] = expiredAction
      ? ([
          'att',
          'The window for this has closed',
          `${expiredAction.label} is no longer available. It expired at `,
        ] as const)
      : blockedAction
        ? (['info', 'Nothing for you to do yet', blockedAction.blocked?.reason ?? ''] as const)
        : earlyAction
          ? (['info', 'Not yet', `${earlyAction.label} becomes available at `] as const)
          : (['info', 'Nothing for you to do yet', idleSentence(operation)] as const)

    const at = expiredAction?.expiresAt ?? (blockedAction ? undefined : earlyAction?.availableAt)

    return (
      <div className={`fk${className ? ` ${className}` : ''}`}>
        <Note tone={tone} title={title}>
          {body}
          {at === undefined ? null : <Timestamp ms={at} />}
          {expiredAction ? (
            <span className="fk-fdc-note">
              Nothing here says the operation failed, and nothing says your funds are gone — only
              that this particular recovery can no longer be taken. If you are unsure what remains,
              escalate rather than acting.
            </span>
          ) : null}
        </Note>
      </div>
    )
  }

  return (
    <div className={`fk${className ? ` ${className}` : ''}`}>
      {offered.map((action) => (
        <div key={action.id}>
          <Note
            id={`fk-recovery-${action.id}`}
            tone={action.movesNewValue ? 'att' : 'info'}
            title={action.label}
          >
            {action.effect} {describe(action)}

            {/* SH-06 requires preconditions, whether it signs or broadcasts, and
                the expected next state — all three already on `RecoveryAction`
                and none of them previously rendered. A recovery is the one place
                somebody needs to know exactly what pressing the button does
                before they press it. */}
            <Details className="fk-recovery-terms" aria-label={`${action.label} — what it does`}>
              {action.preconditions && action.preconditions.length > 0 ? (
                <DetailRow
                  label="Requires"
                  value={<span className="fk-recovery-pre">{action.preconditions.join('; ')}</span>}
                />
              ) : null}
              <DetailRow
                label="This action"
                value={
                  <span>
                    {action.signs ? 'asks you to sign' : 'needs no signature'}
                    {action.broadcasts ? ' and broadcasts a transaction' : ' and broadcasts nothing'}
                  </span>
                }
              />
              {action.nextState ? (
                <DetailRow
                  label="Then becomes"
                  value={<StateChip state={action.nextState} />}
                />
              ) : null}
              {action.expiresAt === undefined ? null : (
                <DetailRow label="Available until" value={<Timestamp ms={action.expiresAt} />} />
              )}
            </Details>
          </Note>
          <div className="fk-recovery-action">
            <Button
              variant={action.movesNewValue ? 'ghost' : 'primary'}
              block
              icon="retry"
              onClick={() => onAction?.(action.id)}
              /* Points at the visible note rather than a duplicate hidden copy.
                 The button's own label cannot carry the value-moving
                 distinction, and saying it twice reads it out twice. */
              aria-describedby={`fk-recovery-${action.id}`}
            >
              {action.label}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
