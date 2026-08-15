import { OBSERVED_SETTINGS, smartAccountsFor } from '@flarekit-dev/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type SmartAccountEvmClient, useSmartAccount } from '../src/use-smart-account.js'

/**
 * `useSmartAccount` — and specifically the SEAM the surfaces depend on and nothing tested:
 * the hook threads `deployment.smartAccountsVerified` into `smartAccountPosition`.
 *
 * Core proves the function honours that flag; only this proves the hook passes the right one.
 * Hardcoding `true` there would have Flare mainnet — a read lens no live run has confirmed —
 * report a position as though the write path were proven, and the `unbuilt` / `unavailable`
 * distinction core just gained would never reach a caller. Found by the M13 test review.
 */

type Hex0x = `0x${string}`
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const ACCOUNT: Hex0x = '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb'
const ZERO: Hex0x = '0x0000000000000000000000000000000000000000'

/** A stub that answers every read the adapter makes, from the observed Coston2 deployment. */
function makeClient(options: { deployed: boolean; failEverything?: boolean } = { deployed: true }): SmartAccountEvmClient {
  const answer = (functionName: string): unknown => {
    switch (functionName) {
      case 'getXrplProviderWallets':
        return OBSERVED_SETTINGS.xrplProviderWallets
      case 'getSourceId':
        // The RAW bytes32 the live controller returned, not a re-encoding of the decoded
        // string — the adapter decodes it, and this asserts it decodes the real value.
        return OBSERVED_SETTINGS.sourceIdRaw
      case 'getPaymentProofValidityDurationSeconds':
        return OBSERVED_SETTINGS.proofValidityDurationSeconds
      case 'getDefaultInstructionFee':
        return OBSERVED_SETTINGS.defaultInstructionFee
      case 'isPaused':
        return false
      case 'getInstructionFee':
        return OBSERVED_SETTINGS.defaultInstructionFee
      case 'getVaults':
        return [
          (OBSERVED_SETTINGS.vaults ?? []).map((vault) => BigInt(vault.vaultId)),
          (OBSERVED_SETTINGS.vaults ?? []).map((vault) => vault.address),
          (OBSERVED_SETTINGS.vaults ?? []).map((vault) => (vault.vaultType === 'firelight' ? 1 : 2)),
        ]
      case 'getAgentVaults':
        return [[1n], ['0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC']]
      case 'getExecutorInfo':
        return [OBSERVED_SETTINGS.defaultExecutor?.address, OBSERVED_SETTINGS.defaultExecutor?.fee]
      case 'getPersonalAccount':
        return ACCOUNT
      case 'getNonce':
        return 0n
      case 'getExecutor':
        return ZERO
      default:
        throw new Error(`unstubbed read: ${functionName}`)
    }
  }

  return {
    async readContract({ functionName }: { functionName: string }) {
      if (options.failEverything) throw new Error('the RPC did not answer')
      return answer(functionName)
    },
    // `getCode` returns `undefined` for an address with no code — a real answer, not a failure.
    async getCode() {
      if (options.failEverything) throw new Error('the RPC did not answer')
      return options.deployed ? ('0x60806040' as Hex0x) : undefined
    },
    async getBalance() {
      if (options.failEverything) throw new Error('the RPC did not answer')
      return 0n
    },
  } as unknown as SmartAccountEvmClient
}

const renderFor = (network: 'coston2' | 'flare', client: SmartAccountEvmClient) =>
  renderHook(() =>
    useSmartAccount({
      deployment: smartAccountsFor(network),
      xrplOwner: XRPL_OWNER,
      publicClient: client,
      pollMs: 1_000_000,
    }),
  )

describe('useSmartAccount — the verified flag reaches the position', () => {
  it('reports an OBSERVED position on the network the live run confirmed', async () => {
    const { result } = renderFor('coston2', makeClient({ deployed: true }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.position.status).toBe('observed')
    expect(result.current.account?.address).toBe(ACCOUNT)
  })

  it('reports UNBUILT on Flare mainnet even though every read succeeded', async () => {
    // The whole point. Mainnet is a read lens: `smartAccountsVerified` is false there, and no
    // quantity of successful reads may turn that into a position.
    const { result } = renderFor('flare', makeClient({ deployed: true }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(smartAccountsFor('flare').smartAccountsVerified).toBe(false)
    expect(result.current.position.status).toBe('unbuilt')
    // …and the READS are still real. The gate withholds the position, not the identity.
    expect(result.current.account?.address).toBe(ACCOUNT)
    expect(result.current.settings).toBeDefined()
  })

  it('distinguishes not-deployed from unavailable on the verified network', async () => {
    const undeployed = renderFor('coston2', makeClient({ deployed: false }))
    await waitFor(() => expect(undeployed.result.current.loaded).toBe(true))
    expect(undeployed.result.current.position.status).toBe('not-deployed')

    const unread = renderFor('coston2', makeClient({ deployed: true, failEverything: true }))
    await waitFor(() => expect(unread.result.current.loaded).toBe(true))
    expect(unread.result.current.position.status).toBe('unavailable')
    // An unreadable controller yields NO settings — never an empty settings object.
    expect(unread.result.current.settings).toBeUndefined()
  })

  it('still catalogues the whole vocabulary when the deployment could not be read', async () => {
    // Eleven rows, every one `unknown`. An empty catalogue would say the protocol has no
    // such instructions rather than that we could not look.
    const { result } = renderFor('coston2', makeClient({ deployed: true, failEverything: true }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.catalogue).toHaveLength(11)
    expect(result.current.catalogue.every((row) => row.availability.kind === 'unknown')).toBe(true)
  })
})
