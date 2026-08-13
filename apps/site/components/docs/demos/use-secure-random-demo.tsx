'use client'

import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { MOCK_INSECURE_ROUNDS, createMockFtsoReader } from '@flare-kit/core'
import { useSecureRandom } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import type { RoundReader } from '@flare-kit/core'
import { isObserved, isRefusal } from '@flare-kit/core'
import { useSecureRandom } from '@flare-kit/react'
import { SecureRandomPanel } from '@flare-kit/react-ui'

export function Random({ reader }: { reader: RoundReader }) {
  const { data, loading, error, refresh } = useSecureRandom({
    reader,
    chainId: 114,
    votingRoundId: 872874n,
    requireSecure: true,
  })

  if (error) return <p>The Relay could not be read: {error}</p>

  // A refusal is the complete answer to the question that was asked. There is
  // no flag to override and no field holding the number it refused.
  if (data && isObserved(data) && isRefusal(data.value)) {
    return <p>{data.value.reason}</p>
  }

  return (
    <SecureRandomPanel
      requireSecure
      loading={loading}
      now={Date.now()}
      onRefresh={refresh}
      {...(data ? { random: data } : {})}
    />
  )
}`

const READER = createMockFtsoReader()
const COSTON2 = FLARE_NETWORKS.coston2.id

/**
 * A round Coston2 genuinely reports as not secure.
 *
 * Sampling 401 rounds across the retained range found four — this is the first
 * of them, taken from the constant that records the sample rather than typed in
 * here, so a re-sample changes this preview instead of leaving it agreeing with
 * a stale number.
 */
const INSECURE_ROUND = MOCK_INSECURE_ROUNDS[0]

/**
 * The real hook running the real `readSecureRandom` with `requireSecure`. What
 * comes back is a refusal carrying its reason and the round it refused — an
 * observed value, and no number anywhere in it.
 */
function Probe() {
  const { data, loading, error } = useSecureRandom({
    reader: READER,
    chainId: COSTON2,
    votingRoundId: INSECURE_ROUND,
    requireSecure: true,
  })
  return (
    <HookReadout name="useSecureRandom" value={{ loading, error: error ?? null, data }} />
  )
}

export function UseSecureRandomDemo() {
  return (
    <Preview code={CODE} label="mock FTSO reader">
      <Probe />
    </Preview>
  )
}
