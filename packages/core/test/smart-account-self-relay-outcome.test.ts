import { describe, expect, it } from 'vitest'
import {
  classifySelfRelayRevert,
  interpretSelfRelayReceipt,
  toMemoObservation,
} from '../src/smart-accounts/self-relay-outcome.js'

/**
 * What a self-relayed submission actually did (M14-R10).
 *
 * Two readings, and neither may invent an outcome: a revert carries a named reason, and a
 * MINED receipt carries events that decide between executed, delayed and burned. The receipt
 * status decides nothing — a rate-limited mint returns without reverting.
 */

const PA = '0x2f1e04eEc8B36F0eF9b8B23cD3E9F0aD2b1c5A77'

describe('PaymentAlreadyConfirmed — a normal condition, absorbed', () => {
  it('is not a failure', () => {
    const outcome = classifySelfRelayRevert('PaymentAlreadyConfirmed')
    expect(outcome.kind).toBe('already-confirmed')
  })

  it('does not by itself mean our instruction ran', () => {
    // The payment is consumed either way: a below-minimum payment is confirmed too, burns to
    // the fee receiver, and never dispatches the memo. So the effect is still unobserved.
    const observation = toMemoObservation(classifySelfRelayRevert('PaymentAlreadyConfirmed'))
    expect(observation.effectObserved).toBeUndefined()
    expect(observation.userOperationExecuted).toBeUndefined()
  })

  it('says a third party may simply have got there first', () => {
    const outcome = classifySelfRelayRevert('PaymentAlreadyConfirmed')
    expect(outcome.kind === 'already-confirmed' && outcome.reason).toMatch(/already|first|confirmed/i)
  })
})

describe('the reverts that are waits, not failures', () => {
  it('carries the allowed-at out of DirectMintingStillDelayed, converted to milliseconds', () => {
    // The contract's timestamp is seconds; every clock in core is epoch milliseconds. Carried
    // raw it dates to 1970 and the wait reads as already over.
    const outcome = classifySelfRelayRevert('DirectMintingStillDelayed', [1_785_823_590n])
    expect(outcome.kind === 'wait' && outcome.availableAt).toBe(1_785_823_590_000)
  })

  it('treats InvalidExecutor as a wait on somebody else, never as our error', () => {
    expect(classifySelfRelayRevert('InvalidExecutor').kind).toBe('wait')
  })

  it('treats a missing smart account manager as protocol availability', () => {
    expect(classifySelfRelayRevert('MissingSmartAccountManager').kind).toBe('unavailable')
  })
})

describe('the reverts that name something to fix', () => {
  it('tells a proof-owner mismatch to re-request the attestation, not to pay again', () => {
    const outcome = classifySelfRelayRevert('OnlyProofOwner')
    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.reason).not.toMatch(/pay again|new payment/i)
  })

  it('points a stuck instruction at the recovery opcodes', () => {
    const outcome = classifySelfRelayRevert('CallFailed')
    expect(outcome.kind === 'refused' && outcome.reason).toMatch(/recover/i)
  })
})

describe('an unrecognised revert', () => {
  it('is unknown, never failed', () => {
    expect(classifySelfRelayRevert('SomethingNobodyTranscribed').kind).toBe('unknown')
  })

  it('is unknown when the revert could not be decoded at all', () => {
    expect(classifySelfRelayRevert(undefined).kind).toBe('unknown')
  })
})

describe('a mined receipt, where the status proves nothing', () => {
  it('reads UserOperationExecuted as the operation having run', () => {
    const outcome = interpretSelfRelayReceipt([
      { eventName: 'DirectMintingExecuted', args: { transactionId: '0xab' } },
      { eventName: 'UserOperationExecuted', args: { personalAccount: PA, nonce: 4n } },
    ])
    expect(outcome.kind === 'executed' && outcome.nonce).toBe(4n)
    expect(outcome.kind === 'executed' && outcome.personalAccount).toBe(PA)
  })

  it('reads a delay as a delay, though the transaction mined successfully', () => {
    const outcome = interpretSelfRelayReceipt([
      { eventName: 'DirectMintingDelayed', args: { executionAllowedAt: 1_785_823_590n } },
    ])
    expect(outcome.kind).toBe('delayed')
    expect(outcome.kind === 'delayed' && outcome.executionAllowedAt).toBe(1_785_823_590_000)
  })

  it('reads a large-mint delay the same way', () => {
    const outcome = interpretSelfRelayReceipt([
      { eventName: 'LargeDirectMintingDelayed', args: { executionAllowedAt: 1_785_823_590n } },
    ])
    expect(outcome.kind).toBe('delayed')
  })

  it('reads the burn, and does not call it a delay', () => {
    const outcome = interpretSelfRelayReceipt([
      { eventName: 'DirectMintingPaymentTooSmallForFee', args: { receivedAmountUBA: 5n } },
    ])
    expect(outcome.kind).toBe('payment-too-small')
  })

  it('is unknown when a mined receipt carries no event we recognise', () => {
    expect(interpretSelfRelayReceipt([]).kind).toBe('unknown')
  })

  it('prefers the burn over the mint event, because both can appear', () => {
    // The fee is minted to the fee receiver before the too-small branch emits, so a receipt
    // can carry a mint event AND the burn. The burn is the one that describes the user.
    const outcome = interpretSelfRelayReceipt([
      { eventName: 'DirectMintingExecuted', args: {} },
      { eventName: 'DirectMintingPaymentTooSmallForFee', args: { receivedAmountUBA: 5n } },
    ])
    expect(outcome.kind).toBe('payment-too-small')
  })
})

describe('feeding the lifecycle', () => {
  it('turns an executed outcome into an observation that still needs the effect', () => {
    const observation = toMemoObservation(
      interpretSelfRelayReceipt([
        { eventName: 'UserOperationExecuted', args: { personalAccount: PA, nonce: 4n } },
      ]),
    )
    expect(observation.userOperationExecuted?.nonce).toBe(4n)
    // `succeeded` needs BOTH the event and the consequence. This half never asserts the other.
    expect(observation.effectObserved).toBeUndefined()
  })

  it('turns a delay into the delayed state, not a failure', () => {
    const observation = toMemoObservation(
      interpretSelfRelayReceipt([
        { eventName: 'DirectMintingDelayed', args: { executionAllowedAt: 1_785_823_590n } },
      ]),
    )
    expect(observation.delayed?.executionAllowedAt).toBe(1_785_823_590_000)
    expect(observation.paymentTooSmall).toBeUndefined()
  })

  it('turns the burn into the one terminal observation this flow has', () => {
    const observation = toMemoObservation(
      interpretSelfRelayReceipt([{ eventName: 'DirectMintingPaymentTooSmallForFee', args: {} }]),
    )
    expect(observation.paymentTooSmall).toBe(true)
  })

  it('records a relay hash when one is supplied, whatever the outcome', () => {
    const observation = toMemoObservation(classifySelfRelayRevert('DirectMintingStillDelayed'), {
      relayHash: '0xfeed',
    })
    expect(observation.relayHash).toBe('0xfeed')
  })
})
