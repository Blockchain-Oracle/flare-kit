import {
  type AccountContext,
  type BindingMismatch,
  type ChainFamily,
  type OperationBinding,
  checkBinding,
  describeMismatch,
} from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { Note } from './primitives/Note.js'

/**
 * SH-03 — repair a wrong chain, a wrong account or an expired session.
 *
 * This is the only surface that knows what a mismatch *invalidated*, which is
 * why wrong-network and wrong-account leave `AccountSheet` and arrive here.
 * R-WALLET-008: an approved action is bound to the account and chain it was
 * approved for, and drift invalidates it rather than silently re-pointing it —
 * so the sheet always shows required against current, never just "wrong".
 */

/** The states that are not derivable from the binding itself. */
export type ResolutionStatus = 'switch-rejected' | 'unsupported-combination' | 'expired'

const FAMILY_NAME: Record<ChainFamily, string> = { evm: 'Flare', xrpl: 'XRP Ledger' }

const HEADING: Record<BindingMismatch['kind'], string> = {
  network: 'Your wallet is on a different network',
  account: 'A different account is connected',
  absent: 'That account is no longer connected',
  unsettled: 'This session has not been re-authorized',
}

function Pair({ mismatch }: { mismatch: BindingMismatch }) {
  const isNetwork = mismatch.kind === 'network'
  return (
    <div className="fk-resolve-pair">
      <span className="fk-resolve-k">Required</span>
      <span className="fk-resolve-v">{mismatch.expected}</span>
      <span className="fk-resolve-k">Current</span>
      <span className="fk-resolve-v">{mismatch.actual ?? 'Nothing connected'}</span>
      {isNetwork && mismatch.account ? (
        <>
          <span className="fk-resolve-k">Account</span>
          <span className="fk-resolve-v">{mismatch.account}</span>
        </>
      ) : null}
    </div>
  )
}

export interface NetworkResolutionSheetProps {
  /** What the action was approved for. */
  binding: OperationBinding
  /** What is connected now. */
  context: AccountContext
  /**
   * What the mismatch invalidated, named — "your quote for 25.000000 XRP".
   * Required visible data for SH-03: a person cannot judge the cost of
   * re-approving without knowing what they are re-approving.
   */
  affected?: string
  status?: ResolutionStatus
  onSwitchNetwork?: (family: ChainFamily) => void
  onReconnect?: (family: ChainFamily) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function NetworkResolutionSheet({
  binding,
  context,
  affected,
  status,
  onSwitchNetwork,
  onReconnect,
  theme,
  className,
}: NetworkResolutionSheetProps) {
  const { valid, mismatches } = checkBinding(binding, context)

  return (
    <div
      className={`fk fk-resolve${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {status === 'expired' ? (
        <Note tone="att" title="This approval has expired">
          The terms you approved are no longer current. Nothing was sent. Quote again to see what
          the same request costs now.
        </Note>
      ) : null}

      {status === 'unsupported-combination' ? (
        <Note tone="att" title="This pairing is not supported">
          {/* Named, not a shrug: a person needs to know whether to change the
              wallet or abandon the operation. */}
          This kit does not support the network and account combination that is connected. Nothing
          was sent.
        </Note>
      ) : null}

      {status === 'switch-rejected' ? (
        <Note tone="att" title="The switch was declined">
          Your wallet declined the network switch. Nothing was sent and nothing changed. You can
          switch it in the wallet directly and come back.
        </Note>
      ) : null}

      {valid && !status ? (
        <Note tone="ok" title="Nothing to resolve">
          The accounts this was approved for are the accounts connected now.
        </Note>
      ) : null}

      {mismatches.map((mismatch) => (
        <section key={`${mismatch.family}-${mismatch.kind}`} className="fk-resolve-block">
          <Note tone="att" title={HEADING[mismatch.kind]}>
            {describeMismatch(mismatch)}
            {affected ? ` This invalidates ${affected}, which was bound to it.` : ''} Nothing was
            sent.
          </Note>

          <Pair mismatch={mismatch} />

          <div className="fk-resolve-actions">
            {mismatch.kind === 'network' && onSwitchNetwork ? (
              <Button size="sm" icon="globe" onClick={() => onSwitchNetwork(mismatch.family)}>
                Switch to {mismatch.expected}
              </Button>
            ) : null}
            {mismatch.kind !== 'network' && onReconnect ? (
              <Button size="sm" icon="plugs" onClick={() => onReconnect(mismatch.family)}>
                Reconnect {FAMILY_NAME[mismatch.family]}
              </Button>
            ) : null}
          </div>
        </section>
      ))}

      {mismatches.length > 0 ? (
        <p className="fk-resolve-foot">
          {/* R-WALLET-008 in one sentence, where the person is looking. */}
          An approved action never follows your wallet to a different account. Re-approving is the
          only way forward, and it will show you the current terms first.
        </p>
      ) : null}
    </div>
  )
}
