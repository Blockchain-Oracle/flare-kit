// packages/core/src/vault-quote.ts
import type { Address } from '@flare-kit/contracts'
import { type Amount, amount } from './amounts.js'
import type { ExitRoute, VaultAdapter } from './vault-adapter.js'

/**
 * The honest vault quote (M7-R4). Deposit shares come from the vault's own
 * `previewDeposit`; the expected assets on a withdrawal come from the vault's own
 * fee-adjusted preview (`assetsAfterFee`) — Upshift computes the fee on chain, so
 * the kit renders what the user will actually receive, per route, rather than
 * applying a fee scale it guessed. An unknown read is `unavailable`, never a 0, and
 * a failed position read is `unavailable`, never a confident `no_position` (the M6
 * F1 rule). Deposit/withdraw availability (paused, cap, verified-gating) belongs to
 * the plan (`vault.ts`), not here — this layer is pricing only.
 */

const floor = (v: bigint, slippageBips: number): bigint => (v * BigInt(10_000 - slippageBips)) / 10_000n

export interface DepositQuote {
  readonly assetsIn: Amount
  readonly expectedShares: Amount
  readonly minShares: Amount
  /** Assets returned for one whole share unit — the exchange rate, raw. */
  readonly rate: bigint
  readonly slippageBips: number
  readonly observedAt: number
}

export interface WithdrawQuote {
  readonly route: ExitRoute
  readonly shares: Amount
  /** Assets before the vault's withdrawal fee. */
  readonly grossAssets: Amount
  /** The fee the vault will take on this route (grossAssets − expectedAssets). */
  readonly feeAssets: Amount
  /** What the user actually receives (the vault's own `assetsAfterFee`). */
  readonly expectedAssets: Amount
  readonly minAssets: Amount
  readonly slippageBips: number
  readonly observedAt: number
}

export interface VaultPosition {
  readonly shares: Amount
  /** The current asset value of the shares, or null if the rate could not be read (renders `—`). */
  readonly assetsValue: Amount | null
}

export type DepositQuoteResult =
  | { readonly kind: 'quote'; readonly quote: DepositQuote }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type WithdrawQuoteResult =
  | { readonly kind: 'quote'; readonly quote: WithdrawQuote }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type VaultPositionResult =
  | { readonly kind: 'position'; readonly position: VaultPosition }
  | { readonly kind: 'no_position'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}

export async function quoteDeposit(
  adapter: VaultAdapter,
  assetsIn: bigint,
  slippageBips: number,
  now: number,
): Promise<DepositQuoteResult> {
  const { asset, share } = adapter.config
  if (assetsIn <= 0n) return { kind: 'unavailable', reason: `Enter an amount of ${asset.symbol} to deposit.` }
  try {
    const [expectedShares, rate] = await Promise.all([adapter.reads.previewDeposit(assetsIn), adapter.reads.rate()])
    return {
      kind: 'quote',
      quote: {
        assetsIn: amount(assetsIn, asset.decimals, asset.symbol),
        expectedShares: amount(expectedShares, share.decimals, share.symbol),
        minShares: amount(floor(expectedShares, slippageBips), share.decimals, share.symbol),
        rate,
        slippageBips,
        observedAt: now,
      },
    }
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, `Could not quote the ${asset.symbol} deposit`) }
  }
}

export async function quoteWithdraw(
  adapter: VaultAdapter,
  shares: bigint,
  route: ExitRoute,
  slippageBips: number,
  now: number,
): Promise<WithdrawQuoteResult> {
  const { asset, share } = adapter.config
  if (shares <= 0n) return { kind: 'unavailable', reason: `Choose how much ${share.symbol} to withdraw.` }
  if (!adapter.config.exitModes.includes(route)) {
    return { kind: 'unavailable', reason: `This vault does not offer an ${route} exit.` }
  }
  try {
    const { assets, assetsAfterFee } = await adapter.reads.previewWithdraw(shares, route)
    return {
      kind: 'quote',
      quote: {
        route,
        shares: amount(shares, share.decimals, share.symbol),
        grossAssets: amount(assets, asset.decimals, asset.symbol),
        feeAssets: amount(assets - assetsAfterFee, asset.decimals, asset.symbol),
        expectedAssets: amount(assetsAfterFee, asset.decimals, asset.symbol),
        minAssets: amount(floor(assetsAfterFee, slippageBips), asset.decimals, asset.symbol),
        slippageBips,
        observedAt: now,
      },
    }
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, `Could not quote the ${share.symbol} withdrawal`) }
  }
}

export async function readVaultPosition(adapter: VaultAdapter, owner: Address): Promise<VaultPositionResult> {
  const { asset, share } = adapter.config
  let shares: bigint
  try {
    shares = await adapter.reads.shareBalance(owner)
  } catch (error) {
    // A failed balance read is UNAVAILABLE — never a confident "no position" (M6 F1).
    return { kind: 'unavailable', reason: reasonOf(error, `Could not read your ${share.symbol} balance`) }
  }
  if (shares <= 0n) return { kind: 'no_position', message: `You hold no ${share.symbol}.` }
  let assetsValue: Amount | null = null
  try {
    const rate = await adapter.reads.rate()
    const shareUnit = 10n ** BigInt(share.decimals)
    assetsValue = amount((shares * rate) / shareUnit, asset.decimals, asset.symbol)
  } catch {
    // rate unknown → assetsValue stays null and renders as `—`, never a guess
  }
  return { kind: 'position', position: { shares: amount(shares, share.decimals, share.symbol), assetsValue } }
}
