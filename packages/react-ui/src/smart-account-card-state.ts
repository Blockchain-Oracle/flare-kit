// packages/react-ui/src/smart-account-card-state.ts
import type {
  DeploymentSettings,
  PersonalAccountState,
  SmartAccountsDeployment,
} from '@flare-kit/core'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * How a personal account's READS become the SmartAccountCard's chrome (SA-01, M13-R10).
 *
 * The card is an identity surface for an account the user has never touched and which may
 * not exist, so its two hardest facts both live here:
 *
 * 1. **Deployment is three-valued.** A `CREATE2` address answers before the contract exists,
 *    so `not deployed` is a real, common holding rather than an error — it is what every
 *    XRPL address has until its first instruction. And `we could not read the code` is a
 *    THIRD answer: collapsing it into `not deployed` would tell a user their account does
 *    not exist on the strength of a read that failed.
 * 2. **The identical-address property is OBSERVED, never asserted.** The controller is at
 *    the same address on both networks, so a personal account derives identically on both —
 *    but the card must show that the two reads AGREE, not print a claim beside two values it
 *    did not compare. When either side is unread the honest answer is that it cannot be
 *    compared, which is neither "identical" nor "different".
 */

/**
 * One network's worth of the card. It lives here rather than beside the component because
 * both the column renderer and the address comparison are typed on it, and a props type
 * defined in one of the two would make the other import a component to name its input.
 */
export interface SmartAccountNetworkView {
  readonly deployment: SmartAccountsDeployment
  /** e.g. `Coston2`. Supplied by the host, the convention every other surface follows. */
  readonly networkLabel: string
  /** The native currency symbol, for the account's gas balance and the executor fee. */
  readonly nativeSymbol: string
  /** `undefined` when the controller could not be read — never an empty settings object. */
  readonly settings: DeploymentSettings | undefined
  /** `undefined` when even the address could not be derived. */
  readonly account: PersonalAccountState | undefined
}

export interface DeploymentFact {
  readonly kind: 'deployed' | 'not-deployed' | 'unknown' | 'no-address'
  readonly tone: Tone
  readonly glyph: Glyph
  readonly word: string
  readonly detail: string
}

export function deploymentFact(account: PersonalAccountState | undefined): DeploymentFact {
  if (!account) {
    return {
      kind: 'no-address',
      tone: 'neutral',
      glyph: 'unknown',
      word: 'Address not derived',
      detail:
        'The controller did not answer `getPersonalAccount` for this XRPL address, so even the ' +
        'address is unknown here. This says nothing about whether an account exists.',
    }
  }
  if (account.deployed === true) {
    return {
      kind: 'deployed',
      tone: 'ok',
      glyph: 'done',
      word: 'Deployed',
      detail: 'The contract is on chain at this address, so it has executed at least one instruction.',
    }
  }
  if (account.deployed === false) {
    return {
      kind: 'not-deployed',
      tone: 'primary',
      glyph: 'waiting',
      word: 'Not deployed yet',
      detail:
        'The address is derived by CREATE2 and answers already; the contract is not there yet. ' +
        'The first instruction to reach it deploys it, at exactly this address. It can hold a ' +
        'balance before it exists.',
    }
  }
  return {
    kind: 'unknown',
    tone: 'att',
    glyph: 'unknown',
    word: 'Couldn’t read',
    detail:
      'The code read at this address did not land, so whether the contract is deployed is ' +
      'unknown. This is not a “no”.',
  }
}

export type AddressParity =
  /** Both networks answered, and they answered the same. An observation, not a claim. */
  | { readonly kind: 'identical'; readonly address: `0x${string}` }
  /** Both answered and they DISAGREE. Loud, because the property is meant to hold. */
  | { readonly kind: 'differs'; readonly addresses: readonly string[] }
  /** Fewer than two answers to compare. Never rendered as agreement. */
  | { readonly kind: 'not-comparable'; readonly reason: string }

export function addressParity(networks: readonly SmartAccountNetworkView[]): AddressParity {
  if (networks.length < 2) {
    return {
      kind: 'not-comparable',
      reason: 'Only one network is shown, so there is nothing to compare it against.',
    }
  }
  const unread = networks.filter((network) => !network.account)
  if (unread.length > 0) {
    return {
      kind: 'not-comparable',
      reason: `The personal account could not be derived on ${unread
        .map((network) => network.networkLabel)
        .join(' and ')}, so the two addresses cannot be compared.`,
    }
  }
  // Compared case-insensitively: the same address can come back checksummed on one node and
  // lower-case on another, and a byte-identical account reported as DIFFERING would be a
  // false alarm about the one property this card exists to show.
  const addresses = networks.map((network) => network.account!.address)
  const first = addresses[0]!
  return addresses.every((address) => address.toLowerCase() === first.toLowerCase())
    ? { kind: 'identical', address: first }
    : { kind: 'differs', addresses }
}

/**
 * An unread `bigint` is `—`, an observed `0` is `0`. The distinction is the point: a real
 * blank-slate account genuinely reads nonce 0, and a failed read must not wear that value.
 */
export function unreadOr(value: bigint | undefined, suffix?: string): string {
  if (value === undefined) return '—'
  return suffix ? `${value} ${suffix}` : `${value}`
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * The pinned executor. THREE outcomes again: unread, the zero address (a real answer meaning
 * nothing is pinned) and a real executor. `None` and `—` are never the same word.
 */
export function pinnedExecutorLabel(executor: `0x${string}` | undefined): string | undefined {
  if (executor === undefined) return undefined
  return executor.toLowerCase() === ZERO_ADDRESS ? 'None pinned' : undefined
}
