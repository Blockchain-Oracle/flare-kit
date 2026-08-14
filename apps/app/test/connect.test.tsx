import { describe, expect, it } from 'vitest'
import { toWalletOptions } from '../lib/connect'

const wallet = (rdns: string, name: string) => ({
  id: `uuid-${rdns}`,
  rdns,
  name,
  icon: 'data:,',
  provider: { request: async () => [] },
})

describe('toWalletOptions', () => {
  it('marks an announced wallet as detected, because it genuinely is', () => {
    const [option] = toWalletOptions([wallet('io.metamask', 'MetaMask')])
    expect(option!.detected).toBe(true)
    expect(option!.family).toBe('evm')
  })

  it('marks the last-used wallet as recent', () => {
    const options = toWalletOptions(
      [wallet('io.metamask', 'MetaMask'), wallet('io.rabby', 'Rabby')],
      'io.rabby',
    )
    expect(options.find((o) => o.name === 'Rabby')!.recent).toBe(true)
    expect(options.find((o) => o.name === 'MetaMask')!.recent).toBeFalsy()
  })

  it('claims nothing is recent when nothing was used before', () => {
    const options = toWalletOptions([wallet('io.metamask', 'MetaMask')])
    expect(options.every((o) => !o.recent)).toBe(true)
  })

  it('offers no wallet when none announced, rather than inventing one', () => {
    expect(toWalletOptions([])).toEqual([])
  })
})
