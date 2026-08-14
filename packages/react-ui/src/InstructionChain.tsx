// packages/react-ui/src/InstructionChain.tsx
import type { InstructionPlan } from '@flare-kit/core'
import { amount, formatExact } from '@flare-kit/core'
import type { ReactNode } from 'react'
import { Countdown } from './primitives/Countdown.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { ExplorerLink } from './primitives/ExplorerLink.js'
import { Note } from './primitives/Note.js'
import { formatInstant } from './primitives/Timestamp.js'
import { warningNote } from './instruction-composer-state.js'
import { denominatedValue, instructionIdHex, xrpAmountLabel } from './instruction-visuals.js'

/**
 * The four legs approving an instruction commits you to, drawn before anything is signed
 * (`R-SA-004`).
 *
 * Split from `InstructionComposer` at a real seam and not merely to clear the 300-line cap:
 * this component renders a PLAN — what will happen, from the planner's own numbers — while
 * the composer renders an OPERATION, which is what actually happened. The two are exactly the
 * pair this milestone spends its effort keeping apart, so they are not one file.
 *
 * The whole chain is shown because the XRPL payment leaves the wallet BEFORE anything on
 * Flare is knowable. Every other card in this kit plans a transaction that reverts harmlessly
 * when wrong; here a wrong instruction costs the payment and the only way forward is a new
 * one.
 */

export interface InstructionChainProps {
  readonly plan: InstructionPlan
  /** Host clock in ms — a prop, never `Date.now()`, so a screenshot is deterministic. */
  readonly now: number
  /**
   * When the proof stops being usable, in ms. `undefined` before the XRPL payment lands —
   * there is no block timestamp to measure from, and assuming one invents a deadline.
   */
  readonly proofDeadline?: number
  /** The FDC request fee in wei, read at request time. `—` until it is read. */
  readonly fdcRequestFee?: bigint
  readonly nativeSymbol: string
  /** Whether the operation is already dead — it changes the deadline to past tense. */
  readonly expired: boolean
}

function Leg({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <section className="fk-sa-leg" data-leg={index}>
      <div className="fk-sa-leg-head">
        <span className="fk-mono fk-sa-leg-index">{index}</span>
        <span className="fk-sa-leg-title">{title}</span>
      </div>
      {children}
    </section>
  )
}

export function InstructionChain(props: InstructionChainProps) {
  const { plan, now, expired, nativeSymbol } = props

  return (
    <div className="fk-sa-chain" aria-label="What approving this commits you to">
      <Leg index={1} title="You pay the operator on the XRP Ledger">
        <Details>
          <DetailRow
            label="Destination"
            value={<ExplorerLink value={plan.destination} shorten="address" />}
            sub="a registered operator wallet, read live"
          />
          <DetailRow
            label="Amount"
            value={<span className="fk-mono">{plan.amountDrops} drops</span>}
            sub={`= ${xrpAmountLabel(plan.amountDrops, plan.sourceId)}`}
          />
          <DetailRow
            label="Instruction fee"
            value={<span className="fk-mono">{plan.feeDrops} drops</span>}
            sub="read from the controller, never defaulted"
          />
          {/* The 32 bytes in full: they ARE the instruction, and a truncated memo is one a
              user cannot check against what they intended to send. */}
          <DetailRow
            label="Memo (32 bytes)"
            value={<span className="fk-mono fk-sa-reference">{plan.reference}</span>}
            sub={`${instructionIdHex(plan.intent.instructionId)} · ${denominatedValue(plan.intent.value, plan.row.instruction.denomination)}`}
          />
        </Details>
        <Note tone="att" title="No destination tag">
          This payment must carry NO destination tag. The controller resolves your account
          from the payment’s source address, and a tagged payment is treated as an exchange
          deposit and never reaches an instruction.
        </Note>
      </Leg>

      <Leg index={2} title="The Flare Data Connector attests the payment">
        <Details>
          <DetailRow label="Source" value={<span className="fk-mono">{plan.sourceId}</span>} />
          <DetailRow
            label="Request fee"
            value={
              <span className="fk-mono">
                {props.fdcRequestFee === undefined
                  ? '—'
                  : formatExact(amount(props.fdcRequestFee, 18, nativeSymbol))}
              </span>
            }
            sub="paid on Flare when the attestation is requested"
          />
          {/* The round is assigned by the ledger close, so it cannot be quoted at plan
              time. Naming it as not-yet-assigned beats printing a number we would be
              guessing. */}
          <DetailRow
            label="Voting round"
            value={<span className="fk-mono">not assigned yet</span>}
            sub="fixed by the ledger close the payment lands in"
          />
        </Details>
      </Leg>

      <Leg index={3} title="Anyone submits executeInstruction">
        <Details>
          <DetailRow
            label="Dispatch value"
            value={
              <span className="fk-mono">{formatExact(amount(plan.dispatchValueWei, 18, nativeSymbol))}</span>
            }
            sub="carried as msg.value; a redeem must cover the executor fee"
          />
          <DetailRow
            label="Personal account"
            value={<ExplorerLink value={plan.personalAccount.address} shorten="address" />}
            sub={plan.personalAccount.deployed === true ? 'deployed' : plan.personalAccount.deployed === false ? 'deployed by CREATE2 on this instruction' : 'deployment state unread'}
          />
        </Details>
        <Note tone="info" title="Dispatch is permissionless">
          Once your payment is attested, any indexer that sees it may submit the proof. The
          instruction can execute without this kit sending anything — that is the protocol,
          not a fallback.
        </Note>
      </Leg>

      <Leg index={4} title="Your account acts on Flare">
        <p className="fk-sa-downstream">{plan.downstream}</p>
      </Leg>

      <div className="fk-sa-deadline">
        {props.proofDeadline === undefined ? (
          <Note tone="info" title="The proof window starts when the payment lands">
            The proof stays usable for{' '}
            <span className="fk-mono">{plan.proofWindowSeconds} seconds</span> measured from
            the XRPL block timestamp. There is no deadline to show yet, because the payment
            has not been in a ledger.
          </Note>
        ) : expired ? (
          // NO countdown on a dead operation. `Countdown` clamps to the word "Ready" at
          // zero — written for a matured withdrawal, and on an expired proof it reads as
          // "ready to proceed" beside copy saying the opposite. Past tense, instant only.
          <Note tone="att" title="The proof expired">
            It stopped being usable at{' '}
            <span className="fk-mono">{formatInstant(props.proofDeadline)} UTC</span>. The
            controller refuses it from that instant on.
          </Note>
        ) : (
          <Note tone="att" title="The proof expires">
            Usable until{' '}
            <span className="fk-mono">{formatInstant(props.proofDeadline)} UTC</span>.{' '}
            <Countdown
              targetUnix={Math.floor(props.proofDeadline / 1000)}
              now={Math.floor(now / 1000)}
              label="Time left"
            />{' '}
            After that the controller refuses the proof forever and the payment is spent.
          </Note>
        )}
      </div>

      {plan.warnings.map((warning) => {
        const note = warningNote(warning)
        return (
          <Note key={warning.code} tone={note.tone} title={note.title}>
            {note.body}
          </Note>
        )
      })}
    </div>
  )
}
