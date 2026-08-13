import { describe, expect, it } from 'vitest'
import {
  CUSTODY_CLASSES,
  type ChainIdentity,
  accountChanged,
  bothReady,
  canSign,
  connecting,
  cannotSignReason,
  createAccountContext,
  disconnected,
  identityFor,
  isReadOnly,
  parseReadOnlyIdentity,
  rejected,
  restoredSession,
  supplyReadOnly,
  walletConnected,
  walletUnavailable,
  wrongNetwork,
} from '../src/account.js'

// M2-R2: "AccountContext: simultaneous EVM and XRPL identity, each with a
// custody class (external-wallet, read-only, agent-key) and its own connection
// state. Neither is required for the other to be usable." — R-WALLET-001…009.
// M2-R2's second idea: "Read-only is a mode, not a degradation… it is never
// reached by failing to connect; it is chosen."

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const

const EVM_ADDRESS = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const XRPL_ADDRESS = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

describe('custody classes', () => {
  it('names exactly the three M2-R2 requires', () => {
    expect([...CUSTODY_CLASSES]).toEqual(['external-wallet', 'read-only', 'agent-key'])
  })
})

describe('an identity on its own', () => {
  it('starts disconnected with no address and no custody claim', () => {
    const identity = disconnected('evm')
    expect(identity.status).toBe('disconnected')
    expect(identity.address).toBeUndefined()
    expect(identity.custody).toBeUndefined()
  })

  it('says which wallet family is missing when none is installed', () => {
    const identity = walletUnavailable('evm', 'No EVM wallet is installed in this browser.')
    expect(identity.status).toBe('unavailable')
    expect(identity.reason).toBe('No EVM wallet is installed in this browser.')
  })

  it('reports a declined request as declined, never as read-only', () => {
    // Read-only is chosen. Falling into it after a rejection would tell the
    // person they picked a mode they did not pick.
    const identity = rejected('xrpl', 'The wallet declined the request.')
    expect(identity.status).toBe('rejected')
    expect(identity.custody).toBeUndefined()
    expect(isReadOnly(identity)).toBe(false)
  })

  it('holds the required network beside the current one when they differ', () => {
    const identity = wrongNetwork('evm', EVM_ADDRESS, { name: 'Flare Mainnet', chainId: 14 }, COSTON2)
    expect(identity.status).toBe('wrong-network')
    expect(identity.network?.name).toBe('Flare Mainnet')
    expect(identity.requiredNetwork?.name).toBe('Coston2')
  })

  it('keeps the address it was on when the wallet switches account', () => {
    const before = walletConnected('evm', EVM_ADDRESS, COSTON2)
    const after = accountChanged(before, '0x0000000000000000000000000000000000000001')
    expect(after.status).toBe('account-changed')
    expect(after.previousAddress).toBe(EVM_ADDRESS)
    expect(after.address).toBe('0x0000000000000000000000000000000000000001')
  })

  it('marks a session restored from storage as restored, not as ready', () => {
    // A restored session has not been re-authorized by the wallet yet, and
    // saying "connected" before that is a claim we have not checked.
    const identity = restoredSession('evm', EVM_ADDRESS, COSTON2, 1_700_000_000_000)
    expect(identity.status).toBe('restored')
    expect(identity.restoredAt).toBe(1_700_000_000_000)
    expect(canSign(identity)).toBe(false)
  })
})

describe('signing authority', () => {
  it('an external wallet that is ready can sign', () => {
    expect(canSign(walletConnected('evm', EVM_ADDRESS, COSTON2))).toBe(true)
  })

  it('an agent key that is ready can sign', () => {
    const identity = walletConnected('evm', EVM_ADDRESS, COSTON2, 'agent-key')
    expect(canSign(identity)).toBe(true)
  })

  it('a read-only identity cannot sign and says so in words', () => {
    const identity = supplyReadOnly('xrpl', XRPL_ADDRESS, XRPL_TESTNET)
    expect(identity.status).toBe('ready')
    expect(identity.custody).toBe('read-only')
    expect(canSign(identity)).toBe(false)
    expect(cannotSignReason(identity)).toMatch(/read-only/i)
  })

  it('a connecting identity cannot sign yet and says why', () => {
    expect(canSign(connecting('evm'))).toBe(false)
    expect(cannotSignReason(connecting('evm'))).toBeTruthy()
  })

  it('gives no reason when signing is in fact possible', () => {
    expect(cannotSignReason(walletConnected('evm', EVM_ADDRESS, COSTON2))).toBeUndefined()
  })
})

