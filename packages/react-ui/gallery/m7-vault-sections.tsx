import {
  type DepositOperation, type DepositPlanResult, type DepositQuote, type DepositQuoteResult,
  type ExitRoute, type VaultCall, type VaultConfig, type VaultPositionResult,
  type WithdrawOperation, type WithdrawPlanResult, type WithdrawQuote, type WithdrawQuoteResult,
  MOCK_EPOCH, advanceSteps, amount, applyDepositQuote, applyTransition, applyWithdrawQuote,
  createDeposit, createWithdraw, observe, startQuoting, vaultByKey,
} from '@flare-kit/core'
import { DepositCard, VaultCatalogue, WithdrawCard, type VaultReadsView, type VaultRow } from '../src/index.js'

/**
 * Dev-only. Every AC5 state of the M7 vault surfaces, in both themes (the one
 * gallery toggle re-themes them). States are built by walking the real deposit /
 * withdraw state machines with the OBSERVED Phase-A fixtures — the surfaces are
 * prop-driven, so each state is a record + a quote, never a live call. The
 * Countdown uses a fixed `now` (MOCK_EPOCH) so the screenshots are deterministic.
 */

const NOW = MOCK_EPOCH
const NOW_S = Math.floor(NOW / 1000)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const firelight = vaultByKey('coston2', 'firelight-fxrp')!
const upshift = vaultByKey('coston2', 'upshift-fxrp')!
const upshiftV: VaultConfig = { ...upshift, withdrawVerified: true }
const shareAddr = upshift.share.kind === 'lp' ? upshift.share.address : upshift.address
const CHAIN = observe({}, { class: 'chain', provider: 'Coston2 RPC', network: 'Coston2', chainId: 114 }, NOW)
const call = (protocol: VaultCall['protocol'], address: `0x${string}`, functionName: string, label: string): VaultCall => ({ protocol, address, functionName, args: [], label })

// ---------------------------------------------------------------------------
// VaultCatalogue (LIQ-01)
// ---------------------------------------------------------------------------
const firelightReads: VaultReadsView = { rate: amount(1_000_000n, 6, 'FTestXRP'), instantFeeBips: null, delayedFeeBips: 0, paused: false, depositCap: amount(5_939n, 6, 'FTestXRP'), withdrawCap: null }
const upshiftReads: VaultReadsView = { rate: amount(1_008_494n, 6, 'FTestXRP'), instantFeeBips: 50, delayedFeeBips: 25, paused: false, depositCap: null, withdrawCap: amount(10_000_000_000n, 6, 'FTestXRP') }
const verify = (c: VaultConfig): VaultConfig => ({ ...c, withdrawVerified: true })

const LIST: VaultRow[] = [
  { config: verify(firelight), reads: firelightReads, provenance: CHAIN },
  { config: verify(upshift), reads: upshiftReads, provenance: CHAIN },
]
const PAUSED: VaultRow[] = [{ config: verify(upshift), reads: { ...upshiftReads, paused: true }, provenance: CHAIN }]
const UNVERIFIED: VaultRow[] = [{ config: { ...upshift, withdrawVerified: false }, reads: upshiftReads, provenance: CHAIN }]
const UNAVAILABLE_ROW: VaultRow[] = [{ config: verify(upshift), provenance: CHAIN }]

// ---------------------------------------------------------------------------
// DepositCard (LIQ-02) — walk createDeposit → startQuoting → applyDepositQuote
// ---------------------------------------------------------------------------
const DEP_QUOTE: DepositQuote = { assetsIn: amount(1_000_000n, 6, 'FTestXRP'), expectedShares: amount(991_577n, 6, 'vFXRP'), minShares: amount(986_619n, 6, 'vFXRP'), rate: 1_008_494n, slippageBips: 50, observedAt: NOW }
const DEP_QR: DepositQuoteResult = { kind: 'quote', quote: DEP_QUOTE }
const FL_QUOTE: DepositQuote = { assetsIn: amount(1_000_000n, 6, 'FTestXRP'), expectedShares: amount(1_000_000n, 6, 'stFXRP'), minShares: amount(995_000n, 6, 'stFXRP'), rate: 1_000_000n, slippageBips: 50, observedAt: NOW }
const FL_QR: DepositQuoteResult = { kind: 'quote', quote: FL_QUOTE }
const DEP_CALL = call('upshift', upshift.address, 'deposit', 'Deposit FTestXRP')
const APPROVE_ASSET = call('erc20', upshift.asset.address, 'approve', 'Approve FTestXRP')
const READY_PLAN: DepositPlanResult = { kind: 'plan', plan: { deposit: DEP_CALL } }
const APPROVE_PLAN: DepositPlanResult = { kind: 'plan', plan: { approve: APPROVE_ASSET, deposit: DEP_CALL } }
const CAP_GATE: DepositPlanResult = { kind: 'error', error: { kind: 'cap_exceeded', max: 5_939n } }
const INSUFF_GATE: DepositPlanResult = { kind: 'error', error: { kind: 'insufficient_balance' } }
const BAL = amount(23_800_000n, 6, 'FTestXRP')
const DEP_APPROVE_TX = '0xdea00000000000000000000000000000000000000000000000000000000dea00'
const DEP_TX = '0xde0000000000000000000000000000000000000000000000000000000000de00'

