import {
  type DeploymentSettings,
  type InstructionRow,
  type PersonalAccountState,
  type SmartAccountPositionView,
  type SmartAccountsDeployment,
  buildInstructionCatalogue,
  readDeploymentSettings,
  readPersonalAccount,
  smartAccountPosition,
} from '@flarekit-dev/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
  /**
   * The portfolio-facing projection of the same read (M13-R11), so a host does not re-derive
   * "deployed / not deployed / unbuilt / unavailable" for itself and get one of them wrong.
   * `use-delegation` and `use-governance` expose their positions the same way; M13 shipped
   * `smartAccountPosition` without a caller, which the 2026-08-14 review caught.
   */
  readonly position: SmartAccountPositionView
  /** Always the full instruction vocabulary; availability says what is knowable. */
  readonly catalogue: readonly InstructionRow[]
  /**
   * Whether a FAsset balance was asked for at all. Without this, a planner cannot tell an
   * unread balance from one that was never requested, and reports the second as a failed
   * read — inventing a failure. Only this hook knows, because only it sees `fassetToken`.
   */
  readonly balanceRequested: boolean
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

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  // The catalogue is derived, not fetched. Memoised on `settings` so it is a stable
  // reference: recomputing it every render makes any downstream `useMemo` that lists it as
  // a dependency never hit, which is exactly what was happening in `useInstruction`.
  const catalogue = useMemo(() => buildInstructionCatalogue(settings), [settings])

  // A new SUBJECT means the old answers are about somebody else — holding them while the
  // new read is in flight would show one XRPL owner's personal-account ADDRESS under
  // another's name, an address a user can send funds to. Keyed on the subject alone: a
  // manual `refresh()` or a poll-interval change must NOT blank the panel, which is what a
  // reset inside the read effect did.
  useEffect(() => {
    setSettings(undefined)
    setAccount(undefined)
    setLoaded(false)
  }, [deployment, xrplOwner])

  useEffect(() => {
    // PER-EFFECT, not a ref shared across runs. With a shared ref, React runs the old
    // cleanup and then the new effect body — which resets the flag — BEFORE the previous
    // in-flight read resolves. That read then passes its own cancellation check and writes
    // the PREVIOUS subject's account into state, and schedules a timer whose cleanup has
    // already run, leaking one poll loop per dependency change. `use-governance.ts` uses
    // this shape for the same reason.
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined


    const read = async () => {
      setLoading(true)
      const [nextSettings, nextAccount] = await Promise.all([
        readDeploymentSettings(publicClient, deployment),
        readPersonalAccount(publicClient, deployment, xrplOwner, fassetToken),
      ])
      if (!live) return
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
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [deployment, xrplOwner, publicClient, fassetToken, pollMs, tick])

  return {
    settings,
    account,
    catalogue,
    // The verified flag comes from the DEPLOYMENT being read, so a host cannot point this at
    // one network and gate it on another's flag.
    position: smartAccountPosition(account, deployment.smartAccountsVerified),
    balanceRequested: fassetToken !== undefined,
    loading,
    loaded,
    refresh,
  }
}
