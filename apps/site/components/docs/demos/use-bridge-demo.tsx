'use client'

import {
  type BridgeOperation,
  type OperationStep,
  MOCK_EPOCH,
  createBridge,
  createMockBridgeAdapter,
  reconcileDelivery,
  reconcileTo,
} from '@flare-kit/core'
import { useBridge } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

/**
 * Two probes, one hook. Both hold the SAME submitted send; they differ only in
 * what the destination chain answers — nothing yet, or the observed
 * `OFTReceived`. The hook's poll runs the real `reconcileDelivery` over the real
 * mock adapter's real destination read, so the pair is the proof rather than the
 * claim: a confirmed source receipt sits in `awaiting_external`, and `succeeded`
 * appears only under the read that found the delivery.
 *
 * Values come from the observed live run (2026-08-11, Coston2 → Sepolia,
 * `.thoughts/verification/2026-08-11-coston2-live-bridge.json`).
 */

const NOW = MOCK_EPOCH
const GUID = '0xd0f1e2c6172a0bec72221e25b95c6c1952c64839073081bf20e2c343c2b22a04'
const RECIPIENT = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const CODE = `import { type BridgeOperation, reconcileDelivery } from '@flare-kit/core'
import { useBridge } from '@flare-kit/react'
import { BridgeCard } from '@flare-kit/react-ui'
import { useCallback } from 'react'

function Delivery({ operation, adapter, guid, sinceBlock, route }) {
  // Delivery lands on the DESTINATION chain, so the source receipt concludes
  // nothing. Memoise the reconcile or the interval is torn down every render.
  const reconcile = useCallback(
    async (op: BridgeOperation) =>
      reconcileDelivery(op, await adapter.reads.delivery(guid, sinceBlock), Date.now()),
    [adapter, guid, sinceBlock],
  )
  const { operation: live, error } = useBridge({ operation, reconcile })

  return (
    <>
      {/* error is a failed READING, not a failed delivery: the operation stays
          where the chain last put it. */}
      {error && <p>Could not read the destination chain: {error.message}</p>}
      <BridgeCard
        operation={live ?? operation}
        route={route}
        sendToken={route.asset}
        receiveToken={route.asset}
        networkLabel="Coston2"
      />
    </>
  )
}`

const SEND_STEPS: OperationStep[] = [
  { id: 'send', type: 'bridge_send', actor: 'your_wallet', state: 'done', attempts: 0 },
  { id: 'deliver', type: 'await_delivery', actor: 'executor', state: 'pending', attempts: 0 },
]

/** A real record, walked to `submitted` along the real transition table. */
const SUBMITTED: BridgeOperation = reconcileTo(
  createBridge({
    chainId: 114,
    intent: {
      routeKey: 'coston2-sepolia',
      amountIn: 1_000_000n,
      slippageBips: 50,
      deadline: Math.floor(NOW / 1000) + 600,
      recipient: RECIPIENT,
    },
    now: NOW,
    id: 'op_docs_bridge',
  }),
  'submitted',
  NOW,
  { steps: SEND_STEPS },
)

// Two mock adapters over the SAME observed route. The mock never invents a
// delivery: `delivered` is an explicit configuration, absence is in-flight.
const inFlight = createMockBridgeAdapter('coston2-sepolia')
const landed = createMockBridgeAdapter('coston2-sepolia', { delivered: true })

const reconcileInFlight = async (op: BridgeOperation) =>
  reconcileDelivery(op, await inFlight.reads.delivery(GUID, 0n), NOW)
const reconcileLanded = async (op: BridgeOperation) =>
  reconcileDelivery(op, await landed.reads.delivery(GUID, 0n), NOW)

function Probe({
  name,
  reconcile,
}: {
  name: string
  reconcile: (op: BridgeOperation) => Promise<BridgeOperation>
}) {
  const { operation, isSettled, error } = useBridge({ operation: SUBMITTED, reconcile })
  return <HookReadout name={name} value={{ isSettled, error: error ?? null, operation }} />
}

export function UseBridgeDemo() {
  return (
    <Preview code={CODE} label="mock bridge adapter">
      <div style={{ display: 'grid', gap: 18 }}>
        <Probe name="useBridge (destination read: nothing yet)" reconcile={reconcileInFlight} />
        <Probe name="useBridge (destination read: OFTReceived)" reconcile={reconcileLanded} />
      </div>
    </Preview>
  )
}
