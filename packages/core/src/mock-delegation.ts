// packages/core/src/mock-delegation.ts
import type { Address, Hex, PublicClient } from 'viem'
import { type FlareNetworkKey, delegationFor } from '@flare-kit/contracts'
import { type DelegationAdapter, type DelegationMode, makeDelegationAdapter } from './delegation-adapter.js'

/**
 * The delegation mock (M10-R8), written AFTER the real Coston2 round trip and copying
 * only what that run observed. It is a labelled fake `PublicClient` the REAL
 * `makeDelegationAdapter` (and, downstream, `buildDelegationPlan` / `reconcileDelegation`)
 * run against unchanged — so a test or demo drives the true code path with no network.
 * Mock mode is explicit: a caller constructs this adapter; nothing ever falls back to it.
 *
 * It REFUSES the unobserved (the M4/M6/M8 mock discipline):
 *  - a network the live run never drove throws, rather than inventing one;
 *  - AMOUNT-mode delegation (`delegationModeOf` 2) was NEVER observed live — Task 5
 *    intentionally omitted it because `delegationModeOf` never resets to NOTSET, and
 *    exercising AMOUNT on the one funded signer would have permanently blocked the
 *    PERCENTAGE round trip (the primary AC). An explicit AMOUNT-mode request THROWS a
 *    loud, clear error rather than fabricating a `succeeded` AMOUNT delegation;
 *  - a `succeeded` delegation is never conjured here — that guarantee falls out of
 *    driving the REAL `reconcileDelegation` against a `delegatesOf` read this mock's
 *    config controls: absence of the target stays `awaiting_external`, never `succeeded`.
 *
 * OBSERVED (live PERCENTAGE round trip 2026-08-12, evidence
 * `.thoughts/verification/2026-08-12-m10-live-delegation.json` +
 * `.thoughts/verification/2026-08-12-m10-delegation.md`): signer `0xA4b05cdB…31Bd9`
 * wrapped 5 C2FLR to WNat (`balanceOf` `0 → 5e18`, tx `0x68d6bb35…c572`), delegated 100%
 * (10000 bips) to FTSO provider `0xB63C1E02a41e975f4d826BD06eccaFaCd5038B5D`
 * (`delegatesOf` = `[{provider,10000}]`, `delegationModeOf` = 1 PERCENTAGE, `votePowerOf`
 * = 0 — fully delegated away, tx `0x7b8fa4e1…681a`), then undelegated (`delegatesOf` =
 * `[]`, mode STAYS 1, `votePowerOf`/`undelegatedVotePowerOf` return to 5e18, tx
 * `0x70ed6dbb…7d3b`), then unwrapped back to native (`5e18 → 0`, tx `0x8b4903ad…13f0`).
 */

export const MOCK_DELEGATION_OBSERVED = {
  signer: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as Address,
  provider: '0xB63C1E02a41e975f4d826BD06eccaFaCd5038B5D' as Address,
  wrapAmount: 5_000_000_000_000_000_000n, // 5 C2FLR wrapped to WNat (5e18)
  nativeBalance: 47_397_233_436_830_560_487n, // signer's native balance at the blank-slate read
  bips: 10_000, // 100% of vote power delegated to the one provider
  // Only `delegateTx` is consumed (the gallery's submitted/awaiting/succeeded delegate states);
  // the wrap/undelegate/unwrap tx hashes had zero consumers, so they are not carried here.
  delegateTx: '0x7b8fa4e1e0460680cb59d5da9291c4a7b9252553e956d801617ca9c54a22681a' as Hex,
} as const

/**
 * Overrides to drive a specific position; every default is the OBSERVED blank-slate
 * state (native balance present, nothing wrapped, mode NOTSET, no delegates). Combine
 * overrides to reproduce the other three observed shapes:
 *  - wrapped: `{ wrappedBalance: wrapAmount, votePower: wrapAmount, undelegatedVotePower: wrapAmount }`
 *  - delegated: `{ wrappedBalance: wrapAmount, mode: 1, delegates: [{address: provider, bips: 10000}], votePower: 0n, undelegatedVotePower: 0n }`
 *  - undelegated: `{ wrappedBalance: wrapAmount, mode: 1, delegates: [], votePower: wrapAmount, undelegatedVotePower: wrapAmount }`
 *    (mode STAYS 1 after undelegating — observed live; `delegationModeOf` never resets
 *    to NOTSET, so the undelegated shape is mode 1 with an empty delegate list, not 0.)
 */
export interface MockDelegationConfig {
  readonly nativeBalance?: bigint
  readonly wrappedBalance?: bigint
  /** 2 (AMOUNT) was never observed live — the factory throws rather than serve it. */
  readonly mode?: DelegationMode
  readonly delegates?: readonly { readonly address: Address; readonly bips: number }[]
  readonly votePower?: bigint
  readonly undelegatedVotePower?: bigint
}

function createMockDelegationClient(wnat: Address, config: MockDelegationConfig): PublicClient {
  const wnatLc = wnat.toLowerCase()
  const mode = config.mode ?? 0
  const delegates = config.delegates ?? []
  return {
    async readContract({ address, functionName }: { address: Address; functionName: string }) {
      if (String(address).toLowerCase() !== wnatLc) {
        throw new Error(`mock-delegation: read on an unobserved contract ${address}`)
      }
      switch (functionName) {
        case 'balanceOf':
          return config.wrappedBalance ?? 0n
        case 'delegationModeOf':
          return BigInt(mode)
        case 'votePowerOf':
          return config.votePower ?? 0n
        case 'undelegatedVotePowerOf':
          return config.undelegatedVotePower ?? 0n
        case 'delegatesOf':
          // (addresses, bips, count, mode) — the exact `IVPTOKEN_ABI` tuple shape.
          return [delegates.map((d) => d.address), delegates.map((d) => BigInt(d.bips)), BigInt(delegates.length), BigInt(mode)]
        default:
          throw new Error(`mock-delegation: unexpected (unobserved) read ${functionName}`)
      }
    },
    async getBalance() {
      return config.nativeBalance ?? MOCK_DELEGATION_OBSERVED.nativeBalance
    },
  } as unknown as PublicClient
}

/**
 * The mock adapter: the REAL `makeDelegationAdapter` over a fake client. The deployment
 * is presented `delegationVerified: true` because the round trip WAS driven live — the
 * same state Task 5's confirmed `delegatesOf` read flipped in `delegation.ts`. Only
 * Coston2 was observed; any other network refuses rather than invent one. An explicit
 * AMOUNT-mode (`mode: 2`) request throws — never observed live, never fabricated.
 */
export function createMockDelegationAdapter(config: MockDelegationConfig = {}, network: FlareNetworkKey = 'coston2'): DelegationAdapter {
  if (config.mode === 2) {
    throw new Error(
      'mock-delegation: AMOUNT-mode delegation was not observed live (Task 5 intentionally omitted it to avoid ' +
        'blocking the PERCENTAGE round trip) — the mock refuses to fabricate a succeeded AMOUNT delegation.',
    )
  }
  const base = delegationFor(network)
  if (!base) throw new Error(`mock-delegation: no delegation deployment was observed live for '${network}' — the mock refuses to invent one.`)
  const deployment = { ...base, delegationVerified: true }
  return makeDelegationAdapter(createMockDelegationClient(deployment.wnat, config), deployment)
}
