import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PoolCatalogue } from '../src/PoolCatalogue.js'

describe('PoolCatalogue (M6-R10, declared unbuilt)', () => {
  it('is present and states its reason — never faked, never silently omitted', () => {
    render(<PoolCatalogue networkLabel="Coston2" />)
    expect(screen.getByText(/pool catalogue/i)).toBeTruthy()
    expect(screen.getByText(/one live Coston2 pool today/i)).toBeTruthy()
  })

  it('shows no fabricated pool rows or data', () => {
    render(<PoolCatalogue networkLabel="Coston2" />)
    expect(screen.queryByText(/reserves|TVL|APR|\$/i)).toBeNull()
  })
})
