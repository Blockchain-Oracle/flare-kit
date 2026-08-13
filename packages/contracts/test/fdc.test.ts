import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import {
  ATTESTATION_TYPES,
  FDC_PROTOCOL_ID,
  flareSystemsManagerAbi,
  XRPL_REQUIRED_CONFIRMATIONS,
  attestationName,
  fdcHubAbi,
  relayAbi,
  votingRoundIdAt,
} from '../src/index.js'

// Verified in .thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md

describe('attestationName', () => {
  it('matches the worked examples in Flare’s own documentation', () => {
    // UTF-8 of the name, right-padded with zeros to 32 bytes.
    expect(attestationName('AddressValidity')).toBe(
      '0x4164647265737356616c69646974790000000000000000000000000000000000',
    )
    expect(attestationName('testXRP')).toBe(
      '0x7465737458525000000000000000000000000000000000000000000000000000',
    )
    expect(attestationName('EVMTransaction')).toBe(
      '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
    )
  })

  it('always produces exactly 32 bytes', () => {
    expect(attestationName('XRPPayment')).toHaveLength(66)
  })

  it('refuses a name too long to encode rather than truncating it', () => {
    expect(() => attestationName('x'.repeat(33))).toThrow(/32 bytes/)
  })
})

describe('attestation types', () => {
  it('uses XRPPayment, not the chain-agnostic Payment type', () => {
    // FAssets consumes IXRPPayment.Proof. A `Payment` proof does not verify
    // against the AssetManager, and its request body differs.
    expect(ATTESTATION_TYPES.XRPPayment).toBe(attestationName('XRPPayment'))
    expect(ATTESTATION_TYPES.XRPPayment).not.toBe(attestationName('Payment'))
  })
})

describe('votingRoundIdAt', () => {
  // The epoch parameters are on-chain getters, so they are arguments here
  // rather than constants. That is what keeps mainnet correct without anyone
  // guessing a start timestamp.
  const COSTON2_START = 1_658_430_000n
  const DURATION = 90n

  it('derives the round from the submitting transaction timestamp', () => {
    expect(votingRoundIdAt(COSTON2_START, COSTON2_START, DURATION)).toBe(0n)
    expect(votingRoundIdAt(COSTON2_START + 89n, COSTON2_START, DURATION)).toBe(0n)
    expect(votingRoundIdAt(COSTON2_START + 90n, COSTON2_START, DURATION)).toBe(1n)
  })

  it('floors rather than rounding, so a request never lands a round early', () => {
    expect(votingRoundIdAt(COSTON2_START + 179n, COSTON2_START, DURATION)).toBe(1n)
  })

  it('reproduces a real round from the documented example', () => {
    // Round 1028678 appears in the FDC-by-hand guide's proof response.
    const round = 1_028_678n
    const someTimestampInThatRound = COSTON2_START + round * DURATION + 45n
    expect(votingRoundIdAt(someTimestampInThatRound, COSTON2_START, DURATION)).toBe(round)
  })

  it('refuses a timestamp before the first voting round began', () => {
    expect(() => votingRoundIdAt(COSTON2_START - 1n, COSTON2_START, DURATION)).toThrow(
      /before/i,
    )
  })
})

describe('protocol constants', () => {
  it('knows the FDC protocol id used for finalization checks', () => {
    expect(FDC_PROTOCOL_ID).toBe(200)
  })

  it('knows XRPL needs three confirmations before a payment can be proven', () => {
    // Requesting attestation earlier is rejected as "too early", not "failed".
    expect(XRPL_REQUIRED_CONFIRMATIONS).toBe(3)
  })
})

describe('abis', () => {
  it('reads the epoch parameters from a contract that implements them', () => {
    // Corrected 2026-08-04 by a live probe: these revert on the deployed Relay
    // despite appearing in IRelay.sol. They are on FlareSystemsManager.
    // See test/fdc-epoch.test.ts and the research brief.
    const names = flareSystemsManagerAbi.map((entry) => entry.name)
    expect(names).toContain('firstVotingRoundStartTs')
    expect(names).toContain('votingEpochDurationSeconds')
  })

  it('can ask Relay whether a round is finalized', () => {
    const item = getAbiItem({ abi: relayAbi, name: 'isFinalized' })
    expect(item?.inputs).toHaveLength(2)
    expect(item?.outputs?.[0]?.type).toBe('bool')
  })

  it('submits an attestation request as payable, with a fee it can read first', () => {
    expect(getAbiItem({ abi: fdcHubAbi, name: 'requestAttestation' })?.stateMutability).toBe(
      'payable',
    )
    expect(getAbiItem({ abi: fdcHubAbi, name: 'getRequestFee' })).toBeDefined()
    expect(getAbiItem({ abi: fdcHubAbi, name: 'AttestationRequest' })).toBeDefined()
  })
})
