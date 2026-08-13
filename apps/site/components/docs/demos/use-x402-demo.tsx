'use client'

import {
  type OperationStep,
  type X402Operation,
  MOCK_EPOCH,
  createX402,
  mockX402Challenge,
  mockX402Outcome,
  reconcileTo,
  reconcileX402,
} from '@flare-kit/core'
import { useX402 } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

/**
 * Two probes, one hook. Both hold the SAME signed request whose settlement the
 * facilitator already took, and both read the SAME settled payment — they differ
 * only in whether the resource came back. The hook's poll runs the real
 * `reconcileX402` over the mock's observed outcomes, so the pair shows what a
 * single "did it work?" flag cannot: one settlement, two operation states,
 * because settlement-on-chain and resource-delivered are independent facts.
 *
 * The challenge and the settlement come from the observed live run (2026-08-12,
 * Coston2, `.thoughts/verification/2026-08-12-coston2-live-x402.json`): 0.1
 * mUSDT0 (a demo token) settled by the facilitator, then a synthetic resource
 * body.
 */

const NOW = MOCK_EPOCH
const CHALLENGE = mockX402Challenge(NOW)

const CODE = `import { reconcileX402, type X402Operation } from '@flare-kit/core'
import { useX402 } from '@flare-kit/react'
import { X402Card } from '@flare-kit/react-ui'
import { useCallback } from 'react'

function Paywall({ operation, readSettlement, readResource, challenge }) {
  // Two legs, two reads. Neither one alone concludes the operation: settled +
  // delivered is succeeded, settled + failed resource is partially_succeeded.
  const reconcile = useCallback(
    async (op: X402Operation) =>
      reconcileX402(op, await readSettlement(), await readResource(), Date.now()),
    [readSettlement, readResource],
  )
  const { operation: live, error } = useX402({ operation, reconcile })

  return (
    <>
      {/* A read that failed is not a payment that failed. */}
      {error && <p>Outcome not confirmed yet: {error.message}</p>}
      <X402Card
        operation={live ?? operation}
        challenge={challenge}
        amountText="0.1 mUSDT0"
        networkLabel="Coston2"
      />
    </>
  )
}`

const SETTLE_STEPS: OperationStep[] = [
  { id: 'sign', type: 'sign_authorization', actor: 'your_wallet', state: 'done', attempts: 0 },
  { id: 'settle', type: 'settle_and_fetch', actor: 'provider', state: 'pending', attempts: 0 },
]

/** A real record, walked to `submitted` along the real transition table. */
const SUBMITTED: X402Operation = reconcileTo(
  createX402({
    chainId: 114,
    intent: { network: 'coston2', resource: CHALLENGE.resource },
    now: NOW,
    id: 'op_docs_x402',
  }),
  'submitted',
  NOW,
  { steps: SETTLE_STEPS },
)

// The same observed settlement under two resource outcomes. The mock never
// invents a settlement: its default is `pending`. `settled-delivered` is what
// the live run produced; the resource-failed split is a state the caller selects
// — the live fixture delivers atomically, so it is unit-tested rather than
// live-reproducible, and it is labelled here rather than implied to be observed.
const delivered = mockX402Outcome('settled-delivered')
const resourceFailed = mockX402Outcome('settled-resource-failed')

const reconcileDelivered = async (op: X402Operation) =>
  reconcileX402(op, delivered.settlement, delivered.resource, NOW)
const reconcileResourceFailed = async (op: X402Operation) =>
  reconcileX402(op, resourceFailed.settlement, resourceFailed.resource, NOW)

function Probe({
  name,
  reconcile,
}: {
  name: string
  reconcile: (op: X402Operation) => Promise<X402Operation>
}) {
  const { operation, isSettled, error } = useX402({ operation: SUBMITTED, reconcile })
  return <HookReadout name={name} value={{ isSettled, error: error ?? null, operation }} />
}

export function UseX402Demo() {
  return (
    <Preview code={CODE} label="mock x402 outcomes">
      <div style={{ display: 'grid', gap: 18 }}>
        <Probe name="useX402 (settled, resource delivered)" reconcile={reconcileDelivered} />
        <Probe name="useX402 (settled, resource failed)" reconcile={reconcileResourceFailed} />
      </div>
    </Preview>
  )
}
