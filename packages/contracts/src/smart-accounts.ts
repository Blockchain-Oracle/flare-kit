import { FLARE_NETWORKS, type FlareNetworkKey } from './chains.js'

/**
 * The XRPL-controlled Smart Accounts registry: the one source of truth for the
 * `MasterAccountController`, the diamond that turns an XRPL `Payment` into an action on
 * Flare. Each XRPL address controls exactly one `PersonalAccount`, deployed by `CREATE2`
 * the first time an instruction reaches it.
 *
 * This file is DELIBERATELY THIN, and that is the difference from `governance.ts` /
 * `staking.ts`. Those pin every address a milestone touches. Here only the controller
 * address is a constant, because everything else the controller exposes — the registered
 * operator XRPL wallets, the FDC source id, the payment-proof validity window, the
 * per-instruction fees, the vault ids, the agent vault ids and the default executor — is
 * OPERATOR-MUTABLE SETTINGS, not protocol constants. Freezing an operator's wallet list
 * here would produce a plan that asks a user to sign an XRPL payment to a destination the
 * operator has since retired, and the money would be gone before anything on Flare could
 * refuse it. Those values are read live, per plan, in `smart-accounts/adapter.ts`.
 *
 * The address traces to the M13 Task-1 probe
 * (`.thoughts/verification/2026-08-13-m13-probe.json`), resolved on-chain by NAME from
 * `FlareContractRegistry.getAllContracts()` on BOTH networks, and it is the SAME address
 * on both — which is what makes a personal account network-independent. The parity test
 * re-confirms that against the live registry rather than trusting this literal.
 *
 * `smartAccountsVerified` is the M13 analog of `governanceVerified` / `delegationVerified`:
 * the surface is trusted to emit an instruction plan — which commits a user to an XRPL
 * payment that leaves their wallet before anything on Flare is knowable — only after a live
 * run confirms the round trip on-chain. It starts `false` on both networks.
 */

/**
 * `MasterAccountController`, resolved by NAME from `FlareContractRegistry.getAllContracts()`
 * on Coston2 and Flare mainnet (M13 Task-1 probe). It is the SAME address on both networks,
 * which is the deployment property that makes `getPersonalAccount(xrplAddress)` return the
 * same personal account everywhere. Declared once, so no second literal exists; the
 * per-network identity is asserted live by `manifest-parity.test.ts`.
 */
const MASTER_ACCOUNT_CONTROLLER = '0x434936d47503353f06750Db1A444DBDC5F0AD37c' as const

export interface SmartAccountsDeployment {
  /** `MasterAccountController` — the diamond that dispatches XRPL instructions. */
  readonly masterAccountController: `0x${string}`
  /** 114 Coston2 (write/verify target) | 14 Flare (read lens). */
  readonly chainId: number
  /**
   * `false` on both networks until a live `executeInstruction` round trip reads its own
   * effect back off the chain. Never `true` before a confirmed read.
   */
  readonly smartAccountsVerified: boolean
}

const SMART_ACCOUNTS_INTERNAL: Readonly<Record<FlareNetworkKey, SmartAccountsDeployment>> = {
  coston2: {
    masterAccountController: MASTER_ACCOUNT_CONTROLLER,
    chainId: FLARE_NETWORKS.coston2.id,
    // The write/verify target. Flips only from a live effect read-back (M13-AC4).
    smartAccountsVerified: false,
  },
  flare: {
    masterAccountController: MASTER_ACCOUNT_CONTROLLER,
    chainId: FLARE_NETWORKS.flare.id,
    // A read lens this milestone — never a write target, so it never flips.
    smartAccountsVerified: false,
  },
}

export const SMART_ACCOUNTS = SMART_ACCOUNTS_INTERNAL

/**
 * The smart-accounts deployment for a network key. Both networks are configured (Coston2
 * write/verify, Flare mainnet read lens), so this never returns `undefined`.
 */
export function smartAccountsFor(network: FlareNetworkKey): SmartAccountsDeployment {
  return SMART_ACCOUNTS[network]
}

/**
 * The instruction TYPE occupies the high nibble of the payment reference's first byte.
 *
 * These values are not an arbitrary enumeration: `Instructions.sol` casts the type nibble
 * DIRECTLY into `IVaultsFacet.VaultType` — `Vault.deposit(pa, VaultType(instructionType),
 * vault, amount)` — so the two enumerations are the same numbers by construction, and a
 * vault-bearing instruction whose vault id resolves to a different type is a plan-time
 * refusal rather than a runtime revert. `VAULT_TYPE` below states the other half.
 */
export const INSTRUCTION_TYPE = {
  fxrp: 0,
  firelight: 1,
  upshift: 2,
} as const

export type InstructionTypeName = keyof typeof INSTRUCTION_TYPE

/** `IVaultsFacet.VaultType`. `none` is the unset/invalid slot a registered vault never has. */
export const VAULT_TYPE = {
  none: 0,
  firelight: 1,
  upshift: 2,
} as const

export type VaultTypeName = keyof typeof VAULT_TYPE

/**
 * What the payment reference's 80-bit value field MEANS for a given instruction. One field,
 * five meanings across eleven instructions, so it is carried as typed data and rendered with
 * its denomination named — never as a bare amount.
 */
