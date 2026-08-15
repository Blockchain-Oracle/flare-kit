import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectControl } from '../components/connect'

describe('with no wallet', () => {
  it('offers to connect rather than reporting an error', () => {
    render(<ConnectControl />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('claims no address', () => {
    render(<ConnectControl />)
    expect(screen.queryByText(/0x[0-9a-fA-F]{4}/)).toBeNull()
  })
})
