import {
  BUILT_IN_INSTRUCTIONS,
  type SmartAccountsDeployment,
  type VaultTypeName,
  VAULT_TYPE,
  masterAccountControllerAbi,
} from '@flare-kit/contracts'
import { type Abi, type PublicClient, hexToString } from 'viem'
import type { toPaymentProofStruct } from '../fdc/families/payment.js'

/**
 * The live reads M13 needs off `MasterAccountController`, and the pure `executeInstruction`
 * call builder — the reads/call-builder seam `governance-adapter.ts` (M12) established.
 *
 * Everything here is READ FRESH. None of it is snapshotted into `@flare-kit/contracts`,
 * because none of it is a protocol constant: the operator can retire an XRPL wallet, change
 * a fee, or add a vault, and a plan built on a stale copy would ask a user to sign an XRPL
 * payment that can never dispatch — after the XRP has already left.
 *
 * HONESTY, the M10/M12 adapter rule: a read that THROWS returns `undefined` and surfaces as
 * `unavailable`. It is never coerced into `0n`, `[]`, `false` or the zero address. A real
 * blank-slate account genuinely reads nonce `0` and the zero address for its pinned
 * executor — those are the true values and are returned as-is, distinct from a failure.
 *
 * The split between ESSENTIAL and optional reads is deliberate. If a wallet list, source
 * id, proof window or default fee cannot be read, no plan can be built at all, so the whole
 * settings object is `undefined`. The vault registry, agent vault registry and default
 * executor are needed only by some instructions, so they carry their own `undefined` and a
 * transfer stays plannable while the vault registry is unreadable.
 */

/** A structured, unsigned call — no signing, no key, no client call happens here. */
export interface SmartAccountCall {
  readonly address: `0x${string}`
  readonly abi: Abi
  readonly functionName: string
  readonly args: readonly unknown[]
  /**
   * `executeInstruction` is payable, and for the FXRP redeem instruction it MUST carry at
   * least the executor fee — see `buildExecuteInstructionCall`.
   */
  readonly value: bigint
}

/** One vault in the CONTROLLER's namespace — not `vaults.ts`'s. The ids are unrelated. */
export interface ControllerVault {
  readonly vaultId: number
  readonly address: `0x${string}`
  readonly vaultType: VaultTypeName | 'unknown'
}

export interface ControllerAgentVault {
  readonly agentVaultId: number
  readonly address: `0x${string}`
}

export interface DeploymentSettings {
  /** The operator XRPL addresses a payment must reach. Never empty on a live deployment. */
  readonly xrplProviderWallets: readonly string[]
  /** e.g. `testXRP` on Coston2, `XRP` on mainnet — decoded from the bytes32. */
  readonly sourceId: string
  readonly sourceIdRaw: `0x${string}`
  /** Seconds from the XRPL block timestamp. 86 400 on Coston2, 7 200 on mainnet. */
  readonly proofValidityDurationSeconds: bigint
  /** Drops. Applies to any instruction with no per-id override. */
  readonly defaultInstructionFee: bigint
  /**
   * Whether the controller is paused. Every dispatch entry point carries `notPaused`, so a
   * paused controller reverts `executeInstruction` — and on mainnet the proof window is two
   * hours, so a pause outlasting it makes the payment permanently undispatchable.
   */
  readonly paused: boolean
  /**
   * Per instruction id, in drops. `undefined` for an id whose fee READ FAILED.
   *
   * It must not fall back to `defaultInstructionFee`, and the deployment proves why: on
   * Flare mainnet the default is 500 000 drops while ids 0x00, 0x02, 0x10, 0x20 and 0x23
   * charge 950 000 (probe, 2026-08-13). `getInstructionFee` already resolves the override
   * internally, so a SUCCESSFUL read never yields `undefined` — the only meaning left for
   * it is "we could not read the fee", and quoting the default there would ask a user to
   * sign a payment 450 000 drops short of what the controller requires. The proof would be
   * refused forever with the XRP already at the operator.
   */
  readonly instructionFees: Readonly<Record<number, bigint | undefined>>
  /** `undefined` when the vault registry could not be read — never an empty list. */
  readonly vaults: readonly ControllerVault[] | undefined
  readonly agentVaults: readonly ControllerAgentVault[] | undefined
  readonly defaultExecutor: { readonly address: `0x${string}`; readonly fee: bigint } | undefined
}

/** `undefined` on throw. Never a fabricated value standing in for an unanswered read. */
async function attempt<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read()
  } catch {
    return undefined
  }
}

function vaultTypeName(raw: number): VaultTypeName | 'unknown' {
  const match = Object.entries(VAULT_TYPE).find(([, value]) => value === raw)
  // A type the kit does not know is `unknown`, not silently coerced to a known one — the
  // whole point of the type check is to refuse a mismatch before the payment is signed.
  return match ? (match[0] as VaultTypeName) : 'unknown'
}

/**
 * Every operator-mutable setting a plan needs. `undefined` when an ESSENTIAL read fails —
 * no plan can be honestly built without the wallet list, source id, proof window and fee.
 */
