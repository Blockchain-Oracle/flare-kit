'use client'

import { type DirectMintIntent } from '@flare-kit/core'
import { useDirectMint } from '@flare-kit/react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { formatExact } from '@flare-kit/core'
import { useDirectMint } from '@flare-kit/react'

const intent = {
  amountXrp: '25.000000',
  recipient: '0xDeaDbeef…dEaDbeeF',
  xrplAccount: 'rPT1Sjq2…dyfzbpAYe',
}

function Mint() {
  const { quote, start, operation, error } = useDirectMint()

  // Pure arithmetic over the protocol snapshot. No wallet, nothing moved.
  const terms = quote(intent)
  if (!terms.canProceed) return <p>{terms.blockedReason}</p>

  // start() returns undefined when it refuses; the refusal lands in error as
  // a state to render, not an exception to catch at the call site.
  return (
    <button type="button" onClick={() => start(intent)}>
      Send {formatExact(terms.input)}
    </button>
  )
}`

/** The exact terms the readout is computed from. An exact decimal string. */
const INTENT: DirectMintIntent = {
  amountXrp: '25.000000',
  recipient: '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

/**
 * The hook runs for real against the mock kit. Only the keyless leg is driven:
 * `quote` is pure arithmetic over a protocol snapshot, so it needs no wallet
 * and moves nothing. `start` is left to the reader's app — a docs page does not
 * press a button that would commit a payment — so `operation` is honestly null.
 */
function Probe() {
  const { quote, operation, error, isSettled, binding } = useDirectMint()
  // Quoting during render is the supported path: the terms on screen are the
  // terms of this render, and the binding is a ref rather than state for it.
  const quoted = quote(INTENT)

  return (
    <HookReadout
      name="useDirectMint"
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

export function UseDirectMintDemo() {
  return (
    <Preview code={CODE}>
      <MockKitProvider>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
