// packages/react-ui/src/SmartAccountCard.tsx
import type { ObservedInstruction } from '@flarekit-dev/core'
import { ExplorerLink } from './primitives/ExplorerLink.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { ToneChip } from './primitives/StateChip.js'
import { instructionIdHex } from './instruction-visuals.js'
import { SmartAccountNetwork } from './SmartAccountNetwork.js'
import { type SmartAccountNetworkView, addressParity } from './smart-account-card-state.js'

/**
 * SmartAccountCard (SA-01, M13-R10) — an IDENTITY surface, not an operation one.
 *
 * The account it describes is one the user has never touched and which may not exist: a
 * CREATE2 address derived from an XRPL address, possibly undeployed, possibly holding a
 * balance anyway. So it renders the XRPL controller, the personal account, deployed / not
 * deployed as a FIRST-CLASS fact, balances, memo nonce, pinned executor and the deployment's
 * own fee settings — for each network side by side, with the identical-address property
 * OBSERVED from the two reads rather than asserted beside them.
 *
 * Nothing here needs a key, an EVM account or a signature, which is the milestone's most
 * unusual property: a person holding only an XRPL address and only XRP can see everything on
 * this card. Mainnet is a READ LENS — its column reads exactly like Coston2's and carries no
 * affordance, because no write targets mainnet this milestone.
 *
 * Every unread value is `—`, never a zero, an empty list or a `false`. A genuinely observed
 * zero balance, zero nonce or zero-address executor renders as its real value; those are what
 * a blank-slate account actually holds.
 */

export type { SmartAccountNetworkView }

export interface SmartAccountCardProps {
  /** The XRPL address that controls the account. Not an EVM address, and not a signer. */
  readonly xrplOwner: string
  /** One or two networks. Two is what makes the identical-address property visible. */
  readonly networks: readonly SmartAccountNetworkView[]
  /**
   * The `InstructionExecuted` backfill, newest last. `[]` is a CONFIRMED-empty history;
   * omitting all three history props means no scan was asked for and none is drawn. A scan
   * that could not complete passes `historyError` instead — an incomplete scan must never
   * wear the shape of an empty one.
   */
  readonly history?: readonly ObservedInstruction[]
  readonly historyError?: string
  readonly historyLoading?: boolean
  readonly mockLabel?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

function History(props: SmartAccountCardProps) {
  const { history, historyError, historyLoading } = props
  if (!history && !historyError && !historyLoading) return null

  return (
    <div className="fk-sa-history" aria-label="Recent instructions">
      <span className="fk-sa-history-title">Recent instructions</span>
      {historyError ? (
        // NEVER an empty list: an incomplete scan rendered as "none" would be a claim about
        // the chain made from a read that failed.
        <Note tone="att" title="History unavailable">
          {historyError} This is not an empty history — the backfill scan could not be
          completed, so what this account has done is unknown.
        </Note>
      ) : historyLoading && !history ? (
        <p className="fk-sa-history-empty">Scanning back from the safe boundary…</p>
      ) : history && history.length === 0 ? (
        <p className="fk-sa-history-empty">
          The scan completed and found no instruction for this account in the window.
        </p>
      ) : (
        <ul className="fk-sa-history-list">
          {(history ?? []).map((item) => (
            <li key={item.transactionId} className="fk-sa-history-row">
              <span className="fk-mono fk-sa-history-id">
                {item.instructionId === undefined ? '—' : instructionIdHex(item.instructionId)}
              </span>
              {/* A reference the codec could not parse is still a real dispatch. The row keeps
                  its identifiers rather than vanishing from the history. */}
              <span className="fk-sa-history-action">{item.action ?? 'unrecognised instruction'}</span>
              <ExplorerLink value={item.transactionId} shorten="hash" className="fk-sa-history-tx" />
              {/* The Flare transaction that dispatched it — a different identifier from the
                  XRPL payment above, and the one a person needs to look the dispatch up.
                  The scan populates it; not rendering it left it unreachable. */}
              {item.transactionHash ? (
                <ExplorerLink value={item.transactionHash} shorten="hash" className="fk-sa-history-tx" />
              ) : null}
              <span className="fk-mono fk-sa-history-block">
                {item.blockNumber === undefined ? '—' : `block ${item.blockNumber}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SmartAccountCard(props: SmartAccountCardProps) {
  const { xrplOwner, networks, mockLabel, theme } = props
  const parity = addressParity(networks)

  return (
    <Panel
      title="XRPL-controlled account"
      subtitle={<span className="fk-mono fk-sa-owner">{xrplOwner}</span>}
      aside={mockLabel ? <ToneChip tone="att">{mockLabel}</ToneChip> : null}
      className={`fk-sa-card${props.className ? ` ${props.className}` : ''}`}
      data-parity={parity.kind}
      {...(theme ? { theme } : {})}
    >
      <p className="fk-sa-lede">
        This account is controlled by an XRP Ledger address. Reading it needs no Flare account,
        no wallet and no signature.
      </p>

      <div className="fk-sa-nets">
        {networks.map((view) => (
          <SmartAccountNetwork key={view.networkLabel} view={view} />
        ))}
      </div>

      {/* The identical-address property, SHOWN. Both columns print their own address above;
          this states what comparing them found, and says so when they cannot be compared. */}
      {parity.kind === 'identical' ? (
        <Note tone="ok" title="The same address on both networks">
          Both networks answered with <span className="fk-mono">{parity.address}</span>. The
          controller sits at one address everywhere, so an XRPL address derives the same
          personal account on each — read here, not asserted.
        </Note>
      ) : parity.kind === 'differs' ? (
        <Note tone="bad" title="The two networks disagree">
          The derived personal account differs across networks:{' '}
          <span className="fk-mono">{parity.addresses.join(' vs ')}</span>. Do not fund either
          address on this evidence.
        </Note>
      ) : (
        <Note tone="info" title="Addresses not compared">
          {parity.reason}
        </Note>
      )}

      <History {...props} />
    </Panel>
  )
}
