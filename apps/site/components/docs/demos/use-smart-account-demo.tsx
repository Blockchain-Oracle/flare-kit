'use client'

import { smartAccountsFor } from '@flarekit-dev/contracts'
import { MOCK_XRPL_OWNER } from '@flarekit-dev/core'
import { type SmartAccountEvmClient, useSmartAccount } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { smartAccountsFor } from '@flarekit-dev/contracts'
import { useSmartAccount } from '@flarekit-dev/react'
import { SmartAccountCard } from '@flarekit-dev/react-ui'

const deployment = smartAccountsFor('coston2')

export function Account({ xrplOwner, publicClient, fassetToken }) {
  const { settings, account, position, catalogue, balanceRequested, loaded } =
    useSmartAccount({
      deployment,
      xrplOwner,    // an XRPL address — this hook never takes an EVM account
      publicClient, // every read here is keyless: no wallet, no signature
      fassetToken,  // optional; without it the FAsset balance is never asked for
    })

  return (
    <SmartAccountCard
      xrplOwner={xrplOwner}
      networks={[
        {
          deployment,
          networkLabel: 'Coston2',
          nativeSymbol: 'C2FLR',
          settings, // undefined = the controller could not be read
          account,  // undefined = even the address could not be derived
        },
      ]}
    />
  )
}`

/**
 * A documentation page has no network, and this client says so on every call
 * rather than answering.
 *
 * The M13 mock deliberately ships no fake `PublicClient` — it ships what the
 * live runs OBSERVED plus the real planner and reconciler, because a mock that
 * invented a smart account would be inventing the one thing the milestone
 * exists to prove. So this page does not stand one up either. What it can show
 * for real is the shape of a read that did not land, which is the hook's
 * hardest promise: every value is absent rather than zero.
 */
const NO_READER = {
  async readContract() {
    throw new Error('no network is attached to this documentation page')
  },
  async getCode() {
    throw new Error('no network is attached to this documentation page')
  },
  async getBalance() {
    throw new Error('no network is attached to this documentation page')
  },
} as unknown as SmartAccountEvmClient

/** Coston2 — the network the live round trip verified, so `position` is not gated. */
const DEPLOYMENT = smartAccountsFor('coston2')

/**
 * The hook runs for real, against a reader that answers nothing. Every absence
 * in the readout is therefore a read that failed, and none of them is a zero:
 * `settings` is `undefined` rather than an empty settings object, `account` is
 * `undefined` rather than an account that does not exist, and `position` is
 * `unavailable` rather than a blank-slate holding.
 *
 * `catalogue` is the one that stays: eleven rows, every availability `unknown`.
 * An empty catalogue would say the protocol has no such instructions rather
 * than that this page could not look.
 *
 * Those eleven rows are identical here, so they are rendered summarised — the
 * shared default expands each one into six lines of the same absence, which is
 * the mistake `InstructionCatalogue` itself avoids by stating a shared reason
 * once. The count stays visible, and the availabilities are listed beside it
 * under the expression that produced them, so "all eleven are unknown" is still
 * something the pane shows rather than something this page asserts.
 */
function Probe() {
  const { settings, account, position, catalogue, balanceRequested, loading, loaded, refresh } =
    useSmartAccount({
      deployment: DEPLOYMENT,
      xrplOwner: MOCK_XRPL_OWNER,
      publicClient: NO_READER,
    })
  return (
    <HookReadout
      name="useSmartAccount"
      returnType="UseSmartAccountResult"
      depth={2}
      value={{
        settings,
        account,
        position,
        catalogue,
        'catalogue.map((row) => row.availability.kind)': catalogue.map(
          (row) => row.availability.kind,
        ),
        balanceRequested,
        loading,
        loaded,
        refresh,
      }}
    />
  )
}

export function UseSmartAccountDemo() {
  return (
    <Preview code={CODE} label="no reader attached">
      <Probe />
    </Preview>
  )
}
