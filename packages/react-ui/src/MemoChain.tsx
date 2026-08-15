// packages/react-ui/src/MemoChain.tsx
import type { MemoPlan } from '@flarekit-dev/core'
import { amount, formatExact } from '@flarekit-dev/core'
import type { ReactNode } from 'react'
import { CodeWindow } from './primitives/CodeWindow.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { ExplorerLink } from './primitives/ExplorerLink.js'
import { Note } from './primitives/Note.js'
import { memoWarningNote } from './memo-composer-state.js'

/**
 * The four legs approving a memo instruction commits you to (M14-R11).
 *
 * Split from the composer at the same seam `InstructionChain` sits on: this renders a PLAN —
 * what will happen, from the planner's own numbers — while the composer renders an OPERATION,
 * which is what actually happened. Keeping those apart is most of what this milestone is for.
 *
 * It reuses M13's leg vocabulary and CSS deliberately (`fk-sa-chain`, `fk-sa-leg`). The spine
 * is not new; what is new is what travels along it. Two legs say something M13's could not:
 *
 * - Leg 2 names the `proofOwner`. It is not a detail — binding the attestation to the relaying
 *   account is what turns "hope somebody's relayer picks this up" into a known outcome, and it
 *   is also what excludes every other submitter.
 * - Leg 3 states that a MINED transaction is not yet a mint. A rate-limited direct mint refunds
 *   and returns without reverting, so the receipt says success while nothing was minted.
 */

export interface MemoChainProps {
  readonly plan: MemoPlan
  /** The Core Vault's XRPL address. `undefined` until it is read — never a placeholder. */
  readonly xrplDestination?: string
  /**
   * The account that will request the attestation and relay it. `undefined` when the host has
   * no signer yet, which is a real state: the plan is still checkable without one.
   */
  readonly relayer?: string
  /**
   * REQUIRED, on the lesson `nativeSymbol` taught M13: a default here labels Coston2's
   * FTestXRP as mainnet's FXRP, on the one network this milestone writes to.
   */
  readonly fassetSymbol: string
  readonly fassetDecimals: number
  readonly nativeSymbol: string
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

const byteLength = (hex: string): number => (hex.length - 2) / 2

export function MemoChain(props: MemoChainProps) {
  const { plan, fassetSymbol, fassetDecimals, nativeSymbol } = props
  const fasset = (value: bigint) => formatExact(amount(value, fassetDecimals, fassetSymbol))
  const opcodeHex = `0x${plan.opcode.toString(16).toUpperCase()}`

  return (
    <div className="fk-sa-chain" aria-label="What approving this commits you to">
      <Leg index={1} title="You pay the Core Vault on the XRP Ledger">
        <Details>
          <DetailRow
            label="Destination"
            value={
              props.xrplDestination ? (
                <ExplorerLink value={props.xrplDestination} shorten="address" />
              ) : (
                <span className="fk-mono">—</span>
              )
            }
            sub={props.xrplDestination ? 'the Core Vault’s underlying address, read live' : 'not read yet'}
          />
          <DetailRow
            label="Amount"
            value={<span className="fk-mono">{fasset(plan.totalUBA)}</span>}
            sub="what the payment must deliver, before any fee"
          />
          <DetailRow
            label="Memo"
            value={<span className="fk-mono">{opcodeHex}</span>}
            sub={`${byteLength(plan.memo)} bytes · ${plan.executorData ? 'the operation committed to by hash' : 'the whole operation, inline'}`}
          />
        </Details>
        {/* The bytes in full. They ARE the instruction, and a truncated memo is one a user
            cannot check against what they meant to send. The window scrolls rather than
            wrapping, so no byte is lost to a line break. */}
        <CodeWindow filename={`memo-${opcodeHex.toLowerCase()}.hex`} code={plan.memo} />
        <Note tone="att" title="No destination tag">
          This payment must carry NO destination tag. A registered tag redirects the entire mint
          to the tag holder and discards the memo — and tag 0 is claimable like any other, so a
          wallet that defaults the field to zero pays a stranger.
        </Note>
      </Leg>

      <Leg index={2} title="The Flare Data Connector attests the payment">
        <Details>
          <DetailRow
            label="Attestation"
            value={<span className="fk-mono">XRPPayment</span>}
            sub="the only family that carries the raw memo bytes on chain"
          />
          <DetailRow
            label="Proof owner"
            value={
              props.relayer ? (
                <ExplorerLink value={props.relayer} shorten="address" />
              ) : (
                <span className="fk-mono">not bound yet</span>
              )
            }
            sub={
              props.relayer
                ? 'only this account will be able to submit the proof'
                : 'bound when the attestation is requested'
            }
          />
          <DetailRow
            label="Voting round"
            value={<span className="fk-mono">not assigned yet</span>}
            sub="fixed by the ledger close the payment lands in"
          />
        </Details>
      </Leg>

      <Leg index={3} title="This kit submits the mint itself">
        <Details>
          <DetailRow
            label="Call"
            value={
              <span className="fk-mono">
                {plan.executorData ? 'executeDirectMintingWithData' : 'executeDirectMinting'}
              </span>
            }
            sub="on the AssetManager — the kit never calls the controller on this path"
          />
          <DetailRow
            label="Attached value"
            value={<span className="fk-mono">{formatExact(amount(plan.attachValueWei, 18, nativeSymbol))}</span>}
            sub="carried as msg.value and forwarded to your operation’s calls"
          />
        </Details>
        <Note tone="info" title="A mined transaction is not yet a mint">
          If the protocol rate-limits the mint it refunds the value and returns WITHOUT
          reverting, so the receipt reads as success while nothing was minted and your
          instruction never ran. That is a wait with a known end, not a failure, and the same
          proof is submitted again — you are never asked to pay twice.
        </Note>
      </Leg>

      <Leg index={4} title="Your account runs the operation">
        <Details>
          <DetailRow
            label="Personal account"
            value={<ExplorerLink value={plan.personalAccount.address} shorten="address" />}
            sub={
              plan.personalAccount.deployed === true
                ? 'deployed'
                : plan.personalAccount.deployed === false
                  ? 'deployed on first use'
                  : 'deployment state unread'
            }
          />
          <DetailRow
            label="Minting fee"
            value={<span className="fk-mono">{fasset(plan.mintingFeeUBA)}</span>}
            sub="the protocol’s cut, to the fee receiver"
          />
          <DetailRow
            label="Relayer fee"
            value={<span className="fk-mono">{fasset(plan.memoExecutorFeeUBA)}</span>}
            sub="paid in FAsset out of the mint, not in native currency"
          />
          <DetailRow
            label="Credited to your account"
            value={<span className="fk-mono">{fasset(plan.creditedUBA)}</span>}
            sub="what is left once both fees are taken"
          />
        </Details>
      </Leg>

      {plan.warnings.map((warning) => {
        const note = memoWarningNote(warning)
        return (
          <Note key={warning.code} tone={note.tone} title={note.title}>
            {note.body}
          </Note>
        )
      })}
    </div>
  )
}
