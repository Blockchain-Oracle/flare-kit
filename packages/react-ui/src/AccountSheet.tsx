import {
  type AccountContext,
  type ChainFamily,
  type ChainIdentity,
  type ConnectionStatus,
  type CustodyClass,
  accountExplorerLink,
  cannotSignReason,
  canSign,
} from '@flarekit-dev/core'
import { useState } from 'react'
import { Button } from './primitives/Button.js'
import { CopyButton } from './primitives/CopyButton.js'
import { ExplorerLink } from './primitives/ExplorerLink.js'
import { NetworkLogo } from './primitives/NetworkLogo.js'
import { Note } from './primitives/Note.js'
import { ToneChip } from './primitives/StateChip.js'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * SH-02 — connect an EVM account, an XRPL account, or both, or supply an
 * explicitly read-only identity, without leaving the operation.
 *
 * Replaces `ConnectButton`, which was this surface at six states rather than
 * ten (see `.thoughts/decisions/2026-08-04-m2-open-questions.md`). Wrong
 * network and wrong account are *not* repaired here — they belong to
 * `NetworkResolutionSheet` (SH-03), which is the surface the map assigns them
 * to and the only one that knows what the mismatch invalidated.
 *
 * Custody is stated, never implied by an icon. R-WALLET-002 exists because a
 * person cannot reason about what they can recover without knowing who holds
 * the keys.
 */

const STATUS: Record<ConnectionStatus, { glyph: Glyph; tone: Tone; word: string }> = {
  disconnected: { glyph: 'unknown', tone: 'neutral', word: 'Not connected' },
  unavailable: { glyph: 'unknown', tone: 'att', word: 'No wallet found' },
  connecting: { glyph: 'working', tone: 'primary', word: 'Connecting' },
  rejected: { glyph: 'action', tone: 'att', word: 'Request declined' },
  'invalid-identity': { glyph: 'action', tone: 'att', word: 'Not recognised' },
  'wrong-network': { glyph: 'action', tone: 'att', word: 'Wrong network' },
  'account-changed': { glyph: 'action', tone: 'att', word: 'Account changed' },
  restored: { glyph: 'waiting', tone: 'primary', word: 'Restored session' },
  ready: { glyph: 'done', tone: 'ok', word: 'Connected' },
}

const CUSTODY_WORD: Record<CustodyClass, string> = {
  'external-wallet': 'Your wallet holds the key',
  'read-only': 'Read only — no key',
  'agent-key': 'An agent key signs for you',
}

const FAMILY_NAME: Record<ChainFamily, string> = { evm: 'Flare', xrpl: 'XRP Ledger' }

