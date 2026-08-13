// packages/core/src/delegation-adapter.ts
import { type Abi, type Address, type PublicClient } from 'viem'
import { type DelegationDeployment, IWNAT_ABI, IVPTOKEN_ABI } from '@flare-kit/contracts'

/**
 * The `DelegationAdapter` — the reads/call-builder seam for the M10 delegation op,
 * mirroring `gasless-adapter.ts` / `bridge-adapter.ts`. WNat *is* the IVPToken: the
 * wrap/unwrap live on `IWNat` and the delegation/vote-power surface on `IVPToken`, but
 * both are the SAME contract at `deployment.wnat`, so every read and every built call
 * targets that one address.
 *
 * Reads are pure chain reads (no key): the wrapped balance, the delegation mode, the
 * current delegates (from `delegatesOf`, zipped positionally and bounded by the
 * on-chain `count`), the vote power and the still-undelegated vote power, plus the
 * native balance from `getBalance`. The `build*` methods return structured, UNSIGNED
 * `DelegationCall`s the signing edge (Task 5 live script / Task 10 hook) encodes via
 * `delegationAbiFor(call.abiKind)`. No signing, no writes, live here.
 *
 * Honesty (M10): this file only READS. It does NOT invent a zero on failure — a read
 * that throws PROPAGATES (the caller, Task 4 `delegationPosition` / the hook, maps the
 * failure to `unavailable`). A confident zero is never fabricated from an RPC error.
 */

/** 0 = NOTSET, 1 = PERCENTAGE, 2 = AMOUNT (explicit) — `delegationModeOf`'s value. */
export type DelegationMode = 0 | 1 | 2

/** A structured, unsigned call; the edge encodes it via `delegationAbiFor(call.abiKind)`. */
export interface DelegationCall {
  readonly abiKind: 'wnat' | 'vptoken'
  readonly address: Address
  readonly functionName: string
  readonly args: readonly unknown[]
  /** Present ONLY on `WNat.deposit()` (the wrap = msg.value); absent on every other call. */
  readonly value?: bigint
  readonly label: string
}

/** A snapshot of the account's delegation position — every field a pure chain read. */
export interface DelegationReads {
  nativeBalance: bigint
  wrappedBalance: bigint
  mode: DelegationMode
  /** From `delegatesOf`, zipped positionally and bounded by the on-chain `count`. */
  delegates: { address: `0x${string}`; bips: number }[]
  votePower: bigint
  undelegatedVotePower: bigint
}

export interface DelegationAdapter {
  /** The deployment this adapter was built for — carries `delegationVerified` (Task 4's gate). */
  readonly deployment: DelegationDeployment
  read(account: `0x${string}`): Promise<DelegationReads>
  /** `WNat.deposit()` — payable, the amount rides as `value` (the wrap). */
  buildWrap(amount: bigint): DelegationCall
  /** `WNat.withdraw(amount)` — burn WNat back to native. */
  buildUnwrap(amount: bigint): DelegationCall
  /** `IVPToken.delegate(to, bips)` — percentage delegation to one provider. */
  buildDelegate(to: `0x${string}`, bips: number): DelegationCall
  /** `IVPToken.batchDelegate([...to], [...bips])` — up to two providers in one call. */
  buildBatchDelegate(targets: { to: `0x${string}`; bips: number }[]): DelegationCall
  /** `IVPToken.delegateExplicit(to, amount)` — explicit-amount delegation (mode AMOUNT). */
  buildDelegateExplicit(to: `0x${string}`, amount: bigint): DelegationCall
  /** `IVPToken.undelegateAll()` — clear all percentage delegations. */
  buildUndelegateAll(): DelegationCall
}

/** Resolve the ABI that encodes a `DelegationCall` for `writeContract`. */
export function delegationAbiFor(abiKind: 'wnat' | 'vptoken'): Abi {
  return (abiKind === 'wnat' ? IWNAT_ABI : IVPTOKEN_ABI) as unknown as Abi
}

/** The `delegatesOf` return: parallel address/bips arrays, the authoritative count, the mode. */
type DelegatesOf = readonly [readonly Address[], readonly bigint[], bigint, bigint]

export function makeDelegationAdapter(client: PublicClient, deployment: DelegationDeployment): DelegationAdapter {
  const address = deployment.wnat

  const read = async (account: `0x${string}`): Promise<DelegationReads> => {
    // Promise.all: any read that throws REJECTS the whole snapshot (propagates to the
    // caller). We never catch a per-field failure into a fabricated zero.
    const [wrappedBalance, modeRaw, votePower, undelegatedVotePower, delegatesRaw, nativeBalance] = await Promise.all([
      client.readContract({ address, abi: IWNAT_ABI, functionName: 'balanceOf', args: [account] }) as Promise<bigint>,
      client.readContract({ address, abi: IVPTOKEN_ABI, functionName: 'delegationModeOf', args: [account] }) as Promise<bigint>,
      client.readContract({ address, abi: IVPTOKEN_ABI, functionName: 'votePowerOf', args: [account] }) as Promise<bigint>,
      client.readContract({
        address,
        abi: IVPTOKEN_ABI,
        functionName: 'undelegatedVotePowerOf',
        args: [account],
      }) as Promise<bigint>,
      client.readContract({ address, abi: IVPTOKEN_ABI, functionName: 'delegatesOf', args: [account] }) as Promise<DelegatesOf>,
      client.getBalance({ address: account }),
    ])

    // Zip addrs/bips positionally, bounded by `count` — the on-chain authoritative
    // length. Never trust array entries past `count` (a longer array is stale tail, not
    // a real delegate). bips <= 10000 fits a JS number.
    const [addrs, bipsArr, count] = delegatesRaw
    const n = Math.min(Number(count), addrs.length, bipsArr.length)
    const delegates: { address: `0x${string}`; bips: number }[] = []
    for (let i = 0; i < n; i++) delegates.push({ address: addrs[i]!, bips: Number(bipsArr[i]!) })

    return {
      nativeBalance,
      wrappedBalance,
      mode: Number(modeRaw) as DelegationMode,
      delegates,
      votePower,
      undelegatedVotePower,
    }
  }

  const call = (
    abiKind: 'wnat' | 'vptoken',
    functionName: string,
    args: readonly unknown[],
    label: string,
    value?: bigint,
  ): DelegationCall => ({ abiKind, address, functionName, args, label, ...(value !== undefined ? { value } : {}) })

  return {
    deployment,
    read,
    buildWrap: (amount) => call('wnat', 'deposit', [], `Wrap ${deployment.nativeSymbol}`, amount),
    buildUnwrap: (amount) => call('wnat', 'withdraw', [amount], `Unwrap ${deployment.wrappedSymbol}`),
    buildDelegate: (to, bips) => call('vptoken', 'delegate', [to, BigInt(bips)], `Delegate to ${to}`),
    buildBatchDelegate: (targets) =>
      call(
        'vptoken',
        'batchDelegate',
        [targets.map((t) => t.to), targets.map((t) => BigInt(t.bips))],
        `Delegate to ${targets.length} provider${targets.length === 1 ? '' : 's'}`,
      ),
    buildDelegateExplicit: (to, amount) => call('vptoken', 'delegateExplicit', [to, amount], `Delegate to ${to}`),
    buildUndelegateAll: () => call('vptoken', 'undelegateAll', [], 'Undelegate all'),
  }
}
