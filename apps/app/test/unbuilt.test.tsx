import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Unbuilt } from '../components/unbuilt'
import { familyById } from '../lib/families'

const chat = familyById('chat')!

describe('the declared-unbuilt panel', () => {
  it('says plainly that it is not built', () => {
    render(<Unbuilt family={chat} />)
    expect(screen.getByText(/not built yet/i)).toBeInTheDocument()
  })

  it('names the milestone that owns it', () => {
    render(<Unbuilt family={chat} />)
    expect(screen.getByText(/M14/)).toBeInTheDocument()
  })

  it('states what it will do, so the seam is legible', () => {
    render(<Unbuilt family={chat} />)
    expect(screen.getByText(/compose any of these operations/i)).toBeInTheDocument()
  })

  it('shows no fabricated preview of the unbuilt capability', () => {
    const { container } = render(<Unbuilt family={chat} />)
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})