function depositOp(plan: DepositPlanResult, quote: DepositQuote, id: string, assetsIn = 1_000_000n): DepositOperation {
  const intent = { vaultKey: 'upshift-fxrp', assetsIn, slippageBips: 50, recipient: RECIP, deadline: NOW_S + 1200 }
  let op = createDeposit({ chainId: 114, intent, now: NOW, id })
  op = startQuoting(op, NOW).record
  return applyDepositQuote(op, { quote, plan, now: NOW }).record
}
const hopDep = (op: DepositOperation, to: DepositOperation['state'], patch: object, evidence?: object[]): DepositOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

const DEP_READY = depositOp(READY_PLAN, DEP_QUOTE, 'op_dep')
const DEP_NEEDS = depositOp(APPROVE_PLAN, DEP_QUOTE, 'op_dep_ap')
const DEP_READY_AT = hopDep(DEP_NEEDS, 'ready', {})
const DEP_APPROVING = hopDep(DEP_READY_AT, 'executing', { steps: advanceSteps(DEP_READY_AT.steps, { done: 0, current: 'active' }, NOW) })
const DEP_DEPOSITING = hopDep(DEP_APPROVING, 'submitted', { steps: advanceSteps(DEP_APPROVING.steps, { done: 1, current: 'active' }, NOW) }, [{ kind: 'flare_tx', label: 'Approval', value: DEP_APPROVE_TX, observedAt: NOW }])
const DEP_SUCCEEDED = hopDep(DEP_DEPOSITING, 'succeeded', { steps: advanceSteps(DEP_DEPOSITING.steps, { done: 2, current: 'done' }, NOW) }, [{ kind: 'flare_tx', label: 'Deposit', value: DEP_TX, observedAt: NOW }])
const DEP_CAP = depositOp(CAP_GATE, FL_QUOTE, 'op_dep_cap')
const DEP_INSUFF = depositOp(INSUFF_GATE, DEP_QUOTE, 'op_dep_insuf')

// ---------------------------------------------------------------------------
// WithdrawCard (LIQ-03) — walk createWithdraw → startQuoting → applyWithdrawQuote
// ---------------------------------------------------------------------------
const POSITION: VaultPositionResult = { kind: 'position', position: { shares: amount(495_789n, 6, 'vFXRP'), assetsValue: amount(500_000n, 6, 'FTestXRP') } }
const WQ_DELAYED: WithdrawQuote = { route: 'delayed', shares: amount(495_789n, 6, 'vFXRP'), grossAssets: amount(500_000n, 6, 'FTestXRP'), feeAssets: amount(1_250n, 6, 'FTestXRP'), expectedAssets: amount(498_750n, 6, 'FTestXRP'), minAssets: amount(496_256n, 6, 'FTestXRP'), slippageBips: 50, observedAt: NOW }
const WQ_DR: WithdrawQuoteResult = { kind: 'quote', quote: WQ_DELAYED }
const REQUEST_CALL = call('upshift', upshift.address, 'requestRedeem', 'Request withdrawal')
const INSTANT_CALL = call('upshift', upshift.address, 'instantRedeem', 'Instant redeem')
const APPROVE_SHARE = call('erc20', shareAddr, 'approve', 'Approve vFXRP')
const WD_APPROVE_PLAN: WithdrawPlanResult = { kind: 'plan', plan: { approveShare: APPROVE_SHARE, request: REQUEST_CALL, route: 'delayed' } }
const WD_READY_PLAN: WithdrawPlanResult = { kind: 'plan', plan: { request: REQUEST_CALL, route: 'delayed' } }
const WD_INSTANT_PLAN: WithdrawPlanResult = { kind: 'plan', plan: { request: INSTANT_CALL, route: 'instant' } }
const FEES = { instant: 50, delayed: 25 } as const
const REQ_TX = '0x9e40000000000000000000000000000000000000000000000000000009e40000'
const CLAIM_TX = '0xc1a1000000000000000000000000000000000000000000000000000000c1a100'
const INSTANT_TX = '0x1a57000000000000000000000000000000000000000000000000000001a57000'

