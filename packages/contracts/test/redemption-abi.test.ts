import { describe, expect, it } from 'vitest'
import { encodeFunctionData, getAbiItem } from 'viem'
import { assetManagerAbi } from '../src/abis.js'

// M1-R1. Transcribed from IAssetManager.sol and IAssetManagerEvents.sol.

describe('redeem', () => {
  it('is lot-based, payable, and returns the redeemed amount', () => {
    const item = getAbiItem({ abi: assetManagerAbi, name: 'redeem' })
    expect(item?.stateMutability).toBe('payable')
    expect(item?.inputs.map((i) => i.type)).toEqual(['uint256', 'string', 'address'])
    expect(item?.outputs?.[0]?.type).toBe('uint256')
  })

  it('encodes a one-lot redemption to an XRPL address', () => {
    const data = encodeFunctionData({
      abi: assetManagerAbi,
      functionName: 'redeem',
      args: [1n, 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio', '0x0000000000000000000000000000000000000000'],
    })
    expect(data).toMatch(/^0x[0-9a-f]+$/)
  })
})

describe('the redemption request', () => {
  it('can be read back by id', () => {
    expect(getAbiItem({ abi: assetManagerAbi, name: 'redemptionRequestInfo' })).toBeDefined()
  })

  it('carries every field the surface must show', () => {
    const event = getAbiItem({ abi: assetManagerAbi, name: 'RedemptionRequested' })
    const names = event?.inputs.map((i) => i.name)
    for (const field of [
      'agentVault',
      'requestId',
      'paymentAddress',
      'valueUBA',
      'feeUBA',
      'lastUnderlyingTimestamp',
      'paymentReference',
      'executor',
    ]) {
      expect(names).toContain(field)
    }
  })

  it('indexes the redeemer and request id, so a holder can find their own', () => {
    // Unlike the minting events, these are indexed — a redeemer can filter.
    const event = getAbiItem({ abi: assetManagerAbi, name: 'RedemptionRequested' })
    const indexed = event?.inputs.filter((i) => i.indexed).map((i) => i.name)
    expect(indexed).toContain('redeemer')
    expect(indexed).toContain('requestId')
  })
})

describe('the outcomes', () => {
  it('knows success', () => {
    expect(getAbiItem({ abi: assetManagerAbi, name: 'RedemptionPerformed' })).toBeDefined()
  })

  it('knows the ways it can go wrong, each by name', () => {
    // Each is a distinct protocol outcome, not one generic failure.
    for (const name of [
      'RedemptionDefault',
      'RedemptionRejected',
      'RedemptionPaymentBlocked',
      'RedemptionPaymentFailed',
    ] as const) {
      expect(getAbiItem({ abi: assetManagerAbi, name })).toBeDefined()
    }
  })
})

describe('recovery entry points', () => {
  it('offers default-to-collateral, which needs a non-existence proof', () => {
    const item = getAbiItem({ abi: assetManagerAbi, name: 'redemptionPaymentDefault' })
    expect(item?.inputs).toHaveLength(2)
    // A different attestation type from XRPPayment: proving a payment did NOT
    // happen is a different request.
    expect(item?.inputs[0]?.type).toBe('tuple')
    expect(item?.inputs[1]?.type).toBe('uint256')
  })

  it('offers the agent’s own confirmation path', () => {
    expect(getAbiItem({ abi: assetManagerAbi, name: 'confirmRedemptionPayment' })).toBeDefined()
  })
})
