import { FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { describe, expect, it } from 'vitest'
import { connectWallet, toWalletOptions } from '../lib/connect'

const COSTON2 = FLARE_NETWORKS.coston2
const ADDRESS = '0x1111111111111111111111111111111111111111'

/** A wallet provider that answers exactly what it is told to. */
const provider = (answers: Record<string, unknown | (() => never)>) => ({
  provider: {
    request: async ({ method }: { method: string }) => {
      const answer = answers[method]
      if (typeof answer === 'function') (answer as () => never)()
      return answer
    },
  },
})

const hex = (n: number) => `0x${n.toString(16)}`

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

describe('connectWallet', () => {
  it('reports the address the wallet returned, and nothing it did not', async () => {
    const result = await connectWallet(
      provider({ eth_requestAccounts: [ADDRESS], eth_chainId: hex(COSTON2.id) }),
      COSTON2,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.status).toBe('ready')
    expect(result.identity.address).toBe(ADDRESS)
    expect(result.identity.custody).toBe('external-wallet')
    expect(result.identity.network?.chainId).toBe(COSTON2.id)
  })

  it('says the wallet is on the wrong network rather than claiming the selected one', async () => {
    const result = await connectWallet(
      provider({ eth_requestAccounts: [ADDRESS], eth_chainId: hex(FLARE_NETWORKS.flare.id) }),
      COSTON2,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.status).toBe('wrong-network')
    // The network it is ACTUALLY on, and the one that was asked for.
    expect(result.identity.network?.chainId).toBe(FLARE_NETWORKS.flare.id)
    expect(result.identity.requiredNetwork?.chainId).toBe(COSTON2.id)
  })

  it('records a decline as a decline, and produces no identity at all', async () => {
    const decline = () => {
      throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
    }
    const result = await connectWallet(provider({ eth_requestAccounts: decline }), COSTON2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.declined).toBe(true)
  })

  it('does not call a failure a decline when it was not one', async () => {
    const boom = () => {
      throw new Error('the RPC endpoint is unreachable')
    }
    const result = await connectWallet(provider({ eth_requestAccounts: boom }), COSTON2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.declined).toBe(false)
    expect(result.message).toMatch(/unreachable/)
  })

  it('invents no account when the wallet approves none', async () => {
    const result = await connectWallet(provider({ eth_requestAccounts: [] }), COSTON2)
    expect(result.ok).toBe(false)
  })
})
