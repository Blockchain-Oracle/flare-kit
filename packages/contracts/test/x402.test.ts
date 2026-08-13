import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import { X402, x402For, FACILITATOR_ABI, EIP3009_ABI } from '../src/index.js'

// M9-R1/R7: the x402 registry is the one source of truth for the MockUSDT0 (demo)
// token, the facilitator, and the payee, so nothing is hardcoded in a component.
// Every value pinned here was read on-chain by the M9 Task-2 live deploy
// (`reference/contracts/deployments/coston2.json`). MockUSDT0 is a LABELLED DEMO
// token (`demoToken: true` — registry data, never a hand-typed string that could
// drift); it is never rendered as USD₮0 or FXRP. `x402Verified` stays FALSE until the
// Task-11 live settle confirms a real facilitator settlement + resource delivery.
const MOCKUSDT0 = '0x2dA725841FF6F5367E65C5d114aa66C034A3d97b'
const FACILITATOR = '0x57da665Ef6Bd39F82Af6BC0764cd779E9C156DdA'
const PAYEE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

describe('x402 registry (M9-R1/R7)', () => {
  it('carries the deployed MockUSDT0 demo token, facilitator and payee', () => {
    const x = x402For('coston2')
    expect(x).toBeDefined()
    expect(x?.network).toBe('coston2')
    expect(x?.token.address).toBe(MOCKUSDT0)
    expect(x?.token.decimals).toBe(6)
    expect(x?.facilitator).toBe(FACILITATOR)
    expect(x?.payee).toBe(PAYEE)
    // the single fixture endpoint + reference server URL are constants
    expect(x?.serverUrl).toMatch(/^https?:\/\//)
    expect(x?.resourcePath).toBe('/api/demo')
  })

  it('marks the token demoToken:true — the label is registry data', () => {
    expect(x402For('coston2')?.token.demoToken).toBe(true)
  })

  it('carries the on-chain EIP-712 domain name the authorization is signed against', () => {
    // MockUSDT0's EIP-712 domain name is its ERC-20 name "Mock USDT0" (deploy read-back);
    // the x402 signature (Task 9) and the facilitator must agree on this exact string.
    expect(x402For('coston2')?.token.eip712Name).toBe('Mock USDT0')
    expect(x402For('coston2')?.token.eip712Version).toBe('1')
  })

  it('x402Verified is TRUE after the live Coston2 settle + delivery (2026-08-12)', () => {
    // Flipped only after the confirmed facilitator settlement (Task 11): settlement tx
    // 0x2923aa74…, resource HTTP 200 — two independent observed facts.
    expect(x402For('coston2')?.x402Verified).toBe(true)
  })

  it('has no x402 deployment on flare mainnet (testnet-first, demo-only)', () => {
    expect(x402For('flare')).toBeUndefined()
    expect(X402.flare).toBeUndefined()
  })

  it('FACILITATOR_ABI exposes verifyPayment + settlePayment with the payload tuple', () => {
    const settle = getAbiItem({ abi: FACILITATOR_ABI, name: 'settlePayment' })
    const verify = getAbiItem({ abi: FACILITATOR_ABI, name: 'verifyPayment' })
    expect(settle).toBeDefined()
    expect(verify).toBeDefined()
    // both take a single PaymentPayload tuple (from,to,token,value,validAfter,validBefore,nonce,v,r,s)
    const payload = settle?.inputs[0] as unknown as { components: ReadonlyArray<{ name: string }> }
    const comps = payload.components.map((c) => c.name)
    expect(comps).toEqual(['from', 'to', 'token', 'value', 'validAfter', 'validBefore', 'nonce', 'v', 'r', 's'])
  })

  it('EIP3009_ABI exposes transferWithAuthorization, authorizationState and DOMAIN_SEPARATOR', () => {
    expect(getAbiItem({ abi: EIP3009_ABI, name: 'transferWithAuthorization' })).toBeDefined()
    expect(getAbiItem({ abi: EIP3009_ABI, name: 'authorizationState' })).toBeDefined()
    expect(getAbiItem({ abi: EIP3009_ABI, name: 'DOMAIN_SEPARATOR' })).toBeDefined()
  })
})
