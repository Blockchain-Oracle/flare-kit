import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import {
  createMockKit,
  walletConnected,
  type DirectMintIntent,
} from '@flarekit-dev/core'
import { FlareProvider } from '../src/provider.js'
import { useAccounts } from '../src/use-accounts.js'
import { useDirectMint } from '../src/hooks.js'

// M2-AC6: "An account mismatch between a quote and the connected account blocks
// execution and names both accounts."
//
// Review found the gate built but unreachable — nothing called it. This drives
// it through the hook a surface actually uses, so the requirement is tested
// where a caller lives rather than in isolation.

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const
const ALICE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const BOB = '0x0000000000000000000000000000000000000B0B'
const XRPL_ALICE = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

const INTENT: DirectMintIntent = {
  amountXrp: '25.000000',
  recipient: ALICE,
  xrplAccount: XRPL_ALICE,
}

function Harness() {
  const mint = useDirectMint()
  const accounts = useAccounts()
  const [started, setStarted] = useState<string>('none')

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          mint.quote(INTENT)
        }}
      >
        quote
      </button>
      <button
        type="button"
        onClick={() => {
          accounts.setIdentity(walletConnected('evm', BOB, COSTON2))
        }}
      >
        switch account
      </button>
      <button
        type="button"
        onClick={() => {
          const record = mint.start(INTENT)
          setStarted(record ? record.id : 'blocked')
        }}
      >
        start
      </button>
      <output data-testid="started">{started}</output>
      <output data-testid="error">{mint.error?.message ?? ''}</output>
      <output data-testid="code">{mint.error?.code ?? ''}</output>
      <output data-testid="valid">{String(mint.binding.valid)}</output>
    </div>
  )
}

function mount() {
  const kit = createMockKit({ seed: 'binding-gate' })
  return render(
    <FlareProvider
      kit={kit}
      initialAccounts={{
        evm: walletConnected('evm', ALICE, COSTON2),
        xrpl: walletConnected('xrpl', XRPL_ALICE, XRPL_TESTNET),
      }}
    >
      <Harness />
    </FlareProvider>,
  )
}

const click = async (name: string) => {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

describe('a quote is bound to the accounts it was made for', () => {
  it('starts normally when the accounts have not moved', async () => {
    mount()
    await click('quote')
    await click('start')
    expect(screen.getByTestId('started').textContent).toMatch(/^op_/)
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('blocks execution when the wallet switched account after the quote', async () => {
    mount()
    await click('quote')
    await click('switch account')
    await click('start')
    expect(screen.getByTestId('started').textContent).toBe('blocked')
    expect(screen.getByTestId('code').textContent).toBe('ACCOUNT_BINDING_MISMATCH')
  })

  it('names both accounts in the refusal', async () => {
    mount()
    await click('quote')
    await click('switch account')
    await click('start')
    const message = screen.getByTestId('error').textContent ?? ''
    expect(message).toContain(ALICE)
    expect(message).toContain(BOB)
  })

  it('says nothing was sent, so a person knows not to re-pay', async () => {
    mount()
    await click('quote')
    await click('switch account')
    await click('start')
    expect(screen.getByTestId('error').textContent).toMatch(/nothing was sent/i)
  })

  it('reports the binding as invalid so SH-03 can be shown', async () => {
    mount()
    await click('quote')
    expect(screen.getByTestId('valid').textContent).toBe('true')
    await click('switch account')
    expect(screen.getByTestId('valid').textContent).toBe('false')
  })

  it('does not block a caller who never quoted through the hook', async () => {
    // The gate guards a binding that exists; it does not invent one.
    mount()
    await click('switch account')
    await click('start')
    expect(screen.getByTestId('started').textContent).toMatch(/^op_/)
  })
})
