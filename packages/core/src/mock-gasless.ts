// packages/core/src/mock-gasless.ts
import type { Address, Hex, PublicClient } from 'viem'
import { type FlareNetworkKey, gaslessFor } from '@flare-kit/contracts'
import { type GaslessAdapter, type RelayReceipt, makeGaslessAdapter } from './gasless-adapter.js'

/**
 * The gasless mock (M9-R9), written AFTER the real Coston2 payment and copying only
 * what that run observed. It is a labelled fake `PublicClient` plus an overridden
 * relay: the REAL `makeGaslessAdapter`, plan and reconcile code run against it
 * unchanged, so a test or demo drives the true code path with no network. Mock mode is
 * explicit — a caller constructs this reader; nothing ever falls back to it.
 *
 * It REFUSES the unobserved: a network never driven live throws, and a `confirmed`
 * transfer is NEVER fabricated without the caller explicitly asserting the observed
 * on-chain read (`confirmed: true`) — absence is `in-flight`, never a plausible zero
 * (the M4/M6/M8 mock discipline). The relayer's acceptance is never dressed as the
 * transfer: `relay` returns the relay receipt, and `paymentSince` returns the transfer.
 *
 * OBSERVED (live run 2026-08-12, evidence
 * `.thoughts/verification/2026-08-12-coston2-live-gasless.json`): a payer approved once
 * (payer-gassed 0.03351725 C2FLR), drained to ~0, then a relayed PaymentRequest moved
 * 1 FXRP with the payer paying 0 gas; `succeeded` came only from the PaymentExecuted read.
 */

export const MOCK_GASLESS_OBSERVED = {
  approvalGasC2flrWei: 33_517_250_000_000_000n, // 0.03351725 C2FLR the payer paid, once
  drainResidualWei: 1_365_000_000_000_000n, // 0.001365 C2FLR left after the drain
  paymentAmount: 1_000_000n, // 1 FXRP transferred (payer −1, recipient +1)
  paymentTx: '0x799d3c9eb0893643d418f334cb15d97cc6b2140d541bd46cef6901938f5b02d4' as Hex,
  approvalTx: '0x753a184f770f1b745b5cc0698bcf540833b35cc73689cadf3583233682137ca5' as Hex,
  decimals: 6,
} as const

const MOCK_LATEST_BLOCK = 25n // bounds the adapter's chunked scan; drive reads with since = 0n
const BIG = 1n << 100n

/** The relay outcome: `accepted` (the observed default) or a refusal shape. */
export type MockRelayOutcome = 'accepted' | 'unreachable' | { readonly rejected: string }

/** Overrides to drive a specific state; every default is an OBSERVED value. */
export interface MockGaslessConfig {
  readonly balance?: bigint
  /** 0 → the one-time approval is still needed; MaxUint256 → already approved. */
  readonly allowance?: bigint
  readonly nonce?: bigint
  /** Has the on-chain PaymentExecuted landed? A `confirmed` transfer requires this. */
  readonly confirmed?: boolean
  readonly confirmedAmount?: bigint
  readonly relay?: MockRelayOutcome
  readonly relayTxHash?: Hex
}

function createMockClient(fxrp: Address, forwarder: Address, config: MockGaslessConfig): PublicClient {
  const fxrpLc = fxrp.toLowerCase()
  const nonce = config.nonce ?? 0n
  return {
    async readContract({ address, functionName }: { address: Address; functionName: string }) {
      switch (functionName) {
        case 'fxrp':
          return fxrp
        case 'getNonce':
          return nonce
        case 'decimals':
          return MOCK_GASLESS_OBSERVED.decimals
        case 'balanceOf':
          if (String(address).toLowerCase() !== fxrpLc) throw new Error(`mock-gasless: balanceOf on an unobserved token ${address}`)
          return config.balance ?? BIG
        case 'allowance':
          if (String(address).toLowerCase() !== fxrpLc) throw new Error(`mock-gasless: allowance on an unobserved token ${address}`)
          return config.allowance ?? 0n
        default:
          throw new Error(`mock-gasless: unexpected (unobserved) read ${functionName}`)
      }
    },
    async getBlockNumber() {
      return MOCK_LATEST_BLOCK
    },
    async getContractEvents({ eventName }: { eventName: string }) {
      if (eventName !== 'PaymentExecuted') throw new Error(`mock-gasless: unexpected (unobserved) event ${eventName}`)
      // A `confirmed` transfer is NEVER fabricated — it appears only when the caller
      // asserts the observed on-chain read. The amount is OBSERVED, never a 0.
      if (!config.confirmed) return []
      return [
        {
          args: {
            from: `0x${'0'.repeat(39)}1`,
            to: forwarder,
            amount: config.confirmedAmount ?? MOCK_GASLESS_OBSERVED.paymentAmount,
            nonce,
          },
          transactionHash: config.relayTxHash ?? MOCK_GASLESS_OBSERVED.paymentTx,
        },
      ]
    },
  } as unknown as PublicClient
}

function resolveRelay(config: MockGaslessConfig): RelayReceipt {
  const outcome = config.relay ?? 'accepted'
  if (outcome === 'unreachable') return { accepted: false, error: 'relayer unreachable (mock)' }
  if (typeof outcome === 'object') return { accepted: false, error: outcome.rejected }
  return { accepted: true, txHash: config.relayTxHash ?? MOCK_GASLESS_OBSERVED.paymentTx }
}

/**
 * The mock adapter: the REAL `makeGaslessAdapter` over a fake client, with `relay`
 * overridden to the observed receipt (no fetch). The deployment is presented
 * `gaslessVerified: true` because the payment WAS driven live — exactly the config
 * `live-gasless.mjs` bootstraps from. Only Coston2 was observed; any other network
 * refuses rather than invent one.
 */
export function createMockGaslessAdapter(config: MockGaslessConfig = {}, network: FlareNetworkKey = 'coston2'): GaslessAdapter {
  const base = gaslessFor(network)
  if (!base) throw new Error(`mock-gasless: no gasless deployment was observed live for '${network}' — the mock refuses to invent one.`)
  const deployment = { ...base, gaslessVerified: true }
  const real = makeGaslessAdapter(createMockClient(deployment.fxrp.address, deployment.forwarder, config), deployment)
  return { ...real, relay: async () => resolveRelay(config) }
}
