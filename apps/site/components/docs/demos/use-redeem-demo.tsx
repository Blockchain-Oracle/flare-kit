'use client'

import { type RedeemIntent } from '@flarekit-dev/core'
import { useRedeem } from '@flarekit-dev/react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { formatExact } from '@flarekit-dev/core'
import { useRedeem } from '@flarekit-dev/react'

const intent = { lots: 3, redeemerUnderlyingAddress: 'rPT1Sjq2…dyfzbpAYe' }

function Redeem() {
  const { quote, start, operation, error } = useRedeem()

  // Lot-based, and settled by a counterparty: the quote says both, and says
  // what happens if the agent does not pay, before anything is burned.
  const terms = quote(intent)
  if (!terms.canProceed) return <p>{terms.blockedReason}</p>

  return (
    <>
      <p>{terms.ifAgentDoesNotPay}</p>
      <button type="button" onClick={() => start(intent)}>
        Redeem {formatExact(terms.burned)}
      </button>
    </>
  )
}`

/** Whole lots only — the mock's lot size is 10.000000 FMockXRP, as Coston2's is. */
const INTENT: RedeemIntent = {
  lots: 3,
  redeemerUnderlyingAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

/**
 * The keyless leg, driven for real: `quote` is pure over the protocol snapshot,
 * so it burns nothing and needs no wallet. `start` would burn FAsset, so the
 * docs page does not press it — `operation` is null and says so rather than
 * showing a redemption nobody requested.
 */
function Probe() {
  const { quote, operation, error, isSettled, binding } = useRedeem()
  const quoted = quote(INTENT)

  return (
    <HookReadout
      name="useRedeem"
      value={{
        quote: quoted,
        operation,
        error,
        isSettled,
        binding: { valid: binding.valid, mismatches: binding.mismatches },
      }}
    />
  )
}

export function UseRedeemDemo() {
  return (
    <Preview code={CODE}>
      <MockKitProvider>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
