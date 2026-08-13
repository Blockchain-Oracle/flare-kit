// packages/core/src/mock-vault.ts
import type { Address, PublicClient } from 'viem'
import { type VaultConfig, vaultByKey } from '@flare-kit/contracts'
import { type VaultAdapter, makeVaultAdapter } from './vault-adapter.js'

/**
 * The vault mock (M7-R6), written AFTER the real Coston2 round trip and copying only
 * what that run observed. It is a labelled fake `PublicClient`: the REAL adapter,
 * quote and plan code run against it unchanged, so a test or a demo drives the true
 * code path with no network. Mock mode is explicit — a caller constructs this reader;
 * nothing ever falls back to it. It REFUSES the unobserved: a vault key never driven
 * live throws, and any read the run never captured throws loudly rather than return a
 * plausible zero (the M4/M6 mock discipline).
 *
 * OBSERVED (Phase A live run 2026-08-11, evidence
 * `.thoughts/verification/2026-08-11-coston2-live-vault.json`; parameters re-read at
 * Coston2 block 33931384 via `scripts/probe-vault-params.mjs`):
 *
 *  - Firelight is 1:1 (`convertToAssets(1e6) == 1e6`) with no withdrawal fee, and a
 *    custom GLOBAL `depositLimit` 15.000000 against `totalAssets` 14.994061 — only
 *    0.005939 FXRP of real headroom, which standard `maxDeposit` (uint256 max) hides.
 *  - Upshift's exchange rate at the deposit moment was 1.008494 assets/share
 *    (`R = 1008494`); its fee is exact: `net = gross − floor(gross·bips/1e4)`, bips
 *    instant 50 / delayed 25 — verified against three independent live reads. That
 *    single captured rate reproduces the two "predicted == minted exact" headline
 *    settlements to the unit: deposit 1 FXRP → 991577 vFXRP, instant 495788 vFXRP →
 *    497500 FXRP. The delayed request landed 11 blocks later at a marginally higher
 *    rate (net 498759 vs the snapshot's 498750, +0.000009 FXRP) — a yield vault's
 *    rate genuinely moves between blocks, so one frozen snapshot cannot be exact at
 *    three chain moments at once. The mock captures the deposit-moment rate; the drift
 *    is disclosed, not hidden.
 */

const SHARE_UNIT = 1_000_000n // both vaults' shares are 6 dp
const MAX_UINT = (1n << 256n) - 1n

export const MOCK_VAULT_OBSERVED = {
  upshift: {
    rate: 1_008_494n, // assets per 1e6 share units, captured at the deposit block
    instantFeeBips: 50,
    delayedFeeBips: 25,
    deposit: { assetsIn: 1_000_000n, shares: 991_577n },
    instant: { shares: 495_788n, net: 497_500n },
    delayed: { shares: 495_789n, netSnapshot: 498_750n, netLive: 498_759n }, // see the drift note above
    maxWithdrawal: 10_000_000_000n, // maxWithdrawalAmount, 10,000 FXRP
    epoch: { year: 2026, month: 8, day: 12, claimableAt: 1_786_492_800 },
  },
  firelight: {
    depositLimit: 15_000_000n,
    totalAssets: 14_994_061n,
    headroom: 5_939n, // depositLimit − totalAssets
    period: 333n,
    currentPeriodEnd: 1_786_493_151,
  },
} as const

/** The only vaults the live run observed. The mock serves these and refuses the rest. */
const OBSERVED_KEYS = ['firelight-fxrp', 'upshift-fxrp'] as const

/** Overrides for the reads a demo/test wants to drive a specific state from. */
export interface MockVaultConfig {
  readonly assetBalance?: bigint
  readonly assetAllowance?: bigint
  readonly shareBalance?: bigint
  readonly shareAllowance?: bigint
  readonly withdrawPaused?: boolean
  readonly maxWithdrawal?: bigint
  /** Firelight only — override the observed headroom (`depositLimit − totalAssets`). */
  readonly depositLimit?: bigint
  readonly totalAssets?: bigint
  /** Firelight claim reconciliation. */
  readonly currentPeriod?: bigint
  readonly withdrawalAmount?: bigint
  readonly claimed?: boolean
  /** Upshift claim reconciliation — the burnable (claimable) amount for the epoch. */
  readonly burnable?: bigint
}

const convertToShares = (assets: bigint, rate: bigint): bigint => (assets * SHARE_UNIT) / rate
const convertToAssets = (shares: bigint, rate: bigint): bigint => (shares * rate) / SHARE_UNIT
const netOfFee = (gross: bigint, bips: number): bigint => gross - (gross * BigInt(bips)) / 10_000n

