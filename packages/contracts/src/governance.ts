import { FLARE_NETWORKS, type FlareNetworkKey } from './chains.js'

/**
 * The governance registry: the one source of truth for the four contracts the M12
 * `GovernanceCard` / proposal surfaces drive — `GovernanceVotePower` (the all-or-nothing
 * governance vote power WNat carries), `PollingFoundation` (foundation proposals, the
 * `IGovernor` surface), `PollingFtso` (management-group proposals) and
 * `PollingManagementGroup`. Governance participation is "delegate governance vote power
 * to a representative, then read/vote on proposals", so the shared object downstream is
 * this contract quartet, not per-screen literals.
 *
 * Unlike `delegation.ts` / `rewards.ts` / `staking.ts` (Coston2-only, `flare:
 * undefined`), governance spans BOTH networks: Coston2 (114) is the write/verify target
 * where the delegate/undelegate round trip runs live (Task 6), and Flare mainnet (14) is
 * the proposal READ LENS — real foundation/management-group proposals live on mainnet, so
 * the discovery/state surface reads them there. Both are populated; neither is invented.
 *
 * Every address here traces to the M12 Task-1 probe
 * (`.thoughts/verification/2026-08-13-m12-probe.json`; Coston2 block 34004061, Flare
 * block 67304803), resolved on-chain by NAME from `FlareContractRegistry.getAllContracts()`
 * on each network (zero drift). None of the four names live in the base `NetworkRegistry`
 * (`addresses.ts` `registryFor`) — it carries WNat/FdcHub/Relay/etc., not the governance
 * quartet — so, exactly like the M10 rewards and M11 staking addresses, they are pinned
 * here once as the single literal and kept honest by the two-network parity test
 * (`manifest-parity.test.ts`). The probe also cross-checked `GovernanceVotePower ==
 * WNat.governanceVotePower()` on both networks (match) and confirmed `GovernorReject` is
 * ABSENT from `getAllContracts()` on both. No second literal exists anywhere else (R2).
 *
 * `governanceVerified` is the M12 analog of `delegationVerified` / `stakeVerified`: the
 * surface is trusted to emit a governance-delegation plan (move real governance vote power to
 * a representative) only after a live run confirms the round trip on-chain. It started `false`
 * on both networks and is now `true` on COSTON2 ONLY, flipped by the Task 6 live round trip on
 * 2026-08-13 — `delegate(0xDddF9918…ea0a)` (tx `0xc0da39ab…19d7`, block 34007574) read back the
 * target through `getDelegateOfAtNow`, and `undelegate()` (tx `0x5537335d…bea7d`, block
 * 34007843) read back the zero address. Evidence:
 * `.thoughts/verification/2026-08-13-m12-governance.md`.
 *
 * Flare mainnet stays `false`: it is the proposal read lens, never a write target this
 * milestone, and no live run has driven a governance delegation there. The rule the flip
 * followed still binds anything that comes after it — never `true` before a confirmed read.
 */

export interface GovernanceDeployment {
  /** GovernanceVotePower — the all-or-nothing governance vote power WNat carries. */
  readonly governanceVotePower: `0x${string}`
  /** PollingFoundation — the `IGovernor` surface for foundation proposals. */
  readonly pollingFoundation: `0x${string}`
  /** PollingFtso — the management-group polling surface (deployed variant). */
  readonly pollingFtso: `0x${string}`
  /** PollingManagementGroup — the management-group membership/registry contract. */
  readonly pollingManagementGroup: `0x${string}`
  /** 114 Coston2 (write/verify target) | 14 Flare (proposal read lens). */
  readonly chainId: number
  /**
   * `true` on Coston2 only, flipped by the live Task 6 round trip (2026-08-13) after the
   * on-chain `getDelegateOfAtNow` read-back confirmed both the delegate and the undelegate.
   * Flare mainnet stays `false` — a read lens, never a write target this milestone. Never
   * `true` before a confirmed read.
   */
  readonly governanceVerified: boolean
}

const GOVERNANCE_INTERNAL: Readonly<Record<FlareNetworkKey, GovernanceDeployment>> = {
  coston2: {
    // Resolved by NAME from FlareContractRegistry.getAllContracts() (probe, Coston2 block
    // 34004061, zero drift). Pinned once — the parity test re-confirms against the live
    // registry. GovernanceVotePower == WNat.governanceVotePower() (probe cross-check).
    governanceVotePower: '0x8e4A2c063E1C82C9f5cb96489c0d2b6d78dF0538',
    pollingFoundation: '0x6D7ca85Cb3451b772B87EBB32A9E5cFc500BfA94',
    pollingFtso: '0x0f86aD3D5a910Bd0D6A73f7c256bDae1A8Ff7563',
    pollingManagementGroup: '0x056A8AcdCd2B5D3bF7a4F1d218B8A1660BB4D912',
    chainId: FLARE_NETWORKS.coston2.id,
    // Flipped by the Task 6 live round trip, 2026-08-13: delegate tx 0xc0da39ab…19d7 (block
    // 34007574) read back the target, undelegate tx 0x5537335d…bea7d (block 34007843) read
    // back the zero address. Evidence: .thoughts/verification/2026-08-13-m12-governance.md.
    governanceVerified: true,
  },
  flare: {
    // Resolved by NAME from FlareContractRegistry.getAllContracts() (probe, Flare block
    // 67304803, zero drift). Mainnet is the proposal READ LENS — real proposals live
    // here (the probe read PollingFtso proposal #1). GovernanceVotePower ==
    // WNat.governanceVotePower() (probe cross-check).
    governanceVotePower: '0x95eD14840d3A1C75b8629Ae5599fe55270C51e04',
    pollingFoundation: '0xc8294a2335C6c45de827121090ce4Ba9977907D2',
    pollingFtso: '0x84e6790c97B48195161f899d3C509711e267B391',
    pollingManagementGroup: '0x1e91A59aaC440D7ecA5EBf58d85903CdB0021812',
    chainId: FLARE_NETWORKS.flare.id,
    // Mainnet is a read lens only — it never flips this milestone.
    governanceVerified: false,
  },
}

export const GOVERNANCE = GOVERNANCE_INTERNAL

/**
 * The governance deployment for a network key. Unlike delegation/rewards/staking, BOTH
 * networks are configured (Coston2 write/verify, Flare mainnet read lens), so this never
 * returns `undefined`.
 */
export function governanceFor(network: FlareNetworkKey): GovernanceDeployment {
  return GOVERNANCE[network]
}