function withdrawOp(route: ExitRoute, plan: WithdrawPlanResult, id: string): WithdrawOperation {
  const intent = { vaultKey: 'upshift-fxrp', shares: 495_789n, route, slippageBips: 50, recipient: RECIP, deadline: NOW_S + 1200 }
  let op = createWithdraw({ chainId: 114, intent, now: NOW, id })
  op = startQuoting(op, NOW).record
  return applyWithdrawQuote(op, { quote: WQ_DELAYED, plan, now: NOW }).record
}
const hopWd = (op: WithdrawOperation, to: WithdrawOperation['state'], patch: object, evidence?: object[]): WithdrawOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

const WD_NEEDS = withdrawOp('delayed', WD_APPROVE_PLAN, 'op_wd_ap')
const WD_READY = withdrawOp('delayed', WD_READY_PLAN, 'op_wd')
const WD_REQUESTING = hopWd(WD_READY, 'executing', { steps: advanceSteps(WD_READY.steps, { done: 0, current: 'active' }, NOW) })
const WD_WAITING = hopWd(WD_REQUESTING, 'awaiting_external', { steps: advanceSteps(WD_REQUESTING.steps, { done: 1, current: 'active' }, NOW) }, [{ kind: 'flare_tx', label: 'Request', value: REQ_TX, observedAt: NOW }])
const WD_CLAIMABLE = hopWd(WD_WAITING, 'action_required', { steps: advanceSteps(WD_WAITING.steps, { done: 2, current: 'pending' }, NOW) })
const WD_CLAIMING = hopWd(WD_CLAIMABLE, 'executing', { steps: advanceSteps(WD_CLAIMABLE.steps, { done: 2, current: 'active' }, NOW) })
// executing → succeeded is NOT a legal hop (states.ts) and applyTransition drops the
// patch silently; the claim tx confirms through `submitted` first, exactly as the
// deposit chain does. Skipping it left the card stuck rendering "Claiming…".
const WD_CLAIM_SUBMITTED = hopWd(WD_CLAIMING, 'submitted', { steps: advanceSteps(WD_CLAIMING.steps, { done: 2, current: 'active' }, NOW) })
const WD_CLAIMED = hopWd(WD_CLAIM_SUBMITTED, 'succeeded', { steps: advanceSteps(WD_CLAIM_SUBMITTED.steps, { done: 3, current: 'done' }, NOW) }, [{ kind: 'flare_tx', label: 'Claim', value: CLAIM_TX, observedAt: NOW }])
const WD_INSTANT = withdrawOp('instant', WD_INSTANT_PLAN, 'op_inst')
const WD_INSTANT_INFLIGHT = hopWd(WD_INSTANT, 'executing', { steps: advanceSteps(WD_INSTANT.steps, { done: 0, current: 'active' }, NOW) })
const WD_INSTANT_SUBMITTED = hopWd(WD_INSTANT_INFLIGHT, 'submitted', { steps: advanceSteps(WD_INSTANT_INFLIGHT.steps, { done: 0, current: 'active' }, NOW) })
const WD_INSTANT_SUCCESS = hopWd(WD_INSTANT_SUBMITTED, 'succeeded', { steps: advanceSteps(WD_INSTANT_SUBMITTED.steps, { done: 1, current: 'done' }, NOW) }, [{ kind: 'flare_tx', label: 'Instant redeem', value: INSTANT_TX, observedAt: NOW }])
const CLAIMABLE_AT = NOW_S + 6 * 3600 // 6h out → deterministic "6h 00m 00s"

const wd = (extra: object) => <WithdrawCard config={upshiftV} positionResult={POSITION} fees={FEES} now={NOW_S} networkLabel="Coston2" {...extra} />

