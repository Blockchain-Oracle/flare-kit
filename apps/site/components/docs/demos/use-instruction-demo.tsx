'use client'

import { smartAccountsFor } from '@flarekit-dev/contracts'
import {
  OBSERVED_ACCOUNT_FUNDED,
  OBSERVED_SETTINGS,
  OBSERVED_TRANSFER,
  mockInstructionCatalogue,
  mockInstructionRecord,
  mockObservation,
} from '@flarekit-dev/core'
import { useInstruction } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { smartAccountsFor } from '@flarekit-dev/contracts'
import { useInstruction, useSmartAccount } from '@flarekit-dev/react'
import { InstructionComposer } from '@flarekit-dev/react-ui'

const deployment = smartAccountsFor('coston2')

export function Instruction({ xrplOwner, publicClient, intent, observe, saved }) {
  const { settings, catalogue, account, balanceRequested } = useSmartAccount({
    deployment,
    xrplOwner,
    publicClient,
  })
  const { plan, record, proofDeadline, reconciling } = useInstruction({
    deployment,
    settings,        // undefined = unreadable controller; the planner refuses on it
    catalogue,
    personalAccount: account,
    intent,          // undefined until the user has chosen one
    balanceRequested,
    operation: saved, // a persisted record resumes reconciling on mount
    observe,         // what you can see of the four legs, on a poll
  })

  return (
    <InstructionComposer
      planResult={plan}
      record={record}
      proofDeadline={proofDeadline}
      now={Date.now()}
      nativeSymbol="C2FLR"
      reconciling={reconciling}
    />
  )
}`

/**
 * Everything this probe is handed comes from what the 2026-08-13 Coston2 runs
 * observed, and nothing here is a second implementation: the catalogue is the
 * real `buildInstructionCatalogue` over the real deployment read, the record is
 * walked along the real transition table, and the hook itself runs the real
 * `planInstruction` and `reconcileInstruction`.
 *
 * Module scope, because the hook keys its poll on `observe`'s identity — a
 * function rebuilt each render would tear the loop down and start it again.
 */
const DEPLOYMENT = smartAccountsFor('coston2')
const CATALOGUE = mockInstructionCatalogue()
const RECORD = mockInstructionRecord(OBSERVED_TRANSFER.intent)

/**
 * The transfer run as it FINISHED: the payment on the ledger, the proof
 * retrieved, `executeInstruction` submitted, the `InstructionExecuted` event
 * read back — and `effectObserved: true`, which is the only reason the record
 * below reaches `succeeded`. Drop that one field and the same observation
 * leaves the operation in flight.
 */
const observe = async () => mockObservation(OBSERVED_TRANSFER, 'settled')

/**
 * The hook runs for real. `plan` is the true planner's output for the transfer
 * against the account as it stood when that run was planned — funded with
 * 2 000 000 drops and not yet deployed — so the plan carries the real 32-byte
 * reference, the operator wallet read off the controller, the fee the
 * controller charges, and the `account_undeployed` warning that moment earned.
 *
 * `record` is reconciled here, not asserted: the real `reconcileInstruction`
 * walks the submitted record under the observation above, and `proofDeadline`
 * is the run's own XRPL ledger close plus the deployment's read proof window.
 */
function Probe() {
  const { plan, record, proofDeadline, reconciling, reconcileNow } = useInstruction({
    deployment: DEPLOYMENT,
    settings: OBSERVED_SETTINGS,
    catalogue: CATALOGUE,
    personalAccount: OBSERVED_ACCOUNT_FUNDED,
    intent: OBSERVED_TRANSFER.intent,
    replayed: false,
    balanceRequested: true,
    operation: RECORD,
    observe,
  })
  return (
    <HookReadout
      name="useInstruction"
      returnType="UseInstructionResult"
      value={{ plan, record, proofDeadline, reconciling, reconcileNow }}
    />
  )
}

export function UseInstructionDemo() {
  return (
    <Preview code={CODE} label="the observed 2026-08-13 Coston2 run">
      <Probe />
    </Preview>
  )
}
