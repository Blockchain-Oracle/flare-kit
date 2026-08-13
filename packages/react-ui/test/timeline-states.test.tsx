import { createMockKit } from '@flare-kit/core'
import type { DirectMintOperation } from '@flare-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OperationTimeline } from '../src/OperationTimeline.js'

/**
 * R9 for OperationTimeline: every state in its
 * required-state lists, rendered against the mock.
 */

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

function traceFor(scenario: Parameters<typeof createMockKit>[0] extends never ? never : string) {
  const kit = createMockKit({ seed: 'tl', scenario: scenario as never })
  return kit.trace(kit.start(INTENT))
}

function at(records: DirectMintOperation[], predicate: (r: DirectMintOperation) => boolean) {
  const found = records.find(predicate)
  if (!found) throw new Error('the mock never reached that state')
  return found
}

describe('the spine', () => {
  const record = traceFor('happy')[0] as DirectMintOperation

  it('names the owning actor on every row, as a proper noun', () => {
    render(<OperationTimeline operation={record} />)
    for (const actor of [
      'your wallet',
      'the XRP Ledger',
      'the Flare Data Connector',
      'the executor',
      'Flare',
    ]) {
      expect(screen.getByText(actor)).toBeInTheDocument()
    }
  })

  it('is an ordered list, so the sequence is conveyed structurally', () => {
    const { container } = render(<OperationTimeline operation={record} />)
    expect(container.querySelector('ol.fk-spine')).toBeTruthy()
    expect(container.querySelectorAll('li.fk-spine-step')).toHaveLength(5)
  })

  it('announces the operation state in text', () => {
    render(<OperationTimeline operation={record} />)
    expect(screen.getByRole('status').textContent).toMatch(/operation is/i)
  })

  it('shows evidence beside the step it belongs to', () => {
    render(<OperationTimeline operation={record} />)
    // The XRPL destination and memo are known before anything is signed.
    expect(screen.getByText('Core vault')).toBeInTheDocument()
    expect(screen.getByText('Memo')).toBeInTheDocument()
  })
})

describe('delayed', () => {
  it('states the awaited actor and the exact moment the wait ends', () => {
    const record = at(traceFor('large-delayed'), (r) => r.awaiting?.actor === 'flare')
    render(<OperationTimeline operation={record} />)
    expect(screen.getByText(/waiting on flare/i)).toBeInTheDocument()
    // A deadline, not an indeterminate spinner.
    expect(screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('offers no action while nothing is safe, and says why', () => {
    const record = at(traceFor('large-delayed'), (r) => r.awaiting?.actor === 'flare')
    render(<OperationTimeline operation={record} />)
    expect(screen.queryByRole('button', { name: /complete the mint/i })).toBeNull()
    expect(screen.getByText(/nothing for you to do yet/i)).toBeInTheDocument()
  })
})

describe('action required', () => {
  const record = () => at(traceFor('executor-late'), (r) => r.state === 'action_required')

  it('offers the one safe action', () => {
    render(<OperationTimeline operation={record()} />)
    expect(screen.getByRole('button', { name: /complete the mint/i })).toBeInTheDocument()
  })

  it('says in words that it reuses the payment and sends nothing further', () => {
    render(<OperationTimeline operation={record()} />)
    expect(screen.getByText(/reuses the payment and proof you already made/i)).toBeInTheDocument()
    expect(screen.getByText(/sends no further funds/i)).toBeInTheDocument()
  })
})

describe('succeeded', () => {
  it('renders without offering any recovery action', () => {
    const kit = createMockKit({ seed: 'tl' })
    const record = kit.runToCompletion(kit.start(INTENT))
    render(<OperationTimeline operation={record} />)
    expect(screen.getByRole('status').textContent).toMatch(/succeeded/i)
    // No recovery action. Evidence copy controls remain, and should: a settled
    // operation is a receipt, and its identifiers must stay copyable.
    expect(screen.queryByRole('button', { name: /complete the mint/i })).toBeNull()
    expect(screen.queryByText(/nothing for you to do yet/i)).toBeNull()
  })
})

describe('submitted never reads as succeeded', () => {
  it('says Submitted, not a success word', () => {
    const record = at(traceFor('proof-slow'), (r) => r.state === 'submitted' || r.state === 'confirming')
    const { container } = render(<OperationTimeline operation={record} />)
    expect(container.textContent).not.toMatch(/succeeded/i)
  })
})

// ConnectButton's state coverage moved to account-sheet-states.test.tsx when
// AccountSheet replaced it. R9 for the connection surface lives there now.
