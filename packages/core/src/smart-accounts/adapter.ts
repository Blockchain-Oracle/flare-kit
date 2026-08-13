import {
  BUILT_IN_INSTRUCTIONS,
  type SmartAccountsDeployment,
  type VaultTypeName,
  VAULT_TYPE,
  masterAccountControllerAbi,
} from '@flare-kit/contracts'
import { type Abi, type PublicClient, hexToString } from 'viem'

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
  /** `executeInstruction` is payable; the controller requires no value today. */
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
  /** Per instruction id, in drops. */
  readonly instructionFees: Readonly<Record<number, bigint>>
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
  try {
    ;[wallets, sourceIdRaw, proofWindow, defaultFee] = (await Promise.all([
      read('getXrplProviderWallets'),
      read('getSourceId'),
      read('getPaymentProofValidityDurationSeconds'),
      read('getDefaultInstructionFee'),
    ])) as [readonly string[], `0x${string}`, bigint, bigint]
  } catch {
    return undefined
  }

  const feeEntries = await Promise.all(
    BUILT_IN_INSTRUCTIONS.map(async (instruction) => {
      const fee = await attempt(() => read('getInstructionFee', [BigInt(instruction.id)]))
      // Falling back to the default mirrors the contract, which applies the default to any
      // id with no override. It is not a guess standing in for an unread value.
      return [instruction.id, (fee as bigint | undefined) ?? defaultFee] as const
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
 */
export function buildExecuteInstructionCall(
  deployment: SmartAccountsDeployment,
  proofStruct: unknown,
  xrplAddress: string,
): SmartAccountCall {
  return {
    address: deployment.masterAccountController,
    abi: masterAccountControllerAbi as unknown as Abi,
    functionName: 'executeInstruction',
    args: [proofStruct, xrplAddress],
    value: 0n,
  }
}
