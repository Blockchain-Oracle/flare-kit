// packages/react-ui/src/SmartAccountNetwork.tsx
import { accountExplorerLink, amount, formatExact } from '@flarekit-dev/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { ExplorerLink } from './primitives/ExplorerLink.js'
import { Note } from './primitives/Note.js'
import { ToneChip } from './primitives/StateChip.js'
import { unreadOr, xrpAmountLabel } from './instruction-visuals.js'
import {
  type SmartAccountNetworkView,
  deploymentFact,
  pinnedExecutorOf,
} from './smart-account-card-state.js'

/**
 * One network's column of the SmartAccountCard (SA-01) — the personal account as it stands
 * on this deployment, and the operator-mutable settings that govern it.
 *
 * It is its own file because the card renders one per network side by side, and the two
 * halves it draws are genuinely different subjects: what THIS XRPL address's account is, and
 * what the DEPLOYMENT is. Splitting also keeps both files clear of the 300-line cap, which
 * the card was one line from breaking.
 *
 * Nothing here is snapshotted anywhere: operator wallets, fees, the proof window, the vault
 * registry and the executor are settings an operator can change, and a plan built on a stale
 * copy would send a real payment to a retired destination.
 */

export function SmartAccountNetwork({ view }: { view: SmartAccountNetworkView }) {
  const { account, settings, networkLabel, nativeSymbol, deployment } = view
  const fact = deploymentFact(account)
  const link = account ? accountExplorerLink('evm', account.address, deployment.chainId) : undefined
  const executor = pinnedExecutorOf(account?.pinnedExecutor)

  return (
    <section className="fk-sa-net-col" data-network={networkLabel} data-deployment={fact.kind}>
      <div className="fk-sa-net-head">
        <span className="fk-sa-net-name">{networkLabel}</span>
        <ToneChip tone={fact.tone} glyph={fact.glyph}>
          {fact.word}
        </ToneChip>
      </div>
      <p className="fk-sa-net-detail">{fact.detail}</p>

      <Details aria-label={`Personal account on ${networkLabel}`}>
        <DetailRow
          label="Personal account"
          value={
            account ? (
              <ExplorerLink
                value={account.address}
                shorten="address"
                {...(link?.href ? { href: link.href } : {})}
              />
            ) : (
              '—'
            )
          }
        />
        <DetailRow
          label="Controller"
          value={<ExplorerLink value={deployment.masterAccountController} shorten="address" />}
          sub="MasterAccountController"
        />
        {/* An FAsset value keeps its `drops` noun: the controller never tells us the FAsset's
            symbol, so borrowing one would name a token we did not read. */}
        <DetailRow
          label="FAsset balance"
          value={<span className="fk-mono">{unreadOr(account?.fassetBalance, 'drops')}</span>}
        />
        <DetailRow
          label="Gas balance"
          value={
            <span className="fk-mono">
              {account?.nativeBalance === undefined
                ? '—'
                : formatExact(amount(account.nativeBalance, 18, nativeSymbol))}
            </span>
          }
        />
        <DetailRow label="Memo nonce" value={<span className="fk-mono">{unreadOr(account?.nonce)}</span>} />
        <DetailRow
          label="Pinned executor"
          value={
            executor.kind === 'unread' ? (
              '—'
            ) : executor.kind === 'none' ? (
              'None pinned'
            ) : (
              <ExplorerLink value={executor.address} shorten="address" />
            )
          }
        />
      </Details>

      <Details aria-label={`Deployment settings on ${networkLabel}`} className="fk-sa-settings">
        {/* Three outcomes, not two. `settings === undefined` is an unread controller (`—`);
            an EMPTY wallet list is a read that succeeded and found none, which is a
            deployment gap the planner already refuses by name — so it says so, exactly as
            the vault row below does. Rendering it as `—` told the user we could not look. */}
        <DetailRow
          label="Operator wallet"
          value={
            settings === undefined ? (
              '—'
            ) : settings.xrplProviderWallets.length === 0 ? (
              'None registered'
            ) : (
              settings.xrplProviderWallets.map((wallet) => (
                <span key={wallet} className="fk-sa-wallet">
                  <ExplorerLink value={wallet} shorten="address" />
                </span>
              ))
            )
          }
          sub={
            settings !== undefined && settings.xrplProviderWallets.length === 0
              ? 'no destination a payment could reach'
              : undefined
          }
        />
        <DetailRow label="FDC source" value={<span className="fk-mono">{settings?.sourceId ?? '—'}</span>} />
        <DetailRow
          label="Proof window"
          value={
            <span className="fk-mono">
              {settings ? `${settings.proofValidityDurationSeconds} seconds` : '—'}
            </span>
          }
          sub="from the XRPL block timestamp"
        />
        <DetailRow
          label="Default instruction fee"
          value={
            <span className="fk-mono">{settings ? `${settings.defaultInstructionFee} drops` : '—'}</span>
          }
          sub={settings ? `= ${xrpAmountLabel(settings.defaultInstructionFee, settings.sourceId)}` : undefined}
        />
        <DetailRow
          label="Default executor"
          value={
            settings?.defaultExecutor ? (
              <ExplorerLink value={settings.defaultExecutor.address} shorten="address" />
            ) : (
              '—'
            )
          }
          sub={
            settings?.defaultExecutor
              ? `fee ${formatExact(amount(settings.defaultExecutor.fee, 18, nativeSymbol))}`
              : undefined
          }
        />
        {/* `undefined` is an unread registry and `[]` is a controller that registers none.
            One renders `—`, the other says so in words; they are not the same answer. */}
        <DetailRow
          label="Registered vaults"
          value={
            <span className="fk-mono">
              {settings?.vaults === undefined
                ? '—'
                : settings.vaults.length === 0
                  ? 'None registered'
                  : settings.vaults.map((vault) => `${vault.vaultId} (${vault.vaultType})`).join(', ')}
            </span>
          }
        />
        <DetailRow
          label="Dispatch"
          value={settings?.paused === undefined ? '—' : settings.paused ? 'Paused' : 'Open'}
        />
      </Details>

      {!settings ? (
        <Note tone="att" title="The controller could not be read">
          Its operator wallets, fees and vaults are unknown on {networkLabel} — not absent. No
          plan can be built from a read that did not land.
        </Note>
      ) : null}
    </section>
  )
}