export type ValueDenomination =
  /** Whole FAsset lots (the AssetManager's lot size, not a token amount). */
  | 'lots'
  /** Drops of the underlying — 6 decimals, the FAsset's smallest unit. */
  | 'drops'
  /** Vault shares in the share token's smallest unit. */
  | 'shares'
  /** A Firelight withdrawal period index. */
  | 'period'
  /** An Upshift claim date encoded as `yyyymmdd`. */
  | 'date'

/**
 * Which of the payment reference's OVERLAPPING tail windows this instruction uses. The
 * windows genuinely overlap — bytes 12–13 are an agent vault id for one command and the
 * first two bytes of a 20-byte recipient address for another — so a decoder that reads
 * every field unconditionally decodes garbage. Decoding dispatches on this.
 */
export type ReferenceTail =
  /** Bytes 12–13 `uint16` agent vault id. */
  | 'agentVault'
  /** Bytes 12–13 agent vault id AND bytes 14–15 `uint16` vault id. */
  | 'agentVaultAndVault'
  /** Bytes 14–15 `uint16` vault id. */
  | 'vault'
  /** Bytes 12–31 a 20-byte EVM address. */
  | 'recipient'
  /** No tail: the value is the whole payload. */
  | 'none'

/**
 * `current` instructions are what a composer may build. `superseded` marks the three legacy
 * collateral-reservation commands: the deployment's own documentation directs users to
 * FAssets minting (which M1 already built) instead, so they are catalogued with that reason
 * and never composable. This is a protocol fact, not an availability read — an instruction
 * can be `current` here and still `unavailable` on a deployment that registers no suitable
 * vault.
 */
export type InstructionStanding = 'current' | 'superseded'

export interface BuiltInInstruction {
  /** The full first byte: high nibble type, low nibble command. */
  readonly id: number
  readonly type: InstructionTypeName
  readonly command: number
  /** The controller's own name for the action. */
  readonly action: string
  readonly denomination: ValueDenomination
  readonly tail: ReferenceTail
  readonly standing: InstructionStanding
}

/**
 * The eleven built-in instructions, exactly as `PaymentReferenceParser.sol` documents and
 * `Instructions.sol` dispatches them. This is the protocol's VOCABULARY, not a claim about
 * what any deployment can serve — availability is derived from live deployment state in
 * `smart-accounts/catalogue.ts`, per R-SA-002's "capability discovery rather than a
 * permanent assumed list".
 */
export const BUILT_IN_INSTRUCTIONS: readonly BuiltInInstruction[] = [
  // FXRP (type 0).
  { id: 0x00, type: 'fxrp', command: 0x0, action: 'collateralReservation', denomination: 'lots', tail: 'agentVault', standing: 'superseded' },
  { id: 0x01, type: 'fxrp', command: 0x1, action: 'transfer', denomination: 'drops', tail: 'recipient', standing: 'current' },
  { id: 0x02, type: 'fxrp', command: 0x2, action: 'redeem', denomination: 'lots', tail: 'none', standing: 'current' },
  // Firelight vaults (type 1).
  { id: 0x10, type: 'firelight', command: 0x0, action: 'collateralReservationAndDeposit', denomination: 'lots', tail: 'agentVaultAndVault', standing: 'superseded' },
  { id: 0x11, type: 'firelight', command: 0x1, action: 'deposit', denomination: 'drops', tail: 'vault', standing: 'current' },
  { id: 0x12, type: 'firelight', command: 0x2, action: 'redeem', denomination: 'shares', tail: 'vault', standing: 'current' },
  { id: 0x13, type: 'firelight', command: 0x3, action: 'claimWithdraw', denomination: 'period', tail: 'vault', standing: 'current' },
  // Upshift vaults (type 2).
  { id: 0x20, type: 'upshift', command: 0x0, action: 'collateralReservationAndDeposit', denomination: 'lots', tail: 'agentVaultAndVault', standing: 'superseded' },
  { id: 0x21, type: 'upshift', command: 0x1, action: 'deposit', denomination: 'drops', tail: 'vault', standing: 'current' },
  { id: 0x22, type: 'upshift', command: 0x2, action: 'requestRedeem', denomination: 'shares', tail: 'vault', standing: 'current' },
  { id: 0x23, type: 'upshift', command: 0x3, action: 'claim', denomination: 'date', tail: 'vault', standing: 'current' },
]

/**
 * The built-in instruction for an id, or `undefined` where the kit does not recognise it.
 * `undefined` is a real answer — a deployment may dispatch an instruction added after this
 * table was written, and the catalogue renders that as `unrecognised` rather than hiding it.
 */
export function builtInInstruction(id: number): BuiltInInstruction | undefined {
  return BUILT_IN_INSTRUCTIONS.find((instruction) => instruction.id === id)
}

/**
 * The vault type a vault-bearing instruction requires, or `undefined` where the instruction
 * targets no vault. Used to refuse, at plan time, a Firelight instruction pointed at an
 * Upshift vault id — which the chain would otherwise discover after the XRPL payment.
 */
export function requiredVaultType(instruction: BuiltInInstruction): VaultTypeName | undefined {
  if (instruction.tail !== 'vault' && instruction.tail !== 'agentVaultAndVault') return undefined
  // The type nibble IS the vault-type enum, so this is a rename, not a lookup table that
  // could drift. `fxrp` never carries a vault tail, and returning `undefined` for it keeps
  // that true by construction rather than by the table happening to have no such row.
  return instruction.type === 'fxrp' ? undefined : instruction.type
}
