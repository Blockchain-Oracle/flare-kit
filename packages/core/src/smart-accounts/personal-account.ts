import {
  type SmartAccountsDeployment,
  masterAccountControllerAbi,
} from '@flare-kit/contracts'
import { type Abi, type PublicClient } from 'viem'

/**
 * The PERSONAL ACCOUNT half of the smart-accounts reads — split from `adapter.ts` to keep
 * both under the 300-line cap. `adapter.ts` reads what the DEPLOYMENT is; this reads what
 * one XRPL address's account is.
 *
 * The same honesty rule governs both: a read that THROWS yields `undefined` and surfaces as
 * `unavailable`, never a fabricated zero, empty list or `false`.
 */

export interface PersonalAccountState {
  readonly xrplOwner: string
  /** The deterministic CREATE2 address. It answers before the account exists. */
  readonly address: `0x${string}`
  /**
   * Whether the contract is actually deployed. A derived address is NOT evidence of
   * existence, and the surface must not imply it is — an undeployed account with a real
   * balance is a reachable state.
   *
   * `undefined` when the code read FAILED. That is a third answer, and collapsing it into
   * `false` would tell a user their account does not exist when in truth we could not look
   * — the same mistake as rendering an unread balance as zero.
   */
  readonly deployed: boolean | undefined
  /** The memo-instruction nonce. `undefined` when unreadable, never a confident 0. */
  readonly nonce: bigint | undefined
  /** The zero address means "no executor is pinned", which is a real answer. */
  readonly pinnedExecutor: `0x${string}` | undefined
  readonly nativeBalance: bigint | undefined
  readonly fassetBalance: bigint | undefined
}

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * For reads whose OWN successful answer can be `undefined` — `getCode` returns `undefined`
 * for an address with no code. `attempt` cannot serve those: its `undefined` means "the
 * read failed", and the two answers must stay distinguishable.
 */
async function settled<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() }
  } catch {
    return { ok: false }
  }
}

/** `undefined` on throw. Never a fabricated value standing in for an unanswered read. */
async function attempt<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read()
  } catch {
    return undefined
  }
}

/**
 * The personal account an XRPL address controls. `undefined` only when the address itself
 * cannot be derived — every other field carries its own `undefined`, because an account
 * whose balance is unreadable still has a real, useful address and deployment state.
 */
export async function readPersonalAccount(
  client: PublicClient,
  deployment: SmartAccountsDeployment,
  xrplOwner: string,
  fassetToken?: `0x${string}`,
): Promise<PersonalAccountState | undefined> {
  const controller = deployment.masterAccountController
  const address = await attempt(
    () =>
      client.readContract({
        address: controller,
        abi: masterAccountControllerAbi,
        functionName: 'getPersonalAccount',
        args: [xrplOwner],
      }) as Promise<`0x${string}`>,
  )
  if (!address) return undefined

  const controllerAbi = masterAccountControllerAbi as unknown as Abi
  const read = (functionName: string) =>
    attempt(() =>
      client.readContract({ address: controller, abi: controllerAbi, functionName, args: [address] }),
    )

  // `getCode` is read through a RESULT wrapper rather than `attempt`, because viem returns
  // `undefined` for an address with no code — the same value `attempt` uses for a failed
  // read. Collapsing the two would make "not deployed" and "we could not look" identical.
  const [code, nonce, pinnedExecutor, nativeBalance, fassetBalance] = await Promise.all([
    settled(() => client.getCode({ address })),
    read('getNonce') as Promise<bigint | undefined>,
    read('getExecutor') as Promise<`0x${string}` | undefined>,
    attempt(() => client.getBalance({ address })),
    fassetToken
      ? attempt(
          () =>
            client.readContract({
              address: fassetToken,
              abi: ERC20_BALANCE_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
        )
      : Promise.resolve(undefined),
  ])

  return {
    xrplOwner,
    address,
    deployed: code.ok ? code.value !== undefined && code.value !== '0x' : undefined,
    nonce,
    pinnedExecutor,
    nativeBalance,
    fassetBalance,
  }
}
