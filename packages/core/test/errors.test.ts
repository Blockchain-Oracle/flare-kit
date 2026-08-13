import { describe, expect, it } from 'vitest'
import {
  FlareKitError,
  deserializeError,
  isFlareKitError,
  narratesFailure,
  serializeError,
} from '../src/errors.js'

// R-OP (Error object): stable code, domain, cause/provenance, retryability,
// safety class, whether value moved, recommended recovery, support evidence.
// R-OP-008: every retry declares whether it reuses existing evidence or creates
// a new value-moving action. Unsafe resubmission is blocked by default.
// CLAUDE.md: "An unknown outcome is never rendered as failed."

describe('FlareKitError', () => {
  it('carries a stable code, a domain and a recovery class', () => {
    const err = new FlareKitError('XRPL_PAYMENT_NOT_FOUND', {
      domain: 'protocol',
      message: 'No XRPL payment matching the reference was found.',
      recovery: 'reuse_existing',
      valueMoved: 'unknown',
    })
    expect(err.code).toBe('XRPL_PAYMENT_NOT_FOUND')
    expect(err.domain).toBe('protocol')
    expect(err.recovery).toBe('reuse_existing')
    expect(err).toBeInstanceOf(Error)
    expect(isFlareKitError(err)).toBe(true)
  })

  it('preserves its cause so provenance survives a rethrow', () => {
    const root = new Error('ECONNREFUSED')
    const err = new FlareKitError('RPC_UNREACHABLE', {
      domain: 'network',
      message: 'Coston2 RPC did not respond.',
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      cause: root,
    })
    expect(err.cause).toBe(root)
  })

  it('carries support evidence as flat copyable identifiers', () => {
    const err = new FlareKitError('FDC_ROUND_NOT_FINALIZED', {
      domain: 'protocol',
      message: 'The voting round has not finalized yet.',
      recovery: 'wait',
      valueMoved: 'yes',
      evidence: { votingRoundId: '1043912', xrplTxHash: 'ABC123' },
    })
    expect(err.evidence).toEqual({ votingRoundId: '1043912', xrplTxHash: 'ABC123' })
  })

  it('defaults an unspecified outcome to unknown rather than to no', () => {
    const err = new FlareKitError('EXECUTOR_DID_NOT_RUN', {
      domain: 'provider',
      message: 'The executor has not executed the minting.',
      recovery: 'wait',
    })
    expect(err.valueMoved).toBe('unknown')
  })
})

describe('narratesFailure', () => {
  // R-LIFE-006: a timeout must not invent a protocol failure when the canonical
  // outcome remains unknown.
  it('is false when value movement is unknown, however long we have waited', () => {
    const err = new FlareKitError('EXECUTOR_DID_NOT_RUN', {
      domain: 'provider',
      message: 'The executor has not executed the minting.',
      recovery: 'wait',
      valueMoved: 'unknown',
    })
    expect(narratesFailure(err)).toBe(false)
  })

  it('is false while a safe recovery still exists', () => {
    const err = new FlareKitError('MINTING_NOT_EXECUTED', {
      domain: 'protocol',
      message: 'Minting has not been executed.',
      recovery: 'reuse_existing',
      valueMoved: 'yes',
    })
    expect(narratesFailure(err)).toBe(false)
  })

  it('is true only when the taxonomy says nothing further can be done', () => {
    const err = new FlareKitError('QUOTE_EXPIRED', {
      domain: 'input',
      message: 'The quote expired before it was approved.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
    expect(narratesFailure(err)).toBe(true)
  })
})

describe('recovery classes', () => {
  it('separates reusing prior evidence from creating a new payment', () => {
    // R3: "a recovery matrix that distinguishes reusing prior evidence from
    // creating a new payment."
    const reuse = new FlareKitError('MINTING_NOT_EXECUTED', {
      domain: 'protocol',
      message: 'x',
      recovery: 'reuse_existing',
      valueMoved: 'yes',
    })
    const fresh = new FlareKitError('RESERVATION_EXPIRED', {
      domain: 'protocol',
      message: 'x',
      recovery: 'requires_new_value',
      valueMoved: 'no',
    })
    expect(reuse.movesNewValue).toBe(false)
    expect(fresh.movesNewValue).toBe(true)
  })

  it('treats an unknown outcome as blocking a new value-moving action', () => {
    // Unsafe resubmission is blocked by default: if we cannot prove the XRP did
    // not leave, we must not offer to send it again.
    const err = new FlareKitError('XRPL_SUBMISSION_UNCONFIRMED', {
      domain: 'network',
      message: 'x',
      recovery: 'unsafe_no_action',
      valueMoved: 'unknown',
    })
    expect(err.movesNewValue).toBe(false)
    expect(err.blocksResubmission).toBe(true)
  })
})

describe('serialization', () => {
  // The error lands inside a durable operation record, so it must survive
  // structuredClone and JSON without losing its taxonomy.
  it('round-trips through JSON with code, domain, recovery and evidence intact', () => {
    const err = new FlareKitError('FDC_ROUND_NOT_FINALIZED', {
      domain: 'protocol',
      message: 'Round 1043912 is not finalized.',
      recovery: 'wait',
      valueMoved: 'yes',
      evidence: { votingRoundId: '1043912' },
    })
    const revived = deserializeError(JSON.parse(JSON.stringify(serializeError(err))))
    expect(revived.code).toBe(err.code)
    expect(revived.domain).toBe(err.domain)
    expect(revived.recovery).toBe(err.recovery)
    expect(revived.valueMoved).toBe('yes')
    expect(revived.evidence).toEqual({ votingRoundId: '1043912' })
    expect(revived.message).toBe(err.message)
  })

  it('never serializes a raw cause chain that could carry a secret', () => {
    const err = new FlareKitError('WALLET_REJECTED', {
      domain: 'wallet',
      message: 'User rejected the request.',
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      cause: { privateKey: '0xdeadbeef' },
    })
    const wire = JSON.stringify(serializeError(err))
    expect(wire).not.toContain('privateKey')
    expect(wire).not.toContain('deadbeef')
  })
})
