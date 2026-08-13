import {
  type OperationRecord,
  type OperationStep,
  MOCK_EPOCH,
  mockX402Challenge,
} from '@flare-kit/core'
import { X402Card } from '../src/index.js'
import type { Section } from './sections.js'

/**
 * Dev-only. Every required state of the M9 X402Card, in both themes. Prop-driven — each
 * state is data from the OBSERVED live fixtures, never a live call; a fixed `now`
 * (MOCK_EPOCH) keeps the screenshots deterministic. The load-bearing honesty is visible
 * here: SETTLEMENT and RESOURCE are two independent legs, a settled-but-resource-failed
 * state reads partially settled (never delivered), and the demo-token label rides every
 * rendering.
 */

const NOW = MOCK_EPOCH
const CH = mockX402Challenge(NOW)
const CH_EXPIRED = mockX402Challenge(NOW - 400_000) // expiresAt in the past
const AMOUNT = '0.1 mUSDT0'
const TX = '0x2923aa74b5478b3cf6b5aa6e279acfdf120ece201afd8de8f0701d076e698158'
const PID = '0x3ef50c3d33ff5bd92b288c8427164b1e59abdf1df77e6206e0111903927843cc'
const EXPLORER = `https://coston2-explorer.flare.network/tx/${TX}`

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({ id, type, actor, state, attempts: 0 })
const mkOp = (state: OperationRecord['state'], over: Partial<OperationRecord> = {}): OperationRecord =>
  ({ state, id: 'op', capability: 'x402', network: 114, intent: {}, steps: [], evidence: [], attempts: [], quoteHistory: [], createdAt: NOW, updatedAt: NOW, schemaVersion: 1, ...over }) as OperationRecord
const awaiting = (reason: string) => ({ awaiting: { actor: 'provider' as const, reason, since: Math.floor(NOW / 1000) } })

const SIGN_STEPS = [step('sign', 'sign_authorization', 'active'), step('settle', 'settle_and_fetch', 'pending', 'provider')]
const SETTLE_STEPS = [step('sign', 'sign_authorization', 'done'), step('settle', 'settle_and_fetch', 'active', 'provider')]
const DONE_STEPS = [step('sign', 'sign_authorization', 'done'), step('settle', 'settle_and_fetch', 'done', 'provider')]

export const M9_X402_SECTIONS: readonly Section[] = [
  {
    id: 'm9-x402',
    title: 'M9 · X402Card (402 → sign → settle → resource; demo token, settlement ≠ resource)',
    cases: [
      { name: 'challenge — amount in MockUSDT0 (demo), payee/facilitator/expiry', node: <X402Card operation={mkOp('ready', { steps: SIGN_STEPS })} challenge={CH} amountText={AMOUNT} networkLabel="Coston2" /> },
      { name: 'expired — renders expired, not valid', node: <X402Card operation={mkOp('awaiting_input')} challenge={CH_EXPIRED} expired amountText={AMOUNT} networkLabel="Coston2" /> },
      { name: 'signing — the EIP-3009 authorization (off-chain)', node: <X402Card operation={mkOp('executing', { steps: SIGN_STEPS })} challenge={CH} amountText={AMOUNT} networkLabel="Coston2" /> },
      { name: 'settling — facilitator settling; settlement + resource legs', node: <X402Card operation={mkOp('awaiting_external', { steps: SETTLE_STEPS, ...awaiting('Facilitator settling the payment.') })} challenge={CH} amountText={AMOUNT} networkLabel="Coston2" /> },
      { name: 'settled + delivered — succeeded; real settlement tx + payment id', node: <X402Card operation={mkOp('succeeded', { steps: DONE_STEPS })} challenge={CH} amountText={AMOUNT} settlementTx={TX} paymentId={PID} settlementExplorerUrl={EXPLORER} networkLabel="Coston2" /> },
      { name: 'settled + resource-failed — partially_succeeded (payment took, resource did not)', node: <X402Card operation={mkOp('partially_succeeded', { steps: [step('sign', 'sign_authorization', 'done'), step('settle', 'settle_and_fetch', 'failed', 'provider')] })} challenge={CH} amountText={AMOUNT} settlementTx={TX} paymentId={PID} networkLabel="Coston2" /> },
      { name: 'rejected — settlement rejected; nothing charged', node: <X402Card operation={mkOp('failed', { steps: [step('sign', 'sign_authorization', 'done'), step('settle', 'settle_and_fetch', 'failed', 'provider')] })} challenge={CH} amountText={AMOUNT} networkLabel="Coston2" /> },
      { name: 'duplicate — idempotent replay, not a second charge', node: <X402Card operation={mkOp('ready', { steps: SIGN_STEPS })} challenge={CH} amountText={AMOUNT} duplicate networkLabel="Coston2" /> },
      { name: 'facilitator-unavailable — read failed; distinct note', node: <X402Card operation={mkOp('awaiting_input')} challenge={CH} amountText={AMOUNT} unavailable="Couldn't reach the facilitator (server down). Nothing was signed or settled." networkLabel="Coston2" /> },
    ],
  },
]