/** A fake `PublicClient` returning the observed reads for one vault; refuses the rest. */
export function createMockVaultClient(vaultKey: string, config: MockVaultConfig = {}): PublicClient {
  const cfg = observedConfig(vaultKey)
  const shareAddress = (cfg.share.kind === 'lp' ? cfg.share.address : cfg.address).toLowerCase()
  const assetAddress = cfg.asset.address.toLowerCase()
  const handlers = cfg.protocol === 'firelight' ? firelightHandlers(cfg, config) : upshiftHandlers(cfg, config)

  return {
    async readContract({ address, functionName, args = [] }: { address: Address; functionName: string; args?: readonly unknown[] }) {
      // balanceOf / allowance dispatch by TOKEN — asset vs share are different contracts.
      // A wallet balance is caller-specific, not a protocol observation, so it carries a
      // demo-convenience default (the signer's ~23.8 FXRP on the live run) — this is not
      // the "refuse the unobserved" discipline, which governs the protocol reads below.
      if (functionName === 'balanceOf') {
        const at = String(address).toLowerCase()
        if (at === assetAddress) return config.assetBalance ?? 23_800_000n
        if (at === shareAddress) return config.shareBalance ?? 0n
        throw new Error(`mock vault reader: balanceOf on an unobserved token ${address}`)
      }
      if (functionName === 'allowance') {
        const at = String(address).toLowerCase()
        if (at === assetAddress) return config.assetAllowance ?? MAX_UINT
        if (at === shareAddress) return config.shareAllowance ?? MAX_UINT
        throw new Error(`mock vault reader: allowance on an unobserved token ${address}`)
      }
      const handler = handlers[functionName]
      if (!handler) throw new Error(`mock vault reader: unexpected (unobserved) call ${functionName}`)
      return handler(args)
    },
  } as unknown as PublicClient
}

/**
 * The mock adapter: the REAL `makeVaultAdapter` over the mock client. It presents the
 * observed Coston2 vaults as withdraw-capable (`withdrawVerified: true`) because their
 * withdraw REQUEST was driven live in Phase A — exactly the config `live-vault.mjs`
 * bootstraps from. The live REGISTRY flag flips only after the Phase B claim; the mock
 * is an offline reader of what was observed.
 */
export function createMockVaultAdapter(vaultKey: string, config: MockVaultConfig = {}): VaultAdapter {
  const cfg = observedConfig(vaultKey)
  return makeVaultAdapter(createMockVaultClient(vaultKey, config), { ...cfg, withdrawVerified: true })
}

function observedConfig(vaultKey: string): VaultConfig {
  if (!OBSERVED_KEYS.includes(vaultKey as (typeof OBSERVED_KEYS)[number])) {
    throw new Error(`mock-vault: '${vaultKey}' was never observed live — the mock refuses to invent a vault it did not drive.`)
  }
  const cfg = vaultByKey('coston2', vaultKey)
  if (!cfg) throw new Error(`mock-vault: '${vaultKey}' is not in the Coston2 registry.`)
  return cfg
}

type Handlers = Record<string, (args: readonly unknown[]) => unknown>

function firelightHandlers(_cfg: VaultConfig, config: MockVaultConfig): Handlers {
  const { depositLimit, totalAssets } = MOCK_VAULT_OBSERVED.firelight
  return {
    convertToAssets: ([shares]) => shares as bigint, // 1:1
    previewDeposit: ([assets]) => assets as bigint,
    previewRedeem: ([shares]) => shares as bigint,
    maxDeposit: () => MAX_UINT, // observed: standard maxDeposit ignores the global limit
    depositLimit: () => config.depositLimit ?? depositLimit,
    totalAssets: () => config.totalAssets ?? totalAssets,
    currentPeriod: () => config.currentPeriod ?? MOCK_VAULT_OBSERVED.firelight.period,
    isWithdrawClaimed: () => config.claimed ?? false,
    withdrawalsOf: () => config.withdrawalAmount ?? 0n,
  }
}

function upshiftHandlers(cfg: VaultConfig, config: MockVaultConfig): Handlers {
  const { rate, instantFeeBips, delayedFeeBips, maxWithdrawal } = MOCK_VAULT_OBSERVED.upshift
  return {
    previewRedemption: ([shares, isInstant]) => {
      const gross = convertToAssets(shares as bigint, rate)
      return [gross, netOfFee(gross, isInstant ? instantFeeBips : delayedFeeBips)]
    },
    previewDeposit: ([asset, assets]) => {
      if (String(asset).toLowerCase() !== cfg.asset.address.toLowerCase()) {
        throw new Error(`mock vault reader: previewDeposit for an unobserved asset ${asset}`)
      }
      return [convertToShares(assets as bigint, rate), assets as bigint] // deposit has no fee
    },
    withdrawalsPaused: () => config.withdrawPaused ?? false,
    maxWithdrawalAmount: () => config.maxWithdrawal ?? maxWithdrawal,
    getBurnableAmountByReceiver: () => config.burnable ?? 0n,
  }
}
