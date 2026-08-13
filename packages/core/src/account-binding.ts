import {
  type AccountContext,
  type ChainFamily,
  type ChainIdentity,
  type CustodyClass,
  type NetworkRef,
  identityFor,
} from './account.js'
import { FlareKitError } from './errors.js'

/**
 * An action is bound to the account and chain it was made for.
 *
 * R-WALLET-008: a quote, an approval and an execution each record their
 * account, and drift between them invalidates the action rather than silently
 * following the wallet to a new one. A wallet can switch account or network at
 * any moment, including between the screen a person read and the button they
 * pressed; without a binding, the terms they approved would quietly execute
 * against an account they never saw.
 *
 * There is deliberately no rebinding verb in this module. The only response to
 * drift is to invalidate and re-make the action.
 */

export interface AccountBinding {
  readonly family: ChainFamily
  readonly address: string
  readonly network: NetworkRef
  readonly custody: CustodyClass
  readonly boundAt: number
}

/** An operation may be bound on one chain family or on both. */
export interface OperationBinding {
  readonly evm?: AccountBinding
  readonly xrpl?: AccountBinding
}

/**
 * Takes a binding from a settled identity, or returns `undefined` when there
 * is nothing trustworthy to bind to. A restored session, a wrong network or a
 * mid-switch account all decline: binding to state we already know is
 * unconfirmed would record a claim and then validate against it.
 */
export function bindIdentity(identity: ChainIdentity, at: number): AccountBinding | undefined {
  if (identity.status !== 'ready') return undefined
  if (!identity.address || !identity.network || !identity.custody) return undefined
  return Object.freeze({
    family: identity.family,
    address: identity.address,
    network: Object.freeze({ ...identity.network }),
    custody: identity.custody,
    boundAt: at,
  })
}

export function bindContext(context: AccountContext, at: number): OperationBinding {
  const evm = bindIdentity(context.evm, at)
  const xrpl = bindIdentity(context.xrpl, at)
  return Object.freeze({ ...(evm ? { evm } : {}), ...(xrpl ? { xrpl } : {}) })
}

export type MismatchKind = 'account' | 'network' | 'absent' | 'unsettled'

export interface BindingMismatch {
  readonly family: ChainFamily
  readonly kind: MismatchKind
  /** What the action was made for. Always present — that is the whole point. */
  readonly expected: string
  /** What is connected now. Absent only when nothing is. */
  readonly actual?: string
  /**
   * The account, when `expected` and `actual` are network names rather than
   * addresses. M2-AC6 wants both accounts named, and on a chain switch the
   * account is the one thing that did not change.
   */
  readonly account?: string
}

export interface BindingCheck {
  readonly valid: boolean
  readonly mismatches: readonly BindingMismatch[]
}

const FAMILY_NAME: Record<ChainFamily, string> = { evm: 'Flare', xrpl: 'XRP Ledger' }

/**
 * M2-AC6: a mismatch names both accounts. "Wrong account" alone leaves a person
 * unable to tell which of their wallets to switch, or back to what.
 */
export function describeMismatch(mismatch: BindingMismatch): string {
  const family = FAMILY_NAME[mismatch.family]
  if (mismatch.kind === 'absent') {
    return `This was approved for the ${family} account ${mismatch.expected}, which is no longer connected.`
  }
  if (mismatch.kind === 'network') {
    const account = mismatch.account ? `account ${mismatch.account} ` : ''
    return `This was approved for the ${family} ${account}on ${mismatch.expected}, and that wallet is now on ${mismatch.actual}.`
  }
  if (mismatch.kind === 'unsettled') {
    return `This was approved for the ${family} account ${mismatch.expected}, and that connection has not been re-authorized by the wallet.`
  }
  return `This was approved for the ${family} account ${mismatch.expected}, and ${mismatch.actual} is connected now.`
}

/**
 * EVM addresses are hex and case-insensitive; XRPL classic addresses are
 * base58 and case-*sensitive*. Folding both would make two different XRPL
 * accounts compare equal — exactly the drift R-WALLET-008 exists to catch.
 */
function sameAccount(family: ChainFamily, left: string, right: string): boolean {
  return family === 'evm' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function compare(
  binding: AccountBinding | undefined,
  identity: ChainIdentity,
): BindingMismatch | undefined {
  if (!binding) return undefined

  // The identity's own status is inspected before its bindability. A wallet on
  // the wrong chain, or mid-account-switch, is still connected — telling that
  // person to reconnect instead of to switch network misdiagnoses what they
  // are looking at, and leaves SH-03 with no `network` kind to key off.
  if (!identity.address) {
    return { family: binding.family, kind: 'absent', expected: binding.address }
  }

  if (!sameAccount(binding.family, identity.address, binding.address)) {
    return {
      family: binding.family,
      kind: 'account',
      expected: binding.address,
      actual: identity.address,
    }
  }

  const currentNetwork = identity.network?.name
  if (currentNetwork && currentNetwork !== binding.network.name) {
    return {
      family: binding.family,
      kind: 'network',
      expected: binding.network.name,
      actual: currentNetwork,
      account: binding.address,
    }
  }

  // Same account, same chain, but the connection is not settled — a restored
  // session the wallet has not re-authorized, or a request still in flight.
  if (identity.status !== 'ready') {
    return {
      family: binding.family,
      kind: 'unsettled',
      expected: binding.address,
      actual: identity.address,
    }
  }
  return undefined
}

/**
 * Whether the bound action still applies. A family the action was never bound
 * to is not checked: an FXRP transfer binds only Flare, and an unrelated XRPL
 * wallet changing underneath it invalidates nothing.
 */
export function checkBinding(binding: OperationBinding, context: AccountContext): BindingCheck {
  const mismatches = (['evm', 'xrpl'] as const)
    .map((family) => compare(binding[family], identityFor(context, family)))
    .filter((mismatch): mismatch is BindingMismatch => mismatch !== undefined)

  return { valid: mismatches.length === 0, mismatches }
}

/**
 * The gate an execution path calls before it moves value. Terminal rather than
 * retryable: the same approved terms can never be made valid again for a
 * different account, so the honest instruction is to re-quote, not to try again.
 */
export function assertBinding(binding: OperationBinding, context: AccountContext): void {
  const check = checkBinding(binding, context)
  if (check.valid) return

  const evidence: Record<string, string> = {}
  for (const mismatch of check.mismatches) {
    evidence[`${mismatch.family}.expected`] = mismatch.expected
    if (mismatch.actual) evidence[`${mismatch.family}.actual`] = mismatch.actual
  }

  throw new FlareKitError('ACCOUNT_BINDING_MISMATCH', {
    domain: 'wallet',
    message: `${check.mismatches.map(describeMismatch).join(' ')} Nothing was sent. Re-quote against the account you want to use.`,
    recovery: 'terminal',
    valueMoved: 'no',
    evidence,
  })
}
