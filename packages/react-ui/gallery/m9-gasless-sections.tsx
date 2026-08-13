import {
  type DexToken,
  type GaslessPlanResult,
  type OperationRecord,
  type OperationStep,
  MOCK_EPOCH,
  amount,
} from '@flare-kit/core'
import { GaslessCard } from '@flare-kit/react-ui'
import type { Section } from './sections.js'

/**
 * Dev-only. Every required state of the M9 GaslessCard, in both themes (the one gallery
 * toggle re-themes them). States are records + plans built from the OBSERVED live
 * fixtures — the surface is prop-driven, so each state is data, never a live call. A
 * fixed `now` (MOCK_EPOCH) keeps the screenshots deterministic. The load-bearing honesty
 * is visible here: a `submitted` relay acceptance's CONFIRMED leg is still pending, and
 * `succeeded` (Paid) is a distinct, later state entered only from the on-chain read.
 */

const NOW = MOCK_EPOCH
const FXRP: DexToken = { symbol: 'FTestXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 }
const FORWARDER = '0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17'
const RECIPIENT = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const RELAYER = 'http://localhost:8788'
const DEADLINE = BigInt(Math.floor(NOW / 1000) + 3600)
const BAL = amount(2_000_000n, 6, 'FTestXRP')

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({ id, type, actor, state, attempts: 0 })
const mkOp = (state: OperationRecord['state'], over: Partial<OperationRecord> = {}): OperationRecord =>
  ({ state, id: 'op', capability: 'gasless', network: 114, intent: {}, steps: [], evidence: [], attempts: [], quoteHistory: [], createdAt: NOW, updatedAt: NOW, schemaVersion: 1, ...over }) as OperationRecord
const awaiting = (reason: string) => ({ awaiting: { actor: 'relayer' as const, reason, since: Math.floor(NOW / 1000) } })

const payment = { from: RECIPIENT as `0x${string}`, to: RECIPIENT as `0x${string}`, amount: 1_000_000n, nonce: 0n, deadline: DEADLINE }
const READY_PLAN: GaslessPlanResult = { kind: 'plan', plan: { payment } }
const APPROVE_PLAN: GaslessPlanResult = { kind: 'plan', plan: { approve: { token: FXRP.address, spender: FORWARDER, amount: 1n, label: 'Approve FTestXRP' }, payment } }
const NOT_VERIFIED: GaslessPlanResult = { kind: 'error', error: { kind: 'not-verified', reason: 'no live run has confirmed a gasless transfer here' } }
const INSUFF: GaslessPlanResult = { kind: 'error', error: { kind: 'insufficient-balance' } }
const EXPIRED: GaslessPlanResult = { kind: 'error', error: { kind: 'expired-deadline' } }
const UNREACHABLE: GaslessPlanResult = { kind: 'error', error: { kind: 'relayer-unreachable' } }

const APPROVE_STEPS = [step('approve', 'approve', 'active'), step('sign', 'sign_payment', 'pending'), step('relay', 'relay_submit', 'pending', 'relayer')]
const SIGN_STEPS = [step('approve', 'approve', 'done'), step('sign', 'sign_payment', 'active'), step('relay', 'relay_submit', 'pending', 'relayer')]
const RELAY_STEPS = [step('sign', 'sign_payment', 'done'), step('relay', 'relay_submit', 'active', 'relayer')]

const base = { sendToken: FXRP, relayerUrl: RELAYER, recipientText: RECIPIENT, amountText: '1', fromBalance: BAL, networkLabel: 'Coston2' } as const

export const M9_GASLESS_SECTIONS: readonly Section[] = [
  {
    id: 'm9-gasless',
    title: 'M9 · GaslessCard (gasless FXRP; relayer covers gas · no fee)',
    cases: [
      { name: 'compose — USD₮0 unavailable-on-testnet, relayer covers gas', node: <GaslessCard operation={mkOp('awaiting_input')} {...base} /> },
      { name: 'needs-approval — the loud one-time approval (gasless ≠ free)', node: <GaslessCard operation={mkOp('awaiting_approval', { steps: APPROVE_STEPS })} planResult={APPROVE_PLAN} nonce={0n} deadline={DEADLINE} {...base} /> },
      { name: 'ready — no approval needed (already approved), just sign', node: <GaslessCard operation={mkOp('ready', { steps: RELAY_STEPS })} planResult={READY_PLAN} nonce={0n} deadline={DEADLINE} {...base} /> },
      { name: 'approving — the one-time approval in flight', node: <GaslessCard operation={mkOp('executing', { steps: APPROVE_STEPS })} planResult={APPROVE_PLAN} {...base} /> },
      { name: 'signing — the PaymentRequest signature (off-chain)', node: <GaslessCard operation={mkOp('executing', { steps: SIGN_STEPS })} planResult={READY_PLAN} {...base} /> },
      { name: 'submitted — relay accepted; CONFIRMED leg still pending (never paid from HTTP)', node: <GaslessCard operation={mkOp('submitted', { steps: RELAY_STEPS })} planResult={READY_PLAN} {...base} /> },
      { name: 'awaiting-relay — relayer submitting on-chain', node: <GaslessCard operation={mkOp('awaiting_external', { steps: RELAY_STEPS, ...awaiting('Relayer submitting your payment on-chain.') })} planResult={READY_PLAN} {...base} /> },
      { name: 'succeeded — Paid, only from the on-chain transfer read', node: <GaslessCard operation={mkOp('succeeded', { steps: [step('sign', 'sign_payment', 'done'), step('relay', 'relay_submit', 'done', 'relayer')] })} {...base} /> },
      { name: 'insufficient-balance — not enough FXRP', node: <GaslessCard operation={mkOp('awaiting_input')} planResult={INSUFF} {...base} /> },
      { name: 'expired — the signing window closed', node: <GaslessCard operation={mkOp('awaiting_input')} planResult={EXPIRED} {...base} /> },
      { name: 'relayer-unreachable — nothing moved; signature is off-chain', node: <GaslessCard operation={mkOp('awaiting_input')} planResult={UNREACHABLE} relayerReachable={false} {...base} /> },
      { name: 'not-verified — declared gap; the kit will not sign against it', node: <GaslessCard operation={mkOp('awaiting_input')} planResult={NOT_VERIFIED} {...base} /> },
      { name: 'unavailable — read failed; distinct from no-balance', node: <GaslessCard operation={mkOp('awaiting_input')} unavailable="The forwarder read failed (RPC lag). Nothing safe to sign — this is not a balance problem." {...base} /> },
    ],
  },
]
