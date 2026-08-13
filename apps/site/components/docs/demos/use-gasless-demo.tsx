'use client'

import {
  type GaslessOperation,
  type OperationStep,
  MOCK_EPOCH,
  createGasless,
  createMockGaslessAdapter,
  reconcileGaslessPayment,
  reconcileTo,
} from '@flare-kit/core'
import { useGasless } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

/**
 * Two probes, one hook. Both hold the SAME payment the relayer already accepted
 * (`submitted`); they differ only in what the chain answers — no
 * `PaymentExecuted` yet, or the observed one. The hook's poll runs the real
 * `reconcileGaslessPayment` over the real mock adapter's real `paymentSince`
 * read, so the pair shows the rule rather than asserting it: an accepted relay
 * job is `awaiting_external`, and `succeeded` appears only under the read that
 * found the transfer.
 *
 * Values come from the observed live run (2026-08-12, Coston2,
 * `.thoughts/verification/2026-08-12-coston2-live-gasless.json`): 1 FTestXRP
 * moved with the payer paying zero gas.
 */

const NOW = MOCK_EPOCH
const PAYER = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'
const RECIPIENT = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const CODE = `import { type GaslessOperation, reconcileGaslessPayment } from '@flare-kit/core'
import { useGasless } from '@flare-kit/react'
import { GaslessCard } from '@flare-kit/react-ui'
import { useCallback } from 'react'

function Payment({ operation, adapter, payer, recipient, nonce, sinceBlock, token }) {
  // The relayer's HTTP acceptance is not the transfer. succeeded comes only
  // from the on-chain PaymentExecuted read this poll re-runs.
  const reconcile = useCallback(
    async (op: GaslessOperation) =>
      reconcileGaslessPayment(op, await adapter.reads.paymentSince(payer, nonce, sinceBlock), Date.now()),
    [adapter, payer, nonce, sinceBlock],
  )
  const { operation: live, error } = useGasless({ operation, reconcile })

  return (
    <>
      {/* A failed read is not a failed payment — say so, and leave the
          operation where the chain last put it. */}
      {error && <p>Outcome not confirmed yet: {error.message}</p>}
      <GaslessCard
        operation={live ?? operation}
        sendToken={token}
        amountText="1"
        recipientText={recipient}
        relayerUrl="http://localhost:8788"
        networkLabel="Coston2"
      />
    </>
  )
}`

const RELAY_STEPS: OperationStep[] = [
  { id: 'sign', type: 'sign_payment', actor: 'your_wallet', state: 'done', attempts: 0 },
  { id: 'relay', type: 'relay_submit', actor: 'relayer', state: 'pending', attempts: 0 },
]

/** A real record, walked to `submitted` (the relayer took the job) along the real table. */
const SUBMITTED: GaslessOperation = reconcileTo(
  createGasless({
    chainId: 114,
    intent: { network: 'coston2', to: RECIPIENT, amount: 1_000_000n, deadlineSeconds: 3600 },
    now: NOW,
    id: 'op_docs_gasless',
  }),
  'submitted',
  NOW,
  { steps: RELAY_STEPS },
)

// Two mock adapters over the SAME observed forwarder. The mock never invents a
// transfer: `confirmed` is an explicit configuration, absence is in-flight.
const silent = createMockGaslessAdapter()
const executed = createMockGaslessAdapter({ confirmed: true })

const reconcileSilent = async (op: GaslessOperation) =>
  reconcileGaslessPayment(op, await silent.reads.paymentSince(PAYER, 0n, 0n), NOW)
const reconcileExecuted = async (op: GaslessOperation) =>
  reconcileGaslessPayment(op, await executed.reads.paymentSince(PAYER, 0n, 0n), NOW)

function Probe({
  name,
  reconcile,
}: {
  name: string
  reconcile: (op: GaslessOperation) => Promise<GaslessOperation>
}) {
  const { operation, isSettled, error } = useGasless({ operation: SUBMITTED, reconcile })
  return <HookReadout name={name} value={{ isSettled, error: error ?? null, operation }} />
}

export function UseGaslessDemo() {
  return (
    <Preview code={CODE} label="mock gasless adapter">
      <div className="demo-stack">
        <Probe name="useGasless (chain read: no PaymentExecuted)" reconcile={reconcileSilent} />
        <Probe name="useGasless (chain read: PaymentExecuted)" reconcile={reconcileExecuted} />
      </div>
    </Preview>
  )
}
