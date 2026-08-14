// packages/react-ui/src/RecoveryComposer.tsx
import type { MemoRecoveryKind, MemoRecoveryResult } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { CodeWindow } from './primitives/CodeWindow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import {
  RECOVERY_PATHS,
  SKIP_MEMO_WITHHELD,
  recoveryRefusalNote,
} from './recovery-composer-state.js'

/**
 * RecoveryComposer (M14-R11) — the five recovery opcodes as first-class operations.
 *
 * They exist because of one asymmetry: `executeDirectMinting` is atomic and the XRPL payment
 * is not. Any revert inside the dispatch unwinds the mint and the memo together while the XRP
 * stays settled at the Core Vault — unminted, unrefunded, and stuck until the user acts.
 *
 * Two properties this surface must hold, and both are protocol facts rather than design taste:
 *
 * - **The order is the caller's `memoRecoveryOrderFor`, rendered as given.** If the stuck
 *   payment never minted, `0xE0` comes first because it is the one that recovers the money;
 *   `0xE1` only tidies the nonce afterwards, and doing it first abandons the payment for good.
 *   This component never sorts, filters or promotes a path on its own.
 * - **NO PATH IS A CANCEL.** Every one of them is an XRPL payment that pays fees and mints a
 *   little FAsset. The panel says so once at the top, and each plan repeats it in its own
 *   notes, because this is the assumption a user brings and it is wrong.
 */

export interface RecoveryComposerProps {
  /**
   * From `memoRecoveryOrderFor`. Rendered in the order given — the ordering is a protocol
   * rule and this component is not entitled to a second opinion about it.
   */
  readonly order: readonly MemoRecoveryKind[]
  /**
   * The planner's verdict per path, for the inputs the host holds. A path with no entry is
   * shown with its description and no plan yet, which is the state before anything is typed.
   */
  readonly results?: Partial<Record<MemoRecoveryKind, MemoRecoveryResult>>
  readonly selected?: MemoRecoveryKind
  /**
   * Whether the stuck payment already minted. Only used to explain `0xE0`'s ABSENCE — the
   * order itself already reflects it, and an option that silently vanishes reads as a bug.
   */
  readonly stuckPaymentMinted?: boolean
  readonly onSelect?: (kind: MemoRecoveryKind) => void
  readonly onSign?: () => void
  readonly networkLabel?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function RecoveryComposer(props: RecoveryComposerProps) {
  const { order, results, selected } = props
  const chosen = selected && order.includes(selected) ? selected : undefined
  const result = chosen ? results?.[chosen] : undefined
  const plan = result?.ok ? result.plan : undefined
  const refusal = result && !result.ok ? recoveryRefusalNote(result.refusal.code, result.refusal.message) : undefined

  return (
    <Panel
      title="Recover a stuck payment"
      subtitle={chosen ? `${RECOVERY_PATHS[chosen].opcode} — ${RECOVERY_PATHS[chosen].title}` : undefined}
      aside={props.networkLabel ? <span className="fk-sa-net">{props.networkLabel}</span> : undefined}
      className={`fk-sa-recover${props.className ? ` ${props.className}` : ''}`}
      data-selected={chosen}
      {...(props.theme ? { theme: props.theme } : {})}
    >
      <Note tone="att" title="Every option here is a real payment">
        There is no free cancel on this flow. Each recovery below is an XRPL payment that pays
        ledger and minting fees and mints a small amount of FAsset — including the ones that
        recover nothing but a nonce.
      </Note>

      {/* Explaining the absence, not hiding it. */}
      {props.stuckPaymentMinted === true ? (
        <Note tone={SKIP_MEMO_WITHHELD.tone} title={SKIP_MEMO_WITHHELD.title}>
          {SKIP_MEMO_WITHHELD.body}
        </Note>
      ) : null}

      <ul className="fk-sa-recover-list" aria-label="Recovery paths, in the order to use them">
        {order.map((kind, index) => {
          const copy = RECOVERY_PATHS[kind]
          const isChosen = kind === chosen
          return (
            <li key={kind} className="fk-sa-recover-item">
              <button
                type="button"
                className="fk-sa-recover-path"
                aria-pressed={isChosen}
                data-opcode={copy.opcode}
                onClick={() => props.onSelect?.(kind)}
              >
                <span className="fk-sa-recover-head">
                  <span className="fk-mono fk-sa-recover-op">{copy.opcode}</span>
                  <span className="fk-sa-recover-title">{copy.title}</span>
                  {/* The first path is first for a reason, and the reason is worth stating. */}
                  {index === 0 ? <span className="fk-sa-recover-lead">try this first</span> : null}
                </span>
                <span className="fk-sa-recover-effect">{copy.effect}</span>
                <span className="fk-sa-recover-limit">{copy.limit}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {refusal ? (
        <Note tone={refusal.tone} title={refusal.title}>
          {refusal.body}
        </Note>
      ) : null}

      {plan ? (
        <>
          {/* The bytes in full: they ARE the recovery, and the lengths are exact — a memo one
              byte off is refused after the payment settles and is not recoverable. */}
          <CodeWindow filename={`recovery-${RECOVERY_PATHS[plan.kind].opcode.toLowerCase()}.hex`} code={plan.memo} />
          <ul className="fk-sa-recover-notes">
            {plan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={!plan} onClick={props.onSign}>
          {plan ? 'Sign the recovery payment' : chosen ? 'Cannot send this' : 'Choose a recovery'}
        </Button>
      </div>
    </Panel>
  )
}
