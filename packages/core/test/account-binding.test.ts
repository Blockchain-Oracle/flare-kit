import { describe, expect, it } from 'vitest'
import { FlareKitError } from '../src/errors.js'
import {
  accountChanged,
  createAccountContext,
  disconnected,
  supplyReadOnly,
  walletConnected,
  wrongNetwork,
} from '../src/account.js'
import {
  assertBinding,
  bindContext,
  bindIdentity,
  checkBinding,
  describeMismatch,
} from '../src/account-binding.js'

// M2-R3: "A quote, approval and execution each record the account and chain
// they were made for; a mismatch invalidates the action and says so, rather
// than silently rebinding it." — R-WALLET-008.
// M2-AC6: "An account mismatch between a quote and the connected account blocks
// execution and names both accounts."

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const FLARE = { name: 'Flare Mainnet', chainId: 14 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const

const ALICE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const BOB = '0x00000000000000000000000000000000000000B0'
const XRPL_ALICE = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const XRPL_BOB = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

const aliceOnCoston2 = () => walletConnected('evm', ALICE, COSTON2)
const aliceOnXrpl = () => walletConnected('xrpl', XRPL_ALICE, XRPL_TESTNET)

describe('bindIdentity', () => {
  it('records the account, the chain and when the binding was taken', () => {
    const binding = bindIdentity(aliceOnCoston2(), 5_000)
    expect(binding?.address).toBe(ALICE)
    expect(binding?.network.name).toBe('Coston2')
    expect(binding?.network.chainId).toBe(114)
    expect(binding?.boundAt).toBe(5_000)
  })

  it('binds a read-only identity too, so watching is still bound to an account', () => {
    expect(bindIdentity(supplyReadOnly('evm', ALICE, COSTON2), 5_000)?.custody).toBe('read-only')
  })

  it('cannot bind an identity that has no account', () => {
    expect(bindIdentity(disconnected('evm'), 5_000)).toBeUndefined()
  })

  it('cannot bind an identity on the wrong network', () => {
    // Binding to a chain we already know is wrong would record a lie and then
    // check the action against it.
    expect(bindIdentity(wrongNetwork('evm', ALICE, FLARE, COSTON2), 5_000)).toBeUndefined()
  })

  it('is frozen, so an action cannot be re-pointed after it was approved', () => {
    expect(Object.isFrozen(bindIdentity(aliceOnCoston2(), 5_000))).toBe(true)
  })
})

describe('bindContext', () => {
  it('binds both families at once when both are attached', () => {
    const context = createAccountContext({ evm: aliceOnCoston2(), xrpl: aliceOnXrpl() })
    const binding = bindContext(context, 5_000)
    expect(binding.evm?.address).toBe(ALICE)
    expect(binding.xrpl?.address).toBe(XRPL_ALICE)
  })

  it('binds only the family that is attached', () => {
    const binding = bindContext(createAccountContext({ evm: aliceOnCoston2() }), 5_000)
    expect(binding.evm?.address).toBe(ALICE)
    expect(binding.xrpl).toBeUndefined()
  })
})

describe('checkBinding', () => {
  const binding = bindContext(
    createAccountContext({ evm: aliceOnCoston2(), xrpl: aliceOnXrpl() }),
    5_000,
  )

  it('is valid when the same accounts are still connected', () => {
    const check = checkBinding(
      binding,
      createAccountContext({ evm: aliceOnCoston2(), xrpl: aliceOnXrpl() }),
    )
    expect(check.valid).toBe(true)
    expect(check.mismatches).toHaveLength(0)
  })

  it('invalidates when the EVM account changed, and names both accounts', () => {
    const check = checkBinding(
      binding,
      createAccountContext({ evm: walletConnected('evm', BOB, COSTON2), xrpl: aliceOnXrpl() }),
    )
    expect(check.valid).toBe(false)
    const mismatch = check.mismatches[0]
    expect(mismatch?.kind).toBe('account')
    expect(mismatch?.family).toBe('evm')
    // M2-AC6: both accounts, never just "wrong account".
    expect(mismatch?.expected).toBe(ALICE)
    expect(mismatch?.actual).toBe(BOB)
    expect(describeMismatch(mismatch!)).toContain(ALICE)
    expect(describeMismatch(mismatch!)).toContain(BOB)
  })

  it('invalidates when the chain changed under an approved action', () => {
    const check = checkBinding(
      binding,
      createAccountContext({ evm: walletConnected('evm', ALICE, FLARE), xrpl: aliceOnXrpl() }),
    )
    expect(check.valid).toBe(false)
    expect(check.mismatches[0]?.kind).toBe('network')
    expect(describeMismatch(check.mismatches[0]!)).toContain('Coston2')
    expect(describeMismatch(check.mismatches[0]!)).toContain('Flare Mainnet')
  })

  it('invalidates when the bound account went away entirely', () => {
    const check = checkBinding(
      binding,
      createAccountContext({ evm: disconnected('evm'), xrpl: aliceOnXrpl() }),
    )
    expect(check.valid).toBe(false)
    expect(check.mismatches[0]?.kind).toBe('absent')
    expect(describeMismatch(check.mismatches[0]!)).toContain(ALICE)
  })

  it('invalidates on a wallet-side account switch even before it settles', () => {
    const switched = accountChanged(aliceOnCoston2(), BOB)
    const check = checkBinding(binding, createAccountContext({ evm: switched, xrpl: aliceOnXrpl() }))
    expect(check.valid).toBe(false)
  })

  it('reports both families when both drifted', () => {
    const check = checkBinding(
      binding,
      createAccountContext({
        evm: walletConnected('evm', BOB, COSTON2),
        xrpl: walletConnected('xrpl', XRPL_BOB, XRPL_TESTNET),
      }),
    )
    expect(check.mismatches).toHaveLength(2)
    expect(check.mismatches.map((m) => m.family).sort()).toEqual(['evm', 'xrpl'])
  })

  it('ignores a family the action was never bound to', () => {
    // An FXRP transfer binds only Flare. An unrelated XRPL wallet changing
    // underneath it invalidates nothing.
    const evmOnly = bindContext(createAccountContext({ evm: aliceOnCoston2() }), 5_000)
    const check = checkBinding(
      evmOnly,
      createAccountContext({
        evm: aliceOnCoston2(),
        xrpl: walletConnected('xrpl', XRPL_BOB, XRPL_TESTNET),
      }),
    )
    expect(check.valid).toBe(true)
  })
})

describe('assertBinding', () => {
  const binding = bindContext(createAccountContext({ evm: aliceOnCoston2() }), 5_000)

  it('passes silently when the binding still holds', () => {
    expect(() =>
      assertBinding(binding, createAccountContext({ evm: aliceOnCoston2() })),
    ).not.toThrow()
  })

  it('throws a wallet-domain error that moved no value and names both accounts', () => {
    const drifted = createAccountContext({ evm: walletConnected('evm', BOB, COSTON2) })
    try {
      assertBinding(binding, drifted)
      expect.unreachable('a mismatched binding must block execution')
    } catch (error) {
      expect(error).toBeInstanceOf(FlareKitError)
      const kitError = error as FlareKitError
      expect(kitError.code).toBe('ACCOUNT_BINDING_MISMATCH')
      expect(kitError.domain).toBe('wallet')
      expect(kitError.valueMoved).toBe('no')
      // Not retryable against the same terms: the action has to be re-made.
      expect(kitError.recovery).toBe('terminal')
      expect(kitError.message).toContain(ALICE)
      expect(kitError.message).toContain(BOB)
    }
  })

  it('carries both accounts as copyable evidence, not only in prose', () => {
    try {
      assertBinding(binding, createAccountContext({ evm: walletConnected('evm', BOB, COSTON2) }))
      expect.unreachable('a mismatched binding must block execution')
    } catch (error) {
      expect((error as FlareKitError).evidence['evm.expected']).toBe(ALICE)
      expect((error as FlareKitError).evidence['evm.actual']).toBe(BOB)
    }
  })
})

describe('there is no silent rebind', () => {
  it('exposes no way to point an existing binding at another account', async () => {
    // R-WALLET-008 turns on this absence: the only response to drift is to
    // invalidate and re-make the action, so no rebinding verb may exist.
    const module = await import('../src/account-binding.js')
    expect(Object.keys(module).join(' ')).not.toMatch(/rebind|reassign|retarget|coerce/i)
  })
})