function AccountRow({
  identity,
  onConnect,
  onSupplyReadOnly,
}: {
  identity: ChainIdentity
  onConnect?: () => void
  onSupplyReadOnly?: (input: string) => void
}) {
  const [watching, setWatching] = useState(false)
  const [typed, setTyped] = useState('')
  /**
   * A read-only identity is connected, but it cannot sign — so it does not get
   * the same chip as a wallet that can. Custody is also stated in words below;
   * this is the shape half of it, because R11 requires status be carried by
   * shape as well as colour, and "connected" covering both hid the one
   * difference that matters.
   */
  const visual: { glyph: Glyph; tone: Tone; word: string } =
    identity.status === 'ready' && identity.custody === 'read-only'
      ? { glyph: 'waiting', tone: 'primary', word: 'Read only' }
      : STATUS[identity.status]
  const chain = FAMILY_NAME[identity.family]
  // Testnet draws a secondary ring on the mark; the network name is the authority.
  const testnet = /coston|testnet|devnet|sepolia/i.test(identity.network?.name ?? '')
  // The address links to its explorer where one exists — the EVM leg — and
  // stays copy-only for the XRP Ledger identity, which carries no chain id.
  const addressLink = identity.address
    ? accountExplorerLink(identity.family, identity.address, identity.network?.chainId)
    : undefined

  /**
   * Connecting is offered only where connecting is actually the remedy. A
   * wallet on the wrong network, or one that switched account, is already
   * connected — a "Connect" button there tells a person to do the one thing
   * that will not help. Those two are repaired in `NetworkResolutionSheet`,
   * which is the surface that knows what the drift invalidated.
   */
  const connectable =
    identity.status === 'disconnected' ||
    identity.status === 'unavailable' ||
    identity.status === 'rejected' ||
    identity.status === 'invalid-identity' ||
    identity.status === 'restored'

  return (
    <div className="fk-account" data-status={identity.status} data-family={identity.family}>
      <div className="fk-account-head">
        <span className="fk-account-chain">
          <NetworkLogo family={identity.family} size={18} testnet={testnet} />
          {chain}
        </span>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
      </div>

      {identity.address ? (
        <span className="fk-account-id-row">
          <ExplorerLink
            value={identity.address}
            shorten="address"
            className="fk-account-id"
            {...(addressLink?.href ? { href: addressLink.href } : {})}
          />
          <CopyButton value={identity.address} label="address" />
        </span>
      ) : null}

      {identity.network ? <span className="fk-account-network">{identity.network.name}</span> : null}

      {/* Never implied by an icon alone. */}
      {identity.custody ? (
        <span className="fk-account-custody">{CUSTODY_WORD[identity.custody]}</span>
      ) : null}

      {identity.reason ? <span className="fk-account-reason">{identity.reason}</span> : null}

      {identity.status === 'ready' ? null : (
        <div className="fk-account-actions">
          {connectable || identity.status === 'connecting' ? (
            <Button
              size="sm"
              variant="ghost"
              icon="plugs"
              onClick={onConnect}
              disabled={identity.status === 'connecting' || identity.status === 'unavailable'}
            >
              {identity.status === 'connecting'
                ? 'Connecting'
                : identity.status === 'restored'
                  ? `Re-authorize ${chain}`
                  : `Connect ${chain}`}
            </Button>
          ) : null}
          {onSupplyReadOnly ? (
            <Button size="sm" variant="ghost" icon="eye" onClick={() => setWatching((v) => !v)}>
              {watching ? 'Cancel' : 'Watch an address'}
            </Button>
          ) : null}
        </div>
      )}

      {watching && onSupplyReadOnly ? (
        <div className="fk-account-watch">
          <label className="fk-account-watch-label" htmlFor={`fk-ro-${identity.family}`}>
            {chain} address to watch
          </label>
          <input
            id={`fk-ro-${identity.family}`}
            className="fk-input"
            value={typed}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            {...(identity.status === 'invalid-identity'
              ? { 'aria-describedby': `fk-ro-err-${identity.family}`, 'aria-invalid': true }
              : {})}
          />
          <Button size="sm" onClick={() => onSupplyReadOnly(typed)}>
            Watch
          </Button>
          {identity.status === 'invalid-identity' ? (
            <span className="fk-account-reason" id={`fk-ro-err-${identity.family}`} role="alert">
              {identity.reason}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export interface AccountSheetProps {
  context: AccountContext
  onConnectEvm?: () => void
  onConnectXrpl?: () => void
  onSupplyReadOnly?: (family: ChainFamily, input: string) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function AccountSheet({
  context,
  onConnectEvm,
  onConnectXrpl,
  onSupplyReadOnly,
  theme,
  className,
}: AccountSheetProps) {
  const identities = [context.evm, context.xrpl]
  const bothConnected = identities.every((identity) => identity.status === 'ready')
  const needsResolution = identities.some(
    (identity) => identity.status === 'wrong-network' || identity.status === 'account-changed',
  )
  const restored = identities.some((identity) => identity.status === 'restored')
  const unavailable = identities.filter((identity) => identity.status === 'unavailable')
  const rejected = identities.some((identity) => identity.status === 'rejected')
  const cannotSign = identities.filter(
    (identity) => identity.address !== undefined && !canSign(identity),
  )

  return (
    <div
      className={`fk fk-sheet${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      <div className="fk-accounts">
        <AccountRow
          identity={context.evm}
          {...(onConnectEvm ? { onConnect: onConnectEvm } : {})}
          {...(onSupplyReadOnly
            ? { onSupplyReadOnly: (input: string) => onSupplyReadOnly('evm', input) }
            : {})}
        />
        <AccountRow
          identity={context.xrpl}
          {...(onConnectXrpl ? { onConnect: onConnectXrpl } : {})}
          {...(onSupplyReadOnly
            ? { onSupplyReadOnly: (input: string) => onSupplyReadOnly('xrpl', input) }
            : {})}
        />
      </div>

      <p className="fk-sr" role="status">
        {bothConnected
          ? 'Both accounts are connected.'
          : 'A Flare account and an XRP Ledger account can be connected at the same time.'}
      </p>

      {unavailable.length > 0 ? (
        // The specific reason stays on the row it belongs to. Repeating it here
        // would print the same sentence twice on a surface with two rows.
        <Note tone="att" title="No wallet to connect to">
          Nothing is installed for {unavailable.map((i) => FAMILY_NAME[i.family]).join(' or ')}. You
          can still watch any address without a wallet.
        </Note>
      ) : null}

      {rejected ? (
        <Note tone="att" title="Connection declined">
          Your wallet declined the request. Nothing was sent and nothing changed.
        </Note>
      ) : null}

      {needsResolution ? (
        <Note tone="att" title="This needs resolving before you sign">
          One of your wallets is not where it was. Anything already approved is bound to the account
          and chain it was approved for, so it will not execute against a different one.
        </Note>
      ) : null}

      {restored ? (
        <Note tone="info" title="Session restored">
          These accounts were restored from this device. Your wallet has not confirmed them yet, so
          nothing can be signed until it does.
        </Note>
      ) : null}

      {cannotSign.length > 0 ? (
        <Note tone="info" title="What these accounts can do">
          {cannotSign.map((identity) => (
            <span key={identity.family} className="fk-account-cannot">
              {FAMILY_NAME[identity.family]}: {cannotSignReason(identity)}
            </span>
          ))}
        </Note>
      ) : null}

    </div>
  )
}