export async function readDeploymentSettings(
  client: PublicClient,
  deployment: SmartAccountsDeployment,
): Promise<DeploymentSettings | undefined> {
  const address = deployment.masterAccountController
  // The ABI is widened to `Abi` for these dynamic reads: viem's const-ABI inference cannot
  // narrow a `functionName` that is a variable, and the alternative is a call per function.
  const controllerAbi = masterAccountControllerAbi as unknown as Abi
  const read = (functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address, abi: controllerAbi, functionName, args })

  let wallets: readonly string[]
  let sourceIdRaw: `0x${string}`
  let proofWindow: bigint
  let defaultFee: bigint
  let paused: boolean
  try {
    ;[wallets, sourceIdRaw, proofWindow, defaultFee, paused] = (await Promise.all([
      read('getXrplProviderWallets'),
      read('getSourceId'),
      read('getPaymentProofValidityDurationSeconds'),
      read('getDefaultInstructionFee'),
      // ESSENTIAL: an unreadable pause state cannot be assumed false. Doing so would let
      // the plan sign a payment into a paused controller.
      read('isPaused'),
    ])) as [readonly string[], `0x${string}`, bigint, bigint, boolean]
  } catch {
    return undefined
  }

  const feeEntries = await Promise.all(
    BUILT_IN_INSTRUCTIONS.map(async (instruction) => {
      const fee = await attempt(() => read('getInstructionFee', [BigInt(instruction.id)]))
      // No fallback. See the `instructionFees` doc comment — the default is a DIFFERENT
      // number from the per-id fee on a live deployment, so substituting it here would
      // fabricate a price the controller does not charge.
      return [instruction.id, fee as bigint | undefined] as const
    }),
  )

  const vaultsRaw = await attempt(
    () => read('getVaults') as Promise<[readonly bigint[], readonly `0x${string}`[], readonly number[]]>,
  )
  const agentVaultsRaw = await attempt(
    () => read('getAgentVaults') as Promise<[readonly bigint[], readonly `0x${string}`[]]>,
  )
  const executorRaw = await attempt(
    () => read('getExecutorInfo') as Promise<[`0x${string}`, bigint]>,
  )

  return {
    xrplProviderWallets: wallets,
    sourceId: hexToString(sourceIdRaw, { size: 32 }).replace(/\0+$/, ''),
    sourceIdRaw,
    proofValidityDurationSeconds: proofWindow,
    defaultInstructionFee: defaultFee,
    paused,
    instructionFees: Object.fromEntries(feeEntries),
    vaults: vaultsRaw
      ? vaultsRaw[0].map((id, i) => ({
          vaultId: Number(id),
          address: vaultsRaw[1][i]!,
          vaultType: vaultTypeName(Number(vaultsRaw[2][i])),
        }))
      : undefined,
    agentVaults: agentVaultsRaw
      ? agentVaultsRaw[0].map((id, i) => ({
          agentVaultId: Number(id),
          address: agentVaultsRaw[1][i]!,
        }))
      : undefined,
    defaultExecutor: executorRaw ? { address: executorRaw[0], fee: executorRaw[1] } : undefined,
  }
}

/**
 * Whether this XRPL payment has already dispatched. `undefined` on a failed read — and the
 * caller must treat that as "we do not know", never as "not used": planning off a wrong
 * `false` here means submitting a proof the controller will reject.
 */
export async function readTransactionIdUsed(
  client: PublicClient,
  deployment: SmartAccountsDeployment,
  transactionId: `0x${string}`,
): Promise<boolean | undefined> {
  return attempt(
    () =>
      client.readContract({
        address: deployment.masterAccountController,
        abi: masterAccountControllerAbi,
        functionName: 'isTransactionIdUsed',
        args: [transactionId],
      }) as Promise<boolean>,
  )
}

/**
 * The unsigned `executeInstruction` call. Pure: it signs nothing, sends nothing and reads
 * nothing. `proofStruct` is the tuple `toPaymentProofStruct` produces — an `XRPPayment`
 * proof cannot be passed here, and the type system cannot catch that, so the call site
 * must come from `families/payment.ts`.
 *
 * `valueWei` is NOT always zero, and hardcoding it as zero was an M13 review-gate Critical.
 * The FXRP redeem instruction routes `msg.value` down to
 * `PersonalAccount.redeemFXrp`, which does
 * `require(msg.value >= _executorFee, InsufficientFundsForRedeem(_executorFee))`. With a
 * zero value and any non-zero executor fee, a redeem can NEVER dispatch — and by then the
 * XRPL payment is already the operator's. The plan computes this from the live
 * `getExecutorInfo()` read.
 */
export function buildExecuteInstructionCall(
  deployment: SmartAccountsDeployment,
  proofStruct: ReturnType<typeof toPaymentProofStruct>,
  xrplAddress: string,
  valueWei: bigint,
): SmartAccountCall {
  return {
    address: deployment.masterAccountController,
    abi: masterAccountControllerAbi as unknown as Abi,
    functionName: 'executeInstruction',
    args: [proofStruct, xrplAddress],
    value: valueWei,
  }
}
