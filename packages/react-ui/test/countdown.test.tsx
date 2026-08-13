// packages/react-ui/test/countdown.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Countdown } from '../src/primitives/Countdown.js'

describe('Countdown (M7-R9) — pure, host supplies `now`', () => {
  it('renders the remaining time in the mono face, zero-padded H/M/S', () => {
    // 6h 05m 03s = 21903 s
    render(<Countdown targetUnix={1_000_000 + 21_903} now={1_000_000} />)
    expect(screen.getByText('6h 05m 03s')).toBeInTheDocument()
  })

  it('never reads a wall clock — the same props always render the same text', () => {
    const { rerender } = render(<Countdown targetUnix={200} now={140} />)
    expect(screen.getByText('0h 01m 00s')).toBeInTheDocument()
    rerender(<Countdown targetUnix={200} now={140} />)
    expect(screen.getByText('0h 01m 00s')).toBeInTheDocument()
  })

  it('clamps at zero and marks itself reached once the target passes', () => {
    render(<Countdown targetUnix={100} now={250} />)
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAttribute('data-reached', 'true')
  })

  it('exposes a spoken label for assistive tech', () => {
    render(<Countdown targetUnix={1_000 + 3_600} now={1_000} label="Claimable in" />)
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', expect.stringMatching(/1h 00m 00s/))
  })
})
