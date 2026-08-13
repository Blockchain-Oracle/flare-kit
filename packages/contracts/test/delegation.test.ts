import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import {
  DELEGATION,
  delegationFor,
  IWNAT_ABI,
  IVPTOKEN_ABI,
} from '../src/index.js'
import { registryFor } from '../src/addresses.js'

// M10-R1: the delegation registry is the single source of truth for the WNat
// address the DelegationCard drives and the protocol cap it enforces. Every value
// pinned here was read on-chain by the M10 Task-1 probe
// (`.thoughts/verification/2026-08-12-m10-probe.json`, Coston2 block 33963269):
// WNat resolved from FlareContractRegistry.getAllContracts(), a blank-slate account
// reading delegationModeOf 0 (NOTSET) and delegatesOf ([],[],0,0). `delegationVerified`
// stays FALSE until the Task-5 live round trip confirms a delegatesOf read after a real
// on-chain delegate — the bridgeVerified/gaslessVerified gate.

describe('delegation registry (M10-R1)', () => {
  it('sources WNat by REUSE of the address registry, never a second literal', () => {
    const d = delegationFor('coston2')
    expect(d).toBeDefined()
    expect(d?.network).toBe('coston2')
    // The critical reuse assertion: wnat is the registry-resolved wrappedNative,
    // not a hardcoded copy. registryFor(114) is the Coston2 NetworkRegistry.
    expect(d?.wnat).toBe(registryFor(114).wrappedNative)
  })

  it('carries the Coston2 symbols and the protocol delegation cap', () => {
    const d = delegationFor('coston2')
    expect(d?.nativeSymbol).toBe('C2FLR')
    expect(d?.wrappedSymbol).toBe('WC2FLR')
    // FTSO percentage delegation allows at most two providers.
    expect(d?.maxPercentDelegates).toBe(2)
  })

  it('delegationVerified is TRUE after the Task-5 live round trip', () => {
    // Two-phase by design: flipped to true ONLY after the confirmed delegatesOf
    // read from the real delegate broadcast on Coston2 2026-08-12 (tx
    // 0x7b8fa4e1…681a, delegatesOf=[provider@10000], awaiting_external→succeeded).
    // Evidence: .thoughts/verification/2026-08-12-m10-live-delegation.json. Never before.
    expect(delegationFor('coston2')?.delegationVerified).toBe(true)
  })

  it('has no delegation deployment on flare mainnet (testnet-first)', () => {
    expect(delegationFor('flare')).toBeUndefined()
    expect(DELEGATION.flare).toBeUndefined()
  })

  it('IWNAT_ABI exposes deposit/withdraw/balanceOf', () => {
    const deposit = getAbiItem({ abi: IWNAT_ABI, name: 'deposit' })
    expect(deposit?.stateMutability).toBe('payable')
    expect(getAbiItem({ abi: IWNAT_ABI, name: 'withdraw' })?.inputs.map((i) => i.type)).toEqual([
      'uint256',
    ])
    expect(getAbiItem({ abi: IWNAT_ABI, name: 'balanceOf' })?.outputs.map((o) => o.type)).toEqual([
      'uint256',
    ])
  })

  it('IVPTOKEN_ABI exposes the delegate + read surface the card drives', () => {
    for (const name of [
      'delegate',
      'delegateExplicit',
      'batchDelegate',
      'undelegateAll',
      'undelegateAllExplicit',
      'delegatesOf',
      'votePowerOf',
      'delegationModeOf',
      'undelegatedVotePowerOf',
    ] as const) {
      expect(getAbiItem({ abi: IVPTOKEN_ABI, name })).toBeTruthy()
    }
    // delegate(address,uint256 bips) — the percentage delegation the card uses
    expect(getAbiItem({ abi: IVPTOKEN_ABI, name: 'delegate' })?.inputs.map((i) => i.type)).toEqual([
      'address',
      'uint256',
    ])
    // delegatesOf(address) -> (address[], uint256[], uint256 count, uint256 mode)
    // — the probe-confirmed read shape.
    expect(getAbiItem({ abi: IVPTOKEN_ABI, name: 'delegatesOf' })?.outputs.map((o) => o.type)).toEqual([
      'address[]',
      'uint256[]',
      'uint256',
      'uint256',
    ])
  })
})
