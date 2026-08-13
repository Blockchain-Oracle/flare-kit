import {
  type DeploymentSettings,
  type InstructionRow,
  type PersonalAccountState,
  type SmartAccountsDeployment,
  buildInstructionCatalogue,
  readDeploymentSettings,
  readPersonalAccount,
} from '@flare-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * `useSmartAccount` — the identity read for one XRPL address, on one network.
 *
 * Entirely KEYLESS. This is the milestone's most unusual property and it is deliberate: the
 * subject is an XRPL address, and nothing about reading its personal account requires an EVM
 * account, a wallet, or a signature. An agent, a block explorer or a read-only visitor can
 * inspect any XRPL address's Flare account. Signing enters only at the instruction path,
 * which is a separate concern.
 *
 * `undefined` and `[]` stay distinct all the way out of this hook. `settings === undefined`
 * means the controller could not be read; it never becomes an empty settings object. The
 * catalogue is always a full list of the protocol's vocabulary — when the deployment is
 * unreadable every row carries `availability: 'unknown'` rather than the list being empty,
 * because an empty list would say the protocol has no such instructions.
 */

/** viem's `PublicClient`, named transitively so this package stays viem-free. */
export type SmartAccountEvmClient = Parameters<typeof readDeploymentSettings>[0]

export interface UseSmartAccountInput {
  readonly deployment: SmartAccountsDeployment
  /** The XRPL address that controls the account. Not an EVM address, and not a signer. */
  readonly xrplOwner: string
  readonly publicClient: SmartAccountEvmClient
  /** The FAsset token, so the account's balance can be read alongside its native one. */
  readonly fassetToken?: `0x${string}`
  /** Poll cadence in ms. Default 30s — this is identity state, not an in-flight operation. */
  readonly pollMs?: number
}

export interface UseSmartAccountResult {
  /** `undefined` while loading OR when the controller could not be read. */
  readonly settings: DeploymentSettings | undefined
  /** `undefined` when the account address itself could not be derived. */
  readonly account: PersonalAccountState | undefined
  /** Always the full instruction vocabulary; availability says what is knowable. */
  readonly catalogue: readonly InstructionRow[]
  readonly loading: boolean
  /** True once a read cycle has completed, so "loading" and "unavailable" never blur. */
  readonly loaded: boolean
  refresh(): void
}

export function useSmartAccount(input: UseSmartAccountInput): UseSmartAccountResult {
  const { deployment, xrplOwner, publicClient, fassetToken, pollMs = 30_000 } = input
  const [settings, setSettings] = useState<DeploymentSettings | undefined>(undefined)
  const [account, setAccount] = useState<PersonalAccountState | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [tick, setTick] = useState(0)
  const cancelled = useRef(false)

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    cancelled.current = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const read = async () => {
      setLoading(true)
      const [nextSettings, nextAccount] = await Promise.all([
        readDeploymentSettings(publicClient, deployment),
        readPersonalAccount(publicClient, deployment, xrplOwner, fassetToken),
      ])
      if (cancelled.current) return
      // Both are written even when `undefined`: a read that stops succeeding must stop
      // showing its previous answer, or the surface presents stale data as current.
      setSettings(nextSettings)
      setAccount(nextAccount)
      setLoading(false)
      setLoaded(true)
      timer = setTimeout(() => void read(), pollMs)
    }

    void read()
    return () => {
      cancelled.current = true
      if (timer) clearTimeout(timer)
    }
  }, [deployment, xrplOwner, publicClient, fassetToken, pollMs, tick])

  return {
    settings,
    account,
    catalogue: buildInstructionCatalogue(settings),
    loading,
    loaded,
    refresh,
  }
}
