// packages/react-ui/test/withdraw-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  type ExitRoute, type OperationStep, type VaultPositionResult, type WithdrawOperation,
  amount, applyWithdrawQuote, buildWithdrawPlan, createMockVaultAdapter, createWithdraw,
  quoteWithdraw, startQuoting, vaultByKey,
} from '@flarekit-dev/core'
import { WithdrawCard } from '../src/WithdrawCard.js'

const OWNER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const NOW = 1_786_400_000
const upshift = vaultByKey('coston2', 'upshift-fxrp')!
const firelight = vaultByKey('coston2', 'firelight-fxrp')!

const position: VaultPositionResult = {
  kind: 'position',
  position: { shares: amount(495_789n, 6, 'vFXRP'), assetsValue: amount(500_000n, 6, 'FTestXRP') },
}

async function quoteFor(vaultKey: 'upshift-fxrp' | 'firelight-fxrp', shares: bigint, route: ExitRoute) {
  const adapter = createMockVaultAdapter(vaultKey, { shareBalance: shares, shareAllowance: 1n << 200n })
  return quoteWithdraw(adapter, shares, route, 50, NOW)
}

function baseOp(route: ExitRoute, vaultKey = 'upshift-fxrp') {
  const intent = { vaultKey, shares: 400_000n, route, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }
  return createWithdraw({ chainId: 114, intent, now: NOW })
}

const withState = (op: WithdrawOperation, state: WithdrawOperation['state'], steps: WithdrawOperation['steps']): WithdrawOperation => ({ ...op, state, steps })
const step = (id: string, type: OperationStep['type'], s: 'pending' | 'active' | 'done', actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({ id, type, actor, state: s, attempts: s === 'pending' ? 0 : 1 })

describe('WithdrawCard (M7-R9)', () => {
  it('renders unavailable — never a confident "no position" — when the balance read failed (M6 F1)', () => {
    render(<WithdrawCard config={upshift} positionResult={{ kind: 'unavailable', reason: 'RPC did not answer.' }} now={NOW} />)
    expect(screen.getByText(/couldn't read your balance/i)).toBeInTheDocument()
    expect(screen.queryByText(/hold no/i)).toBeNull()
  })

  it('renders an honest no-position state', () => {
    render(<WithdrawCard config={upshift} positionResult={{ kind: 'no_position', message: 'none' }} now={NOW} />)
    expect(screen.getByText(/hold no vFXRP/i)).toBeInTheDocument()
  })

  it('offers the explicit route choice with each real fee, never collapsed', async () => {
    const q = await quoteFor('upshift-fxrp', 495_789n, 'delayed')
    render(<WithdrawCard config={upshift} positionResult={position} quoteResult={q} route="delayed" fees={{ instant: 50, delayed: 25 }} percent={100} now={NOW} />)
    expect(screen.getByRole('tab', { name: /Instant · 0\.50%/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Delayed · 0\.25%/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.495789')).toBeInTheDocument() // held shares
    expect(screen.getByRole('group', { name: /portion to withdraw/i })).toBeInTheDocument()
    // The exact delayed fee amount (gross 0.500000 → net 0.498750 → fee 0.001250).
    const feeRow = screen.getByText('Delayed fee').closest('.fk-row')!
    expect(within(feeRow as HTMLElement).getByText('0.001250 FTestXRP')).toBeInTheDocument()
    expect(screen.getByText(/Net of the delayed fee/i)).toBeInTheDocument()
  })

  it('a single-route vault shows no route choice', async () => {
    const q = await quoteFor('firelight-fxrp', 3_000n, 'delayed')
    render(<WithdrawCard config={firelight} positionResult={{ kind: 'position', position: { shares: amount(3_000n, 6, 'stFXRP'), assetsValue: amount(3_000n, 6, 'FTestXRP') } }} quoteResult={q} route="delayed" percent={100} now={NOW} />)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('names the LP share approval as its own step when short', async () => {
    const adapter = createMockVaultAdapter('upshift-fxrp', { shareBalance: 400_000n, shareAllowance: 0n })
    const intent = { vaultKey: 'upshift-fxrp', shares: 400_000n, route: 'delayed' as ExitRoute, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }
    let op = startQuoting(baseOp('delayed'), NOW).record
    const q = await quoteWithdraw(adapter, 400_000n, 'delayed', 50, NOW)
    const plan = await buildWithdrawPlan(adapter, intent, OWNER, NOW)
    if (q.kind === 'quote') op = applyWithdrawQuote(op, { quote: q.quote, plan, now: NOW }).record
    expect(op.state).toBe('awaiting_approval')
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} quoteResult={q} now={NOW} />)
    expect(screen.getByRole('button', { name: /approve vFXRP/i })).toBeInTheDocument()
  })

  it('WAITING shows the live countdown and states a request is NOT assets received (AC3)', () => {
    const op = withState(baseOp('delayed'), 'awaiting_external', [step('request', 'request_withdraw', 'done'), step('wait', 'await_period', 'active', 'flare'), step('claim', 'claim', 'pending')])
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} route="delayed" claimableAt={NOW + 3600} now={NOW} />)
    expect(screen.getByRole('timer')).toHaveTextContent('1h 00m 00s')
    expect(screen.getByText(/a request is not a withdrawal/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /waiting to claim/i })).toBeDisabled()
  })

  it('CLAIMABLE shows the badge and a Claim action', () => {
    const op = withState(baseOp('delayed'), 'action_required', [step('request', 'request_withdraw', 'done'), step('wait', 'await_period', 'done', 'flare'), step('claim', 'claim', 'pending')])
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} route="delayed" claimableAt={NOW - 10} now={NOW} />)
    expect(screen.getByText(/claimable now/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /claim withdrawal/i })).toBeEnabled()
  })

  it('CLAIMING (claim tx in flight) is distinct from requesting', () => {
    const op = withState(baseOp('delayed'), 'executing', [step('request', 'request_withdraw', 'done'), step('wait', 'await_period', 'done', 'flare'), step('claim', 'claim', 'active')])
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} route="delayed" now={NOW} />)
    expect(screen.getByRole('button', { name: /claiming/i })).toBeDisabled()
  })

  it('a delayed claim CONCLUDES as Withdrawn with the actual assets on the tx', () => {
    const op = withState(baseOp('delayed'), 'succeeded', [step('claim', 'claim', 'done')])
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} route="delayed" now={NOW} />)
    expect(screen.getByRole('button', { name: /withdrawn/i })).toBeDisabled()
    expect(screen.getByText(/exact.*claimed is on the transaction/i, { selector: '.fk-note-body' })).toBeInTheDocument()
  })

  it('an instant redeem CONCLUDES in one step as Redeemed, net of its fee', () => {
    const op = withState(baseOp('instant'), 'succeeded', [step('request', 'instant_redeem', 'done')])
    render(<WithdrawCard config={upshift} operation={op} positionResult={position} route="instant" now={NOW} />)
    expect(screen.getByRole('button', { name: /redeemed/i })).toBeDisabled()
    expect(screen.getByText(/instant redemption net of its fee/i)).toBeInTheDocument()
  })
})
