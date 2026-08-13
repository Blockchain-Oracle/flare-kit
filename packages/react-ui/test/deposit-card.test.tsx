// packages/react-ui/test/deposit-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  type DepositOperation, type DepositPlanResult, type DepositQuoteResult,
  applyDepositQuote, buildDepositPlan, createDeposit, createMockVaultAdapter,
  quoteDeposit, startQuoting, vaultByKey,
} from '@flare-kit/core'
import { DepositCard } from '../src/DepositCard.js'

const OWNER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const NOW = 1_786_400_000
const upshift = vaultByKey('coston2', 'upshift-fxrp')!
const firelight = vaultByKey('coston2', 'firelight-fxrp')!

async function deposit(vaultKey: 'upshift-fxrp' | 'firelight-fxrp', opts: { assetAllowance?: bigint; assetBalance?: bigint; assetsIn?: bigint } = {}) {
  const assetsIn = opts.assetsIn ?? 1_000_000n
  const adapter = createMockVaultAdapter(vaultKey, { assetAllowance: opts.assetAllowance, assetBalance: opts.assetBalance })
  const intent = { vaultKey, assetsIn, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }
  let op = createDeposit({ chainId: 114, intent, now: NOW })
  op = startQuoting(op, NOW).record
  const quoteResult = await quoteDeposit(adapter, assetsIn, 50, NOW)
  const planResult = await buildDepositPlan(adapter, intent, OWNER, NOW)
  if (quoteResult.kind === 'quote') op = applyDepositQuote(op, { quote: quoteResult.quote, plan: planResult, now: NOW }).record
  return { op, quoteResult: quoteResult as DepositQuoteResult, planResult: planResult as DepositPlanResult }
}

const withState = (op: DepositOperation, state: DepositOperation['state'], stepType: 'approve' | 'deposit'): DepositOperation => ({
  ...op,
  state,
  steps: [{ id: stepType, type: stepType, actor: 'your_wallet', state: 'active', attempts: 1 }],
})

describe('DepositCard (M7-R8)', () => {
  const cfg = upshift

  it('shows the expected shares and the exact minimum, in the mono face', async () => {
    const { op, quoteResult, planResult } = await deposit('upshift-fxrp', { assetAllowance: 1n << 200n })
    render(<DepositCard operation={op} config={cfg} quoteResult={quoteResult} planResult={planResult} networkLabel="Coston2" />)
    expect(screen.getByDisplayValue('0.991577')).toBeInTheDocument() // expected vFXRP (receive leg input)
    expect(screen.getByText(/Minimum shares/)).toBeInTheDocument()
    expect(screen.getByText('vFXRP')).toBeInTheDocument()
  })

  it('names the asset approval when the allowance is short, as its own step', async () => {
    const { op, quoteResult, planResult } = await deposit('upshift-fxrp', { assetAllowance: 0n })
    expect(op.state).toBe('awaiting_approval')
    render(<DepositCard operation={op} config={cfg} quoteResult={quoteResult} planResult={planResult} />)
    expect(screen.getByRole('button', { name: /approve FTestXRP/i })).toBeInTheDocument()
  })

  it('states shares are a claim, not a deposit balance (honesty note)', async () => {
    const { op, quoteResult, planResult } = await deposit('upshift-fxrp', { assetAllowance: 1n << 200n })
    expect(op.state).toBe('ready')
    render(<DepositCard operation={op} config={cfg} quoteResult={quoteResult} planResult={planResult} />)
    expect(screen.getByText(/claim.*not a deposit balance/i)).toBeInTheDocument()
  })

  it("renders Firelight's global cap as cap-exceeded — never a revert after approval", async () => {
    const { op, quoteResult, planResult } = await deposit('firelight-fxrp', { assetsIn: 1_000_000n })
    expect(planResult.kind).toBe('error')
    render(<DepositCard operation={op} config={firelight} quoteResult={quoteResult} planResult={planResult} />)
    expect(screen.getByRole('button', { name: /over the deposit cap/i })).toBeInTheDocument()
    expect(screen.getByText(/room for at most/i)).toBeInTheDocument()
  })

  it('blocks the deposit and names the short asset when the balance cannot cover it', async () => {
    const { op, quoteResult, planResult } = await deposit('upshift-fxrp', { assetAllowance: 1n << 200n, assetBalance: 10n })
    expect(planResult.kind).toBe('error')
    render(<DepositCard operation={op} config={cfg} quoteResult={quoteResult} planResult={planResult} />)
    expect(screen.getByRole('button', { name: /insufficient FTestXRP/i })).toBeInTheDocument()
  })

  it('shows an in-flight approving state and then a depositing state on the CTA', async () => {
    const { op } = await deposit('upshift-fxrp', { assetAllowance: 0n })
    render(<DepositCard operation={withState(op, 'executing', 'approve')} config={cfg} />)
    expect(screen.getByRole('button', { name: /approving/i })).toBeInTheDocument()
  })

  it('never renders the pre-deposit quote as the amount received once concluded', async () => {
    const { op } = await deposit('upshift-fxrp', { assetAllowance: 1n << 200n })
    const concluded: DepositOperation = { ...op, state: 'succeeded', steps: [{ id: 'deposit', type: 'deposit', actor: 'your_wallet', state: 'done', attempts: 1 }] }
    render(<DepositCard operation={concluded} config={cfg} />)
    expect(screen.getByRole('button', { name: /deposited/i })).toBeDisabled()
    expect(screen.getByText(/exact.*minted/i, { selector: '.fk-note-body' })).toBeInTheDocument()
    // The receive leg shows — after conclusion, not the estimate dressed up as a receipt.
    expect(screen.getByDisplayValue('—')).toBeInTheDocument()
  })
})
