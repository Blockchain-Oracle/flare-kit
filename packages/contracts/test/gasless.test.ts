import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import { GASLESS, gaslessFor, FORWARDER_ABI } from '../src/index.js'

// M9-R1: the gasless registry is the one source of truth for the forwarder address
// and the reference relayer URL, so nothing is hardcoded in a component. Every value
// pinned here was read on-chain by the M9 Task-2 live deploy
// (`reference/contracts/deployments/coston2.json`): the GaslessPaymentForwarder at
// 0x7F35…, whose `fxrp()` resolved to FTestXRP 0x0b6A…, and which authorized the
// operator relayer. `gaslessVerified` stays FALSE until the Task-7 live payment
// confirms a gasless FXRP transfer on-chain — the bridgeVerified/withdrawVerified gate.
const FORWARDER = '0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17'
const FTESTXRP = '0x0b6A3645c240605887a5532109323A3E12273dc7'

describe('gasless registry (M9-R1)', () => {
  it('carries the deployed Coston2 forwarder + resolved FXRP with exact addresses', () => {
    const g = gaslessFor('coston2')
    expect(g).toBeDefined()
    expect(g?.network).toBe('coston2')
    expect(g?.forwarder).toBe(FORWARDER)
    expect(g?.fxrp.address).toBe(FTESTXRP)
    expect(g?.fxrp.decimals).toBe(6)
    // the reference relayer base URL is a constant (localhost default; self-hostable)
    expect(g?.relayerUrl).toMatch(/^https?:\/\//)
  })

  it('gaslessVerified is TRUE after the live Coston2 payment (2026-08-12)', () => {
    // Flipped only after the confirmed on-chain PaymentExecuted read (Task 7):
    // payment tx 0x799d3c9e…, payer paid 0 gas for it.
    expect(gaslessFor('coston2')?.gaslessVerified).toBe(true)
  })

  it('has no gasless deployment on flare mainnet (testnet-first)', () => {
    expect(gaslessFor('flare')).toBeUndefined()
    expect(GASLESS.flare).toBeUndefined()
  })

  it('FORWARDER_ABI exposes executePayment, getNonce and the PaymentExecuted event', () => {
    expect(getAbiItem({ abi: FORWARDER_ABI, name: 'executePayment' })).toBeDefined()
    expect(getAbiItem({ abi: FORWARDER_ABI, name: 'getNonce' })).toBeDefined()
    expect(getAbiItem({ abi: FORWARDER_ABI, name: 'fxrp' })).toBeDefined()
    const evt = getAbiItem({ abi: FORWARDER_ABI, name: 'PaymentExecuted' })
    expect(evt?.type).toBe('event')
    // PaymentExecuted(from, to, amount, nonce) — the reconcile read's shape
    expect(evt?.inputs.map((i) => i.name)).toEqual(['from', 'to', 'amount', 'nonce'])
  })
})
