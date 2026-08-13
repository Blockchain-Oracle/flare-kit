'use client'

import { familyFor } from '@flare-kit/contracts'
import { type AttestationChainState, type AttestationIntent } from '@flare-kit/core'
import { useAttestation } from '@flare-kit/react'
import { OWNER, SUBMITTED } from '@gallery/m3-sections'
import { useEffect, useRef } from 'react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { useAttestation } from '@flare-kit/react'
import { AttestationTimeline } from '@flare-kit/react-ui'

function Attest({ intent, hasConsumer }) {
  const { request, operation, waitingReason } = useAttestation({
    read: readAttestationState, // live: what the chain says about this request
  })

  // Returns the moment the record exists. It does not await the verifier, the
  // round, the data availability layer or the chain.
  if (!operation) {
    return (
      <button type="button" onClick={() => request(intent, hasConsumer)}>
        Request the attestation
      </button>
    )
  }

  return (
    <AttestationTimeline
      operation={operation}
      now={Date.now()}
      unknownReason={waitingReason}
    />
  )
}`

/** The family the live run of 2026-08-04 drove, read from the shipped table. */
const FAMILY = familyFor('XRPPayment')!

const INTENT: AttestationIntent = {
  familyName: FAMILY.name,
  source: FAMILY.sources.coston2[0]!,
  input: {},
  proofOwner: OWNER,
}

/** The provider's default reconcile interval, which the read is paced to. */
const POLL_MS = 2_000

/** How long this demo leaves the voting round open before it finalizes. */
const ROUND_OPEN_MS = 6_000

/**
 * What the mock says the protocol has shown, in the two phases the live run
 * passed through. Both are the gallery's `SUBMITTED` fixture — a request that is
 * on chain — and they differ only in whether the round has closed.
 */
function reading(requestedAt: number, now: number): AttestationChainState {
  const roundOpen = now - requestedAt < ROUND_OPEN_MS
  return {
    requestBytes: SUBMITTED.requestBytes,
    submissionTxHash: SUBMITTED.submissionTxHash,
    votingRoundId: SUBMITTED.votingRoundId,
    roundFinalized: !roundOpen,
    proofAvailable: false,
    // Stated only while the round is open. Once it has closed, nobody can say
    // when the data availability layer will have indexed it — that gap ran to
    // minutes on 2026-08-04 — and a deadline here would be an invented one.
    ...(roundOpen ? { expectedFinalizedAt: requestedAt + 180_000 } : {}),
  }
}

/**
 * The hook runs for real against the mock kit.
 *
 * `request` is driven here because it moves nothing: it creates the durable
 * record and registers it, with no wallet, no fee and no submission — those
 * belong to the caller's own submit path. What the mock stands in for is the
 * *reading*, and it stops where the honest states are: the round open, then the
 * round finalized with no proof published yet. Neither is a failure and neither
 * is a success, so the operation sits in `awaiting_external` and says which
 * wait it is.
 */
function Probe() {
  const started = useRef(false)
  const requestedAt = useRef(0)

  const { request, operation, error, isSettled, waitingReason } = useAttestation({
    read: async () => {
      // Paced like a chain read, which takes time to come back. Each answer
      // reconciles the record, and each reconcile asks for the next answer.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_MS)
      })
      return reading(requestedAt.current, Date.now())
    },
  })

  useEffect(() => {
    // `request` is stable, and the guard is what keeps this to exactly one
    // record rather than one per render.
    if (started.current) return
    started.current = true
    requestedAt.current = Date.now()
    request(INTENT, FAMILY.hasDeployedConsumer)
  }, [request])

  return (
    <HookReadout
      name="useAttestation"
      value={{
        isSettled,
        waitingReason: waitingReason ?? null,
        error: error ?? null,
        operation: operation
          ? {
              id: operation.id,
              capability: operation.capability,
              network: operation.network,
              state: operation.state,
              steps: operation.steps,
              awaiting: operation.awaiting,
              recovery: operation.recovery,
              evidence: operation.evidence,
              createdAt: operation.createdAt,
              updatedAt: operation.updatedAt,
            }
          : null,
      }}
    />
  )
}

export function UseAttestationDemo() {
  return (
    <Preview code={CODE} label="mock kit — compressed round clock">
      <MockKitProvider>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
