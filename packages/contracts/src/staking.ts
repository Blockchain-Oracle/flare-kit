import type { FlareNetworkKey } from './chains.js'

/**
 * The staking registry: the one source of truth for the three EVM contracts the M11
 * `StakeCard` drives and the P-chain endpoint it reads. Flare staking is "export
 * native to the P-chain → delegate to a validator → the position mirrors back onto
 * the C-chain", so the shared object downstream is the mirror/verifier/reward-manager
 * trio plus the P-chain RPC + bech32 hrp, not per-screen literals.
 *
 * Every value here traces to the M11 Task-1 probe
 * (`.thoughts/verification/2026-08-12-m11-probe.json`, Coston2 block 33976187): the
 * three addresses resolved from `FlareContractRegistry.getAllContracts()` (zero
 * drift), and a blank-slate account reading mirror `balanceOf` 0 and
 * `ValidatorRewardManager.getStateOfRewards` (0,0). Nothing is inferred.
 *
 * Unlike WNat (delegation), these three addresses are NOT part of the base
 * `NetworkRegistry` (`addresses.ts`), so — like the M10 rewards addresses — they are
 * pinned here once as the single literal, resolved by NAME from the live registry and
 * kept honest by the parity test (`manifest-parity.test.ts`). No second literal exists
 * anywhere else (R2).
 *
 * `pChainRpcBase` and `hrp` are the P-chain half of the deployment: the JSON-RPC base
 * the keyless P-chain reads (`platform.getCurrentValidators`/`getStake`/`getMinStake`)
 * hit, and the bech32 human-readable prefix (`costwo` on Coston2, `flare` on mainnet)
 * that P-chain addresses carry.
 *
 * `stakeVerified` is the M11 analog of `delegationVerified` / `bridgeVerified`: the
 * surface is trusted to emit a stake plan and flip the portfolio only after a live run
 * confirms the round trip by reading the on-chain stake position BACK. It starts
 * `false` — the blank-slate probe read 0 mirrored / 0 staked — and flips only when a
 * real stake-position read (the delayed P→C leg reaching `succeeded`) confirms it.
 * Never before.
 */

export interface StakingDeployment {
  /** Always `coston2` here — mainnet is a separately verified milestone. */
  readonly network: FlareNetworkKey
  /** PChainStakeMirror — mirrored P-chain stake vote power. Read via `balanceOf`. */
  readonly pChainStakeMirror: `0x${string}`
  /** PChainStakeMirrorVerifier — the LIVE stake amount/duration limits. */
  readonly pChainStakeMirrorVerifier: `0x${string}`
  /** ValidatorRewardManager — the validator/staking reward claim + read surface. */
  readonly validatorRewardManager: `0x${string}`
  /** The P-chain JSON-RPC base the keyless P-chain reads hit. */
  readonly pChainRpcBase: string
  /** The bech32 human-readable prefix P-chain addresses carry on this network. */
  readonly hrp: 'costwo' | 'flare'
  /** Starts false; flips only after a live stake-position read confirms the round trip. */
  readonly stakeVerified: boolean
}

const STAKING_INTERNAL: Readonly<Record<FlareNetworkKey, StakingDeployment | undefined>> = {
  coston2: {
    network: 'coston2',
    // Resolved by NAME from FlareContractRegistry.getAllContracts() (probe, zero
    // drift). Pinned here once — the parity test re-confirms against the live registry.
    pChainStakeMirror: '0xd2a1Bb23eB350814a30Dd6f9de78Bb2C8fdD9F1D',
    pChainStakeMirrorVerifier: '0xd61d6bEfB3B5C3e1D13b43C46CC1cebA3505a7aF',
    validatorRewardManager: '0x33913AcE907F682E305f36d7538D3cCd37E2cA5B',
    pChainRpcBase: 'https://coston2-api.flare.network/ext/bc/P',
    hrp: 'costwo',
    // Starts false. A live stake round trip flips this only after the on-chain
    // stake-position read-back confirms it (the ≥14-day-locked P→C return reaching
    // `succeeded`). The blank-slate probe read 0 mirrored / 0 staked. Never before.
    stakeVerified: false,
  },
  // Flare mainnet staking is a later, separately-verified milestone — configured only
  // when its own live run confirms the round trip. Mirrors delegation.ts / rewards.ts
  // empty `flare` handling; mainnet addresses are never invented.
  flare: undefined,
}

export const STAKING = STAKING_INTERNAL

/** The staking deployment for a network key, or `undefined` if not configured. */
export function stakingFor(network: FlareNetworkKey): StakingDeployment | undefined {
  return STAKING[network]
}
