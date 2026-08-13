/**
 * Two chain families, one session.
 *
 * A mint pays from the XRP Ledger and receives on Flare, so both identities are
 * attached at the same time and neither is a precondition for the other
 * (M2-R2). Each carries its own connection state and its own custody class,
 * because who holds the keys is a different question from whether a wallet is
 * currently answering.
 *
 * Read-only is a chosen mode, never an outcome of failing to connect. That is
 * why `rejected` and `walletUnavailable` produce no custody class at all: there
 * is no path from a refusal to a read-only identity except asking for one.
 */

export type ChainFamily = 'evm' | 'xrpl'

/**
 * R-WALLET-002. `external-wallet` is a wallet the person controls;
 * `read-only` is an address supplied for watching, with no key anywhere;
 * `agent-key` is a key this process holds and can sign with unattended.
 */
export const CUSTODY_CLASSES = ['external-wallet', 'read-only', 'agent-key'] as const

export type CustodyClass = (typeof CUSTODY_CLASSES)[number]

/**
 * SH-02's required states, one per connection outcome. `restored` is separate
 * from `ready` because a session rebuilt from storage has not been
 * re-authorized by the wallet, and `account-changed` is separate because the
 * address moving under an approved plan is a fact the plan has to hear about.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'unavailable'
  | 'connecting'
  | 'rejected'
  | 'invalid-identity'
  | 'wrong-network'
  | 'account-changed'
  | 'restored'
  | 'ready'

export interface NetworkRef {
  /** The network as a proper noun, e.g. "Coston2" or "XRPL Testnet". */
  readonly name: string
  /** Present for EVM networks; the XRP Ledger has no chain id. */
  readonly chainId?: number
}

export interface ChainIdentity {
  readonly family: ChainFamily
  readonly status: ConnectionStatus
  readonly address?: string
  /** Absent until there is an identity to hold; never inferred from a failure. */
  readonly custody?: CustodyClass
  readonly network?: NetworkRef
  /** Set when `network` is not the one the operation needs. */
  readonly requiredNetwork?: NetworkRef
  /** Why, in words, for every status that is not simply working. */
  readonly reason?: string
  /** What the address was before the wallet switched under us. */
  readonly previousAddress?: string
  readonly restoredAt?: number
}

function identity(init: ChainIdentity): ChainIdentity {
  return Object.freeze({ ...init, ...(init.network ? { network: Object.freeze(init.network) } : {}) })
}

export function disconnected(family: ChainFamily): ChainIdentity {
  return identity({ family, status: 'disconnected' })
}

export function connecting(family: ChainFamily): ChainIdentity {
  return identity({ family, status: 'connecting' })
}

export function walletUnavailable(family: ChainFamily, reason: string): ChainIdentity {
  return identity({ family, status: 'unavailable', reason })
}

export function rejected(family: ChainFamily, reason: string): ChainIdentity {
  return identity({ family, status: 'rejected', reason })
}

export function walletConnected(
  family: ChainFamily,
  address: string,
  network: NetworkRef,
  custody: Exclude<CustodyClass, 'read-only'> = 'external-wallet',
): ChainIdentity {
  return identity({ family, status: 'ready', address, network, custody })
}

export function wrongNetwork(
  family: ChainFamily,
  address: string,
  current: NetworkRef,
  required: NetworkRef,
  custody: CustodyClass = 'external-wallet',
): ChainIdentity {
  return identity({
    family,
    status: 'wrong-network',
    address,
    custody,
    network: current,
    requiredNetwork: required,
  })
}

export function accountChanged(previous: ChainIdentity, address: string): ChainIdentity {
  return identity({
    ...previous,
    status: 'account-changed',
    address,
    ...(previous.address ? { previousAddress: previous.address } : {}),
  })
}

export function restoredSession(
  family: ChainFamily,
  address: string,
  network: NetworkRef,
  restoredAt: number,
  custody: CustodyClass = 'external-wallet',
): ChainIdentity {
  return identity({ family, status: 'restored', address, network, custody, restoredAt })
}

/** The one constructor that produces a read-only identity. It is asked for. */
export function supplyReadOnly(
  family: ChainFamily,
  address: string,
  network: NetworkRef,
): ChainIdentity {
  return identity({ family, status: 'ready', address, network, custody: 'read-only' })
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
/** XRPL classic address: `r` then base58, which omits 0, O, I and l. */
const XRPL_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

/**
 * Turns typed text into a read-only identity or into SH-02's
 * `invalid read-only identity` state. This is a shape check, not proof the
 * account exists — the ledger is the authority on that, and reports it as an
 * unavailable observation rather than as a zero balance.
 */
export function parseReadOnlyIdentity(
  family: ChainFamily,
  input: string,
  network: NetworkRef,
): ChainIdentity {
  const address = input.trim()
  const pattern = family === 'evm' ? EVM_ADDRESS : XRPL_ADDRESS
  if (pattern.test(address)) return supplyReadOnly(family, address, network)

  return identity({
    family,
    status: 'invalid-identity',
    reason:
      family === 'evm'
        ? 'A Flare address is 0x followed by 40 hexadecimal characters.'
        : 'An XRP Ledger address starts with r and uses base58, which has no 0, O, I or l.',
  })
}

export function isReadOnly(identity: ChainIdentity): boolean {
  return identity.custody === 'read-only'
}

/** R-WALLET-003: only a held key on a settled connection can sign. */
export function canSign(identity: ChainIdentity): boolean {
  return identity.status === 'ready' && identity.custody !== undefined && !isReadOnly(identity)
}

const CANNOT_SIGN: Record<ConnectionStatus, string> = {
  disconnected: 'No account is connected, so nothing can be signed.',
  unavailable: 'No wallet is available to sign with.',
  connecting: 'The wallet has not answered yet, so nothing can be signed.',
  rejected: 'The wallet declined the request, so nothing can be signed.',
  'invalid-identity': 'That identity was not recognised, so nothing can be signed.',
  'wrong-network': 'The wallet is on a different network from the one this needs.',
  'account-changed': 'The wallet switched account, so the approved terms no longer apply.',
  restored: 'This session was restored from storage and the wallet has not re-authorized it.',
  ready: 'This is a read-only identity, supplied for watching. It holds no key.',
}

/**
 * M2-AC5: every write control states that it cannot sign. Returns `undefined`
 * exactly when signing is possible, so a surface that forgets to check has
 * nothing to render.
 */
export function cannotSignReason(identity: ChainIdentity): string | undefined {
  return canSign(identity) ? undefined : CANNOT_SIGN[identity.status]
}

export interface AccountContext {
  readonly evm: ChainIdentity
  readonly xrpl: ChainIdentity
}

export function createAccountContext(init?: Partial<AccountContext>): AccountContext {
  return Object.freeze({
    evm: init?.evm ?? disconnected('evm'),
    xrpl: init?.xrpl ?? disconnected('xrpl'),
  })
}

export function identityFor(context: AccountContext, family: ChainFamily): ChainIdentity {
  return family === 'evm' ? context.evm : context.xrpl
}

/** SH-02's `both ready`. A read-only identity counts: watching is a mode. */
export function bothReady(context: AccountContext): boolean {
  return context.evm.status === 'ready' && context.xrpl.status === 'ready'
}
