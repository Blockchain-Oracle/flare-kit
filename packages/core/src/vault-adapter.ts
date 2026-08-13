// packages/core/src/vault-adapter.ts
import type { Abi, Address, PublicClient } from 'viem'
import {
  ERC20_ABI,
  FIRELIGHT_VAULT_ABI,
  UPSHIFT_VAULT_ABI,
  type VaultConfig,
  type VaultProtocol,
} from '@flarekit-dev/contracts'

/**
 * The seam that makes M7 "one lifecycle, not one ABI". Firelight (self-share
 * stFXRP, standard ERC-4626 deposit, period-based delayed withdrawal) and Upshift
 * (separate LP token, NON-standard `deposit(asset,amount,receiver)`, instant OR
 * lag/calendar-epoch delayed withdrawal) are materially different contracts. Every
 * per-vault difference — which token carries the shares, whether a withdraw pulls
 * an LP token, how a pending request reconciles, how the fee is computed — lives
 * behind `VaultAdapter`; nothing downstream references a raw vault ABI.
 *
 * Reads are pure chain reads (no key). Writes are pure builders of structured,
 * unsigned `VaultCall`s tagged with the ABI that encodes them, so the signing edge
 * (`live-vault.mjs` / the host's `onSubmit`) calls `writeContract(call)` uniformly
 * regardless of protocol.
 */

export type ExitRoute = 'delayed' | 'instant'

/** A structured, unsigned call. The edge encodes it via `vaultAbiFor(call.protocol)`. */
export interface VaultCall {
  readonly protocol: VaultProtocol | 'erc20'
  readonly address: Address
  readonly functionName: string
  readonly args: readonly unknown[]
  /** A human label for the operation spine / evidence log. */
  readonly label: string
}

/** What a `claim` call needs, plus the concrete time it becomes claimable. */
export type ClaimRef =
  | { readonly protocol: 'firelight'; readonly period: bigint; readonly claimableAt: number }
  | {
      readonly protocol: 'upshift'
      readonly year: number
      readonly month: number
      readonly day: number
      readonly claimableAt: number
    }

/** A pending withdrawal, time-agnostic: the surface applies `now` via `withdrawalPhase`. */
export type PendingWithdrawal =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'pending'
      readonly claimableAt: number
      /** The pending amount if the chain exposes it, else null (renders `—`, never 0). */
      readonly assets: bigint | null
      readonly claimed: boolean
      readonly ref: ClaimRef
    }

export type WithdrawalPhase = 'none' | 'waiting' | 'claimable' | 'claimed'

/** Pure: decide the phase from a reconciled pending withdrawal and the wall clock. */
export function withdrawalPhase(p: PendingWithdrawal, now: number): WithdrawalPhase {
  if (p.kind === 'none') return 'none'
  if (p.claimed) return 'claimed'
  return now >= p.claimableAt ? 'claimable' : 'waiting'
}

/**
 * Build a Firelight delayed-withdrawal claim ref from the request context. A Firelight
 * redeem in period P files its withdrawal under period **P+1**, and `claimWithdraw(P+1)`
 * is callable only once `currentPeriod > P+1` (period P+1 has ended). Recording the
 * REQUEST period P strands the claim: `withdrawalsOf(P)` is 0 and `claimWithdraw(P)`
 * reverts. So the claim ref is the UNLOCK period `currentPeriod + 1`, claimable at
 * `unlockAt` — the end of period P+1, i.e. `nextPeriodEnd` read at request time. Encoded
 * here so no caller re-derives it wrong. Live-verified 2026-08-12: a request in period
 * 333 filed under period 334; `claimWithdraw(333)` reverted (`withdrawalsOf(333)=0`).
 */
export function firelightClaimRef(currentPeriod: bigint, unlockAt: number): ClaimRef {
  return { protocol: 'firelight', period: currentPeriod + 1n, claimableAt: unlockAt }
}

export interface VaultAvailability {
  readonly depositPaused: boolean
  /** null when the vault exposes no cap. */
  readonly maxDeposit: bigint | null
  readonly withdrawPaused: boolean
  readonly maxWithdrawal: bigint | null
}

export interface PreviewWithdraw {
  readonly assets: bigint
  /** Net of the route's fee — Upshift computes this on-chain; Firelight has no fee (equal). */
  readonly assetsAfterFee: bigint
}

