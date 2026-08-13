import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveOperation } from '../components/landing/live-operation'

describe('LiveOperation', () => {
  it('labels itself as the mock, so no visitor reads it as a live chain result', () => {
    render(<LiveOperation />)
    expect(screen.getByText(/mock kit/i)).toBeInTheDocument()
  })

  it('never renders an in-flight operation as succeeded', () => {
    render(<LiveOperation />)
    expect(screen.queryByText(/^succeeded$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^done$/i)).not.toBeInTheDocument()
  })

  it('names the actor being waited on, rather than showing a bare spinner', () => {
    render(<LiveOperation />)
    // The spine names the actor in more than one place — the wait line and the
    // step row — so assert presence, not uniqueness.
    expect(screen.getAllByText(/data connector/i).length).toBeGreaterThan(0)
  })
})
