import { describe, expect, it } from 'vitest'
import { findEvidence } from '../src/evidence.js'
import { quoteDirectMint } from '../src/fassets/direct-mint-quote.js'
import type { DirectMintProtocolState } from '../src/fassets/direct-mint-quote.js'
import type { DirectMintChainState } from '../src/fassets/direct-mint-recovery.js'
import {
  DIRECT_MINT_STEPS,
  attachXrplPayment,
  createDirectMintOperation,
  reconcileDirectMint,
} from '../src/fassets/direct-mint.js'

const NOW = 1_780_000_000_000
const XRPL_TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'

const STATE: DirectMintProtocolState = {
  fAssetSymbol: 'FTestXRP',
  fAssetDecimals: 6,
  xrplDestination: 'rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV',
  feeSettings: { mintingFeeBIPS: 20n, minimumMintingFeeUBA: 1_000_000n, executorFeeUBA: 500_000n },
  largeMintingThresholdUBA: 1_000_000_000n,
  largeMintingDelaySeconds: 3_600n,
  othersCanExecuteAfterSeconds: 600n,
  mintingPaused: false,
  emergencyPaused: false,
}

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

const CHAIN: DirectMintChainState = {
  xrplTxId: XRPL_TX,
  xrplFinal: false,
  proofAvailable: false,
  delayState: 'NotDelayed',
  alreadySettled: false,
}

function newOperation() {
  return createDirectMintOperation({
    quote: quoteDirectMint(STATE, INTENT, NOW),
    intent: INTENT,
    network: 114,
    now: NOW,
  })
}

describe('createDirectMintOperation', () => {
  it('starts ready, with the approved quote attached', () => {
    const op = newOperation()
    expect(op.state).toBe('ready')
    expect(op.capability).toBe('fassets.directMint')
    expect(op.network).toBe(114)
    expect(op.quote?.fAssetSymbol).toBe('FTestXRP')
  })

  it('refuses to create an operation the quote says cannot proceed', () => {
    // AC7: a below-minimum mint never becomes an operation at all.
    const blocked = quoteDirectMint(STATE, { ...INTENT, amountXrp: '0.4' }, NOW)
    expect(() =>
      createDirectMintOperation({ quote: blocked, intent: INTENT, network: 114, now: NOW }),
    ).toThrow(/mints nothing|minimum/i)
  })

  it('lays out the spine with one owning actor per step', () => {
    // DESIGN.md: each row names its owning actor.
    const op = newOperation()
    expect(op.steps.map((s) => s.id)).toEqual([...DIRECT_MINT_STEPS])
    expect(op.steps.map((s) => s.actor)).toEqual([
      'your_wallet',
      'xrpl',
      'fdc',
      'executor',
      'flare',
    ])
  })

  it('records the XRPL destination as evidence before anything is signed', () => {
    const op = newOperation()
    expect(findEvidence(op.evidence, 'xrpl_destination')?.value).toBe(STATE.xrplDestination)
    expect(findEvidence(op.evidence, 'recipient_address')?.value).toBe(INTENT.recipient)
  })
})

describe('attachXrplPayment', () => {
  it('moves to submitted and records the transaction id', () => {
    const op = attachXrplPayment(newOperation(), { xrplTxId: XRPL_TX, at: NOW + 1_000 })
    expect(op.state).toBe('submitted')
    expect(findEvidence(op.evidence, 'xrpl_tx')?.value).toBe(XRPL_TX)
  })

  it('is idempotent, because a duplicate wallet callback is normal', () => {
    const once = attachXrplPayment(newOperation(), { xrplTxId: XRPL_TX, at: NOW + 1_000 })
    const twice = attachXrplPayment(once, { xrplTxId: XRPL_TX, at: NOW + 2_000 })
    expect(twice.evidence.filter((e) => e.kind === 'xrpl_tx')).toHaveLength(1)
    expect(twice.state).toBe('submitted')
  })

  it('adopts the transaction id as the idempotency key (R10)', () => {
    const op = attachXrplPayment(newOperation(), { xrplTxId: XRPL_TX, at: NOW + 1_000 })
    expect(op.idempotencyKey).toBe(XRPL_TX)
  })
})

describe('reconcileDirectMint', () => {
  const submitted = () => attachXrplPayment(newOperation(), { xrplTxId: XRPL_TX, at: NOW + 1_000 })

  it('reconciles from chain evidence rather than from memory (R-OP-007)', () => {
    const op = reconcileDirectMint(submitted(), CHAIN, NOW + 5_000)
    expect(op.state).toBe('confirming')
    expect(op.awaiting?.actor).toBe('xrpl')
  })

  it('advances to awaiting the FDC once the payment is final', () => {
    const op = reconcileDirectMint(submitted(), { ...CHAIN, xrplFinal: true }, NOW + 10_000)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('fdc')
  })

  it('offers the one safe action once the proof exists', () => {
    const op = reconcileDirectMint(
      submitted(),
      { ...CHAIN, xrplFinal: true, proofAvailable: true },
      NOW + 20_000,
    )
    expect(op.state).toBe('action_required')
    expect(op.recovery?.[0]?.id).toBe('execute-direct-minting')
    expect(op.recovery?.[0]?.movesNewValue).toBe(false)
  })

  it('resolves succeeded from chain state alone when already settled (AC8)', () => {
    const op = reconcileDirectMint(
      submitted(),
      { ...CHAIN, xrplFinal: true, proofAvailable: true, alreadySettled: true },
      NOW + 30_000,
    )
    expect(op.state).toBe('succeeded')
    expect(op.recovery ?? []).toEqual([])
  })

  it('is safe to run repeatedly, which is what makes there be no Resume button', () => {
    const chain = { ...CHAIN, xrplFinal: true, proofAvailable: true }
    const once = reconcileDirectMint(submitted(), chain, NOW + 20_000)
    const twice = reconcileDirectMint(once, chain, NOW + 25_000)
    expect(twice.state).toBe(once.state)
    expect(twice.evidence).toEqual(once.evidence)
    expect(twice.attempts).toEqual(once.attempts)
  })

  it('never reports failed while the outcome is merely unknown', () => {
    for (const chain of [
      CHAIN,
      { ...CHAIN, xrplFinal: true },
      { ...CHAIN, xrplFinal: true, proofAvailable: true, delayState: 'Delayed' as const },
      { ...CHAIN, xrplFinal: true, proofAvailable: true, unavailableReason: 'MissingMintingTagManager' },
    ]) {
      expect(reconcileDirectMint(submitted(), chain, NOW + 900_000).state).not.toBe('failed')
    }
  })

  it('carries allowed-at through to the record so the timeline can state it', () => {
    const op = reconcileDirectMint(
      submitted(),
      {
        ...CHAIN,
        xrplFinal: true,
        proofAvailable: true,
        delayState: 'Delayed',
        allowedAt: NOW + 3_600_000,
      },
      NOW + 20_000,
    )
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('flare')
    expect(op.recovery ?? []).toEqual([])
  })

  it('leaves a settled operation alone once it is terminal', () => {
    const settled = reconcileDirectMint(
      submitted(),
      { ...CHAIN, xrplFinal: true, proofAvailable: true, alreadySettled: true },
      NOW + 30_000,
    )
    const again = reconcileDirectMint(settled, CHAIN, NOW + 40_000)
    expect(again.state).toBe('succeeded')
  })
})
