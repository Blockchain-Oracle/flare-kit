import type { DexToken, GaslessOperation, GaslessPlanResult } from '@flare-kit/core'
import { applyGaslessPlan, applyTransition, createGasless, reconcileGaslessPayment } from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GaslessCard } from '../src/GaslessCard.js'

const FXRP: DexToken = { symbol: 'FTestXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 }
const OWNER = '0x00000000000000000000000000000000000000A1' as `0x${string}`

const planWith = (approve: boolean): GaslessPlanResult => ({
  kind: 'plan',
  plan: {
    ...(approve ? { approve: { token: FXRP.address, spender: '0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17', amount: 1n, label: 'x' } } : {}),
    payment: { from: OWNER, to: OWNER, amount: 1_000_000n, nonce: 0n, deadline: 3600n },
  },
})

function compose(): GaslessOperation {
  return createGasless({ chainId: 114, intent: { network: 'coston2', to: OWNER, amount: 1_000_000n, deadlineSeconds: 3600 }, now: 0 })
}
function planned(approve: boolean): GaslessOperation {
  return applyGaslessPlan(compose(), { plan: planWith(approve), now: 0 }).record
}
function submitted(): GaslessOperation {
  let op = planned(false)
  op = applyTransition(op, { to: 'executing', at: 0, patch: {} }).record
  return applyTransition(op, { to: 'submitted', at: 0, patch: {} }).record
}

const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')
const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button')?.textContent

describe('GaslessCard — states reachable from props (M9-R10/AC6)', () => {
  it('compose: awaiting_input, USD₮0 shown unavailable-on-testnet, relayer-covers-gas note', () => {
    const { container } = render(<GaslessCard operation={compose()} sendToken={FXRP} relayerUrl="http://localhost:8788" />)
    expect(opState(container)).toBe('awaiting_input')
    expect(container.textContent).toContain('unavailable on testnet')
    expect(container.textContent).toContain('Relayer covers gas · no fee')
  })

  it('needs-approval: the loud one-time approval note (gasless ≠ free)', () => {
    const { container } = render(<GaslessCard operation={planned(true)} sendToken={FXRP} planResult={planWith(true)} nonce={0n} deadline={3600n} />)
    expect(opState(container)).toBe('awaiting_approval')
    expect(cta(container)).toContain('Approve FXRP')
    expect(container.textContent).toContain('costs gas, once')
  })

  it('submitted: relay timeline present, CONFIRMED leg not done (never succeeded from relay HTTP)', () => {
    const { container } = render(<GaslessCard operation={submitted()} sendToken={FXRP} planResult={planWith(false)} />)
    expect(opState(container)).toBe('submitted')
    const confirmed = [...container.querySelectorAll('.fk-legtl-leg')].find((l) => l.textContent?.includes('confirmed on-chain'))
    expect(confirmed?.getAttribute('data-state')).not.toBe('done')
  })

  it('awaiting-relay: awaiting_external, actor relayer', () => {
    const op = reconcileGaslessPayment(submitted(), { kind: 'in-flight' }, 1000)
    const { container } = render(<GaslessCard operation={op} sendToken={FXRP} />)
    expect(opState(container)).toBe('awaiting_external')
    expect(cta(container)).toContain('Relayer submitting')
  })

  it('succeeded: only from the confirmed transfer; CTA reads Paid', () => {
    const op = reconcileGaslessPayment(submitted(), { kind: 'confirmed', txHash: `0x${'ab'.repeat(32)}`, amount: 1_000_000n }, 2000)
    const { container } = render(<GaslessCard operation={op} sendToken={FXRP} />)
    expect(opState(container)).toBe('succeeded')
    expect(cta(container)).toBe('Paid')
  })

  it('not-verified: the declared-gap CTA is disabled, error note shown', () => {
    const plan: GaslessPlanResult = { kind: 'error', error: { kind: 'not-verified', reason: 'x' } }
    const { container } = render(<GaslessCard operation={compose()} sendToken={FXRP} planResult={plan} />)
    expect(cta(container)).toBe('Not available')
    expect(container.textContent).toContain('Gasless not built here')
  })

  it('unavailable (read failed) is a distinct note, never a confident no-balance', () => {
    const { container } = render(<GaslessCard operation={compose()} sendToken={FXRP} unavailable="RPC lagged" />)
    expect(container.textContent).toContain("Couldn't read the forwarder")
    expect(container.textContent).not.toContain('Not enough FXRP')
  })
})