export interface VaultReads {
  /** Assets returned for one whole share unit (10**shareDecimals) — the exchange rate. */
  rate(): Promise<bigint>
  previewDeposit(assets: bigint): Promise<bigint>
  previewWithdraw(shares: bigint, route: ExitRoute): Promise<PreviewWithdraw>
  shareBalance(owner: Address): Promise<bigint>
  /** The owner's balance of the deposit asset — the insufficient-balance gate on deposit. */
  assetBalance(owner: Address): Promise<bigint>
  assetAllowance(owner: Address): Promise<bigint>
  /** LP allowance to the vault; MAX for a self-share vault (no approval is ever needed). */
  shareAllowance(owner: Address): Promise<bigint>
  availability(owner: Address): Promise<VaultAvailability>
  /**
   * Reconcile a KNOWN pending request against the chain (self-reconciling, no
   * session state). `now` (unix seconds) guards the terminal `claimed` flag so a
   * request still inside its wait is never resolved to a false success — an absence
   * of claimable funds before the boundary is WAITING, not "withdrawn".
   */
  claimable(owner: Address, ref: ClaimRef, now: number): Promise<PendingWithdrawal>
}

export interface VaultWrites {
  /** True when a withdrawal pulls an LP token that must be approved first (Upshift). */
  readonly needsShareApproval: boolean
  approveAsset(amount: bigint): VaultCall
  approveShare(amount: bigint): VaultCall
  deposit(assets: bigint, receiver: Address): VaultCall
  requestWithdraw(shares: bigint, receiver: Address, owner: Address, route: ExitRoute): VaultCall
  claim(ref: ClaimRef, receiver: Address): VaultCall
}

export interface VaultAdapter {
  readonly config: VaultConfig
  readonly reads: VaultReads
  readonly writes: VaultWrites
}

const MAX_UINT = (1n << 256n) - 1n

/** Resolve the ABI that encodes a `VaultCall` for `writeContract`. */
export function vaultAbiFor(protocol: VaultProtocol | 'erc20'): Abi {
  if (protocol === 'erc20') return ERC20_ABI as unknown as Abi
  if (protocol === 'firelight') return FIRELIGHT_VAULT_ABI as unknown as Abi
  return UPSHIFT_VAULT_ABI as unknown as Abi
}