export const M7_VAULT_SECTIONS = [
  {
    id: 'm7-vault-catalogue',
    title: 'M7 · VaultCatalogue (states reachable from props)',
    cases: [
      { name: 'list — both vaults, share model, live fees, exit routes', node: <VaultCatalogue rows={LIST} now={NOW_S} networkLabel="Coston2" /> },
      { name: 'vault paused — a first-class state, not a user error', node: <VaultCatalogue rows={PAUSED} now={NOW_S} networkLabel="Coston2" /> },
      { name: 'withdraw unverified — reads shown, declared-unbuilt withdraw', node: <VaultCatalogue rows={UNVERIFIED} now={NOW_S} networkLabel="Coston2" /> },
      { name: 'read unavailable — never a confident zero', node: <VaultCatalogue rows={UNAVAILABLE_ROW} now={NOW_S} networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm7-deposit',
    title: 'M7 · DepositCard (states reachable from props)',
    cases: [
      { name: 'quote — expected shares at the live rate, exact minimum', node: <DepositCard operation={DEP_READY} config={upshiftV} quoteResult={DEP_QR} planResult={READY_PLAN} balance={BAL} networkLabel="Coston2" /> },
      { name: 'needs approval — asset short, its own step', node: <DepositCard operation={DEP_NEEDS} config={upshiftV} quoteResult={DEP_QR} planResult={APPROVE_PLAN} balance={BAL} networkLabel="Coston2" /> },
      { name: 'approving — approve tx in flight on the spine', node: <DepositCard operation={DEP_APPROVING} config={upshiftV} quoteResult={DEP_QR} networkLabel="Coston2" /> },
      { name: 'depositing — approval done, deposit tx in flight', node: <DepositCard operation={DEP_DEPOSITING} config={upshiftV} quoteResult={DEP_QR} networkLabel="Coston2" /> },
      { name: 'success — Deposited, shares are a claim, with tx evidence', node: <DepositCard operation={DEP_SUCCEEDED} config={upshiftV} quoteResult={DEP_QR} networkLabel="Coston2" /> },
      { name: 'cap exceeded — Firelight global limit, never a revert after approval', node: <DepositCard operation={DEP_CAP} config={firelight} quoteResult={FL_QR} planResult={CAP_GATE} networkLabel="Coston2" /> },
      { name: 'insufficient balance — blocks the deposit, names the asset', node: <DepositCard operation={DEP_INSUFF} config={upshiftV} quoteResult={DEP_QR} planResult={INSUFF_GATE} balance={amount(10n, 6, 'FTestXRP')} networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm7-withdraw',
    title: 'M7 · WithdrawCard (durable timeline + route choice)',
    cases: [
      { name: 'no position — honest empty, never a false zero', node: <WithdrawCard config={upshiftV} positionResult={{ kind: 'no_position', message: 'none' }} now={NOW_S} networkLabel="Coston2" /> },
      { name: 'unavailable — read failed, never a confident "no position" (M6 F1)', node: <WithdrawCard config={upshiftV} positionResult={{ kind: 'unavailable', reason: 'The Coston2 RPC did not answer.' }} now={NOW_S} networkLabel="Coston2" /> },
      { name: 'position — live share balance read on open', node: wd({ route: 'delayed', percent: 0 }) },
      { name: 'route choice — instant vs delayed, each real fee, never collapsed', node: wd({ route: 'delayed', percent: 100, quoteResult: WQ_DR }) },
      { name: 'needs approval — the LP token pulled, its own step', node: wd({ operation: WD_NEEDS, quoteResult: WQ_DR }) },
      { name: 'requesting — the request tx in flight', node: wd({ operation: WD_REQUESTING, route: 'delayed' }) },
      { name: 'waiting — a request is NOT assets; live countdown to claim', node: wd({ operation: WD_WAITING, route: 'delayed', claimableAt: CLAIMABLE_AT }) },
      { name: 'claimable — the wait is over, CLAIMABLE badge + Claim', node: wd({ operation: WD_CLAIMABLE, route: 'delayed', claimableAt: NOW_S - 60 }) },
      { name: 'claiming — the claim tx in flight, distinct from requesting', node: wd({ operation: WD_CLAIMING, route: 'delayed' }) },
      { name: 'claimed — Withdrawn, the actual assets on the tx', node: wd({ operation: WD_CLAIMED, route: 'delayed' }) },
      { name: 'instant success — one step, Redeemed net of its fee', node: wd({ operation: WD_INSTANT_SUCCESS, route: 'instant' }) },
    ],
  },
]