describe('read-only identities', () => {
  it('accepts a well-formed EVM address', () => {
    const parsed = parseReadOnlyIdentity('evm', EVM_ADDRESS, COSTON2)
    expect(parsed.status).toBe('ready')
    expect(parsed.custody).toBe('read-only')
  })

  it('accepts a well-formed XRPL classic address', () => {
    expect(parseReadOnlyIdentity('xrpl', XRPL_ADDRESS, XRPL_TESTNET).status).toBe('ready')
  })

  it('trims surrounding whitespace before judging an address', () => {
    expect(parseReadOnlyIdentity('evm', `  ${EVM_ADDRESS}\n`, COSTON2).status).toBe('ready')
  })

  it('rejects an EVM address of the wrong length and names the problem', () => {
    const parsed = parseReadOnlyIdentity('evm', '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd', COSTON2)
    expect(parsed.status).toBe('invalid-identity')
    expect(parsed.reason).toBeTruthy()
    expect(parsed.address).toBeUndefined()
  })

  it('rejects an XRPL address given to the EVM side', () => {
    expect(parseReadOnlyIdentity('evm', XRPL_ADDRESS, COSTON2).status).toBe('invalid-identity')
  })

  it('rejects an XRPL address using a character base58 does not have', () => {
    // 0, O, I and l are excluded from the alphabet precisely because they are
    // misread, so one appearing is a typo we can catch before any network call.
    expect(parseReadOnlyIdentity('xrpl', 'rGEgtYVznwNWsrtL0T5AWkPS6qyxvxdHio', XRPL_TESTNET).status).toBe(
      'invalid-identity',
    )
  })

  it('rejects an empty identity rather than treating it as disconnected', () => {
    expect(parseReadOnlyIdentity('xrpl', '   ', XRPL_TESTNET).status).toBe('invalid-identity')
  })
})

describe('AccountContext', () => {
  it('starts with both families disconnected and independent', () => {
    const context = createAccountContext()
    expect(context.evm.status).toBe('disconnected')
    expect(context.xrpl.status).toBe('disconnected')
    expect(bothReady(context)).toBe(false)
  })

  it('lets one family be fully usable while the other is not connected', () => {
    // M2-R2: "Neither is required for the other to be usable."
    const context = createAccountContext({ evm: walletConnected('evm', EVM_ADDRESS, COSTON2) })
    expect(canSign(context.evm)).toBe(true)
    expect(context.xrpl.status).toBe('disconnected')
  })

  it('mixes custody classes across the two families', () => {
    // Watching an XRPL account you do not hold while signing on Flare is a
    // real way to use this, not a broken state.
    const context = createAccountContext({
      evm: walletConnected('evm', EVM_ADDRESS, COSTON2),
      xrpl: supplyReadOnly('xrpl', XRPL_ADDRESS, XRPL_TESTNET),
    })
    expect(canSign(context.evm)).toBe(true)
    expect(canSign(context.xrpl)).toBe(false)
    expect(bothReady(context)).toBe(true)
  })

  it('is both-ready only when neither family is mid-flight or broken', () => {
    const context = createAccountContext({
      evm: walletConnected('evm', EVM_ADDRESS, COSTON2),
      xrpl: rejected('xrpl', 'Declined.'),
    })
    expect(bothReady(context)).toBe(false)
  })

  it('looks an identity up by family', () => {
    const context = createAccountContext({ xrpl: supplyReadOnly('xrpl', XRPL_ADDRESS, XRPL_TESTNET) })
    expect(identityFor(context, 'xrpl').address).toBe(XRPL_ADDRESS)
    expect(identityFor(context, 'evm').status).toBe('disconnected')
  })

  it('freezes each identity so a surface cannot rewrite custody', () => {
    const identity: ChainIdentity = supplyReadOnly('xrpl', XRPL_ADDRESS, XRPL_TESTNET)
    expect(Object.isFrozen(identity)).toBe(true)
  })
})