export function makeVaultAdapter(client: PublicClient, config: VaultConfig): VaultAdapter {
  const shareUnit = 10n ** BigInt(config.share.decimals)
  const shareAddress = config.share.kind === 'lp' ? config.share.address : config.address
  const isSelf = config.share.kind === 'self'

  const readVault = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: config.address,
      abi: vaultAbiFor(config.protocol),
      functionName,
      args,
    }) as Promise<T>

  const readErc20 = <T>(address: Address, functionName: string, args: readonly unknown[]) =>
    client.readContract({ address, abi: vaultAbiFor('erc20'), functionName, args }) as Promise<T>

  const reads: VaultReads =
    config.protocol === 'firelight'
      ? {
          rate: () => readVault<bigint>('convertToAssets', [shareUnit]),
          previewDeposit: (assets) => readVault<bigint>('previewDeposit', [assets]),
          previewWithdraw: async (shares) => {
            const assets = await readVault<bigint>('previewRedeem', [shares])
            return { assets, assetsAfterFee: assets } // Firelight delayed withdrawal has no fee
          },
          shareBalance: (owner) => readErc20<bigint>(config.address, 'balanceOf', [owner]),
          assetBalance: (owner) => readErc20<bigint>(config.asset.address, 'balanceOf', [owner]),
          assetAllowance: (owner) => readErc20<bigint>(config.asset.address, 'allowance', [owner, config.address]),
          shareAllowance: async () => MAX_UINT, // self-share redeem burns the caller's own shares
          availability: async (owner) => {
            // Firelight's standard ERC-4626 maxDeposit ignores its custom GLOBAL
            // depositLimit, so the real headroom is min(maxDeposit, limit − total).
            const [maxDeposit, depositLimit, totalAssets] = await Promise.all([
              readVault<bigint>('maxDeposit', [owner]),
              readVault<bigint>('depositLimit', []),
              readVault<bigint>('totalAssets', []),
            ])
            const headroom = depositLimit > totalAssets ? depositLimit - totalAssets : 0n
            const effectiveMax = maxDeposit < headroom ? maxDeposit : headroom
            // A FULL vault (headroom 0) is a CAP, not a pause: it flows through the
            // cap_exceeded gate as maxDeposit 0. Synthesising `depositPaused` from
            // zero headroom would fabricate an admin halt the chain never signalled
            // and mask the accurate cap. Firelight's period-based withdrawal exposes
            // no pause flag in the vendored ABI, so withdrawPaused is a real `false`.
            return { depositPaused: false, maxDeposit: effectiveMax, withdrawPaused: false, maxWithdrawal: null }
          },
          claimable: async (owner, ref) => {
            if (ref.protocol !== 'firelight') return { kind: 'none' }
            const current = await readVault<bigint>('currentPeriod', [])
            if (current <= ref.period) {
              return { kind: 'pending', claimableAt: ref.claimableAt, assets: null, claimed: false, ref }
            }
            // Period rolled over. `claimed` is asserted ONLY from the positive
            // on-chain flag — a zero recorded amount while NOT claimed is unknown,
            // never a success (renders `assets: —`, stays claimable, no false
            // "Withdrawn"). currentPeriod is Firelight's own clock, so `now` is
            // unused here.
            const [claimed, amount] = await Promise.all([
              readVault<boolean>('isWithdrawClaimed', [ref.period, owner]),
              readVault<bigint>('withdrawalsOf', [ref.period, owner]),
            ])
            return { kind: 'pending', claimableAt: ref.claimableAt, assets: amount > 0n ? amount : null, claimed, ref }
          },
        }
      : {
          rate: async () => {
            const [assetsAmount] = await readVault<readonly [bigint, bigint]>('previewRedemption', [shareUnit, false])
            return assetsAmount
          },
          previewDeposit: async (assets) => {
            const [shares] = await readVault<readonly [bigint, bigint]>('previewDeposit', [config.asset.address, assets])
            return shares
          },
          previewWithdraw: async (shares, route) => {
            const [assets, assetsAfterFee] = await readVault<readonly [bigint, bigint]>('previewRedemption', [
              shares,
              route === 'instant',
            ])
            return { assets, assetsAfterFee }
          },
          shareBalance: (owner) => readErc20<bigint>(shareAddress, 'balanceOf', [owner]),
          assetBalance: (owner) => readErc20<bigint>(config.asset.address, 'balanceOf', [owner]),
          assetAllowance: (owner) => readErc20<bigint>(config.asset.address, 'allowance', [owner, config.address]),
          shareAllowance: (owner) => readErc20<bigint>(shareAddress, 'allowance', [owner, config.address]),
          availability: async () => {
            // Upshift's deposit path exposes no pause flag in the vendored ABI;
            // `withdrawalsPaused` governs withdrawals only, so depositPaused is a
            // real `false`, not an unread assumption.
            const withdrawPaused = await readVault<boolean>('withdrawalsPaused', [])
            const maxWithdrawal = await readVault<bigint>('maxWithdrawalAmount', [])
            return { depositPaused: false, maxDeposit: null, withdrawPaused, maxWithdrawal }
          },
          claimable: async (owner, ref, now) => {
            if (ref.protocol !== 'upshift') return { kind: 'none' }
            const burnable = await readVault<bigint>('getBurnableAmountByReceiver', [
              ref.year,
              ref.month,
              ref.day,
              owner,
            ])
            // A withdrawal REQUEST is not a withdrawal. Before the calendar epoch,
            // `getBurnableAmountByReceiver` is 0 because nothing is claimable yet —
            // that is WAITING, never claimed. Only AFTER the epoch does a 0 burnable
            // mean the request was claimed (at the epoch it equals the pending
            // amount and returns to 0 only once burned). Guarding by the epoch clock
            // mirrors Firelight guarding by currentPeriod; without it a still-waiting
            // Upshift withdrawal would self-reconcile to a false "Withdrawn".
            const reached = now >= ref.claimableAt
            return {
              kind: 'pending',
              claimableAt: ref.claimableAt,
              assets: burnable > 0n ? burnable : null,
              claimed: reached && burnable === 0n,
              ref,
            }
          },
        }

  const call = (
    protocol: VaultProtocol | 'erc20',
    address: Address,
    functionName: string,
    args: readonly unknown[],
    label: string,
  ): VaultCall => ({ protocol, address, functionName, args, label })

  const writes: VaultWrites = {
    needsShareApproval: !isSelf,
    approveAsset: (amount) =>
      call('erc20', config.asset.address, 'approve', [config.address, amount], `Approve ${config.asset.symbol}`),
    approveShare: (amount) => {
      if (isSelf) throw new Error(`${config.key}: self-share vault needs no share approval`)
      return call('erc20', shareAddress, 'approve', [config.address, amount], `Approve ${config.share.symbol}`)
    },
    deposit: (assets, receiver) =>
      config.protocol === 'firelight'
        ? call('firelight', config.address, 'deposit', [assets, receiver], `Deposit ${config.asset.symbol}`)
        : call('upshift', config.address, 'deposit', [config.asset.address, assets, receiver], `Deposit ${config.asset.symbol}`),
    requestWithdraw: (shares, receiver, owner, route) => {
      if (config.protocol === 'firelight') {
        return call('firelight', config.address, 'redeem', [shares, receiver, owner], `Request withdrawal`)
      }
      return route === 'instant'
        ? call('upshift', config.address, 'instantRedeem', [shares, receiver], `Instant redeem`)
        : call('upshift', config.address, 'requestRedeem', [shares, receiver], `Request withdrawal`)
    },
    claim: (ref, receiver) =>
      ref.protocol === 'firelight'
        ? call('firelight', config.address, 'claimWithdraw', [ref.period], `Claim withdrawal`)
        : call('upshift', config.address, 'claim', [ref.year, ref.month, ref.day, receiver], `Claim withdrawal`),
  }

  return { config, reads, writes }
}
