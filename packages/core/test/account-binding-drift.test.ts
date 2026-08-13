import { describe, expect, it } from 'vitest'
import {
  accountChanged,
  createAccountContext,
  restoredSession,
  walletConnected,
  wrongNetwork,
} from '../src/account.js'
import { assertBinding, bindContext, checkBinding, describeMismatch } from '../src/account-binding.js'

// The drift cases review found `checkBinding` getting wrong. Each one is a
// real way a wallet moves under an approved action, and each was previously
// either missed entirely or reported as the wrong kind of problem.
// M2-R3 / R-WALLET-008, M2-AC6.

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const FLARE = { name: 'Flare Mainnet', chainId: 14 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const

const ALICE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const BOB = '0x00000000000000000000000000000000000000B0'
const XRPL_ALICE = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
/** The same string with one letter's case flipped. Still valid base58. */
const XRPL_LOOKALIKE = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxDHio'

const boundToAlice = () =>
  bindContext(createAccountContext({ evm: walletConnected('evm', ALICE, COSTON2) }), 5_000)

const boundToXrplAlice = () =>
  bindContext(
    createAccountContext({ xrpl: walletConnected('xrpl', XRPL_ALICE, XRPL_TESTNET) }),
    5_000,
  )

describe('XRPL addresses are case-sensitive', () => {
  it('catches an XRPL account that differs only by case', () => {
    // base58 is case-sensitive: these are two different accounts. Folding case
    // for both families made them compare equal, which is precisely the drift
    // R-WALLET-008 exists to catch.
    const check = checkBinding(
      boundToXrplAlice(),
      createAccountContext({ xrpl: walletConnected('xrpl', XRPL_LOOKALIKE, XRPL_TESTNET) }),
    )
    expect(check.valid).toBe(false)
    expect(check.mismatches[0]?.kind).toBe('account')
    expect(describeMismatch(check.mismatches[0]!)).toContain(XRPL_LOOKALIKE)
  })

  it('still treats an EVM address as case-insensitive', () => {
    // EVM hex is case-insensitive; EIP-55 checksum casing is presentation only,
    // so the same account written two ways is one account.
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: walletConnected('evm', ALICE.toLowerCase(), COSTON2) }),
    )
    expect(check.valid).toBe(true)
  })
})

describe('a wallet on the wrong chain is connected, not absent', () => {
  it('reports a network mismatch rather than a missing account', () => {
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: wrongNetwork('evm', ALICE, FLARE, COSTON2) }),
    )
    expect(check.valid).toBe(false)
    expect(check.mismatches[0]?.kind).toBe('network')
  })

  it('names the account and both networks, so the instruction is switch, not reconnect', () => {
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: wrongNetwork('evm', ALICE, FLARE, COSTON2) }),
    )
    const sentence = describeMismatch(check.mismatches[0]!)
    expect(sentence).toContain(ALICE)
    expect(sentence).toContain('Coston2')
    expect(sentence).toContain('Flare Mainnet')
    expect(sentence).not.toMatch(/no longer connected/)
  })
})

describe('a wallet that switched account', () => {
  it('reports an account mismatch, not an absent account', () => {
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: accountChanged(walletConnected('evm', ALICE, COSTON2), BOB) }),
    )
    expect(check.mismatches[0]?.kind).toBe('account')
  })

  it('names both accounts — M2-AC6 in the likeliest drift there is', () => {
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: accountChanged(walletConnected('evm', ALICE, COSTON2), BOB) }),
    )
    const sentence = describeMismatch(check.mismatches[0]!)
    expect(sentence).toContain(ALICE)
    expect(sentence).toContain(BOB)
  })

  it('blocks execution and names both accounts in the thrown error', () => {
    const drifted = createAccountContext({
      evm: accountChanged(walletConnected('evm', ALICE, COSTON2), BOB),
    })
    expect(() => assertBinding(boundToAlice(), drifted)).toThrow(new RegExp(ALICE))
    expect(() => assertBinding(boundToAlice(), drifted)).toThrow(new RegExp(BOB))
  })
})

describe('a restored session is not yet a settled one', () => {
  it('reports the same account on the same chain as unsettled, not valid', () => {
    // The wallet has not re-authorized this connection, so an action approved
    // earlier must not execute against it on the strength of a stored address.
    const check = checkBinding(
      boundToAlice(),
      createAccountContext({ evm: restoredSession('evm', ALICE, COSTON2, 6_000) }),
    )
    expect(check.valid).toBe(false)
    expect(check.mismatches[0]?.kind).toBe('unsettled')
    expect(describeMismatch(check.mismatches[0]!)).toMatch(/re-authorized/i)
  })
})

describe('an account that genuinely went away', () => {
  it('is still reported as absent', () => {
    const check = checkBinding(boundToAlice(), createAccountContext())
    expect(check.mismatches[0]?.kind).toBe('absent')
    expect(describeMismatch(check.mismatches[0]!)).toMatch(/no longer connected/)
  })
})
