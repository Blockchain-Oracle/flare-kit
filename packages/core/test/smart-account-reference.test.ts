import { BUILT_IN_INSTRUCTIONS } from '@flare-kit/contracts'
import { describe, expect, it } from 'vitest'
import {
  decodePaymentReference,
  encodePaymentReference,
} from '../src/smart-accounts/payment-reference.js'

/**
 * The reference codec, checked against `PaymentReferenceParser.sol` rather than against
 * itself.
 *
 * Two independent checks run on every fixture. The FIXTURES are hex strings assembled by
 * hand from the Solidity layout comment (byte 0 id, byte 1 wallet, bytes 2–11 a uint80
 * value, then the command's tail), and the CROSS-CHECK re-reads each fixture with the
 * parser's own shifts. A codec bug that moved a field would have to move it identically in
 * three places to pass.
 */

const SHIFTS = {
  instructionId: (packed: bigint) => Number(packed >> 248n),
  value: (packed: bigint) => (packed >> 160n) & ((1n << 80n) - 1n),
  agentVaultId: (packed: bigint) => Number((packed >> 144n) & 0xffffn),
  vaultId: (packed: bigint) => Number((packed >> 128n) & 0xffffn),
  address: (packed: bigint) => packed & ((1n << 160n) - 1n),
}

const RECIPIENT = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'

const FIXTURES = [
  {
    what: 'FXRP transfer — value in drops, a 20-byte recipient in bytes 12–31',
    input: { instructionId: 0x01, value: 1_000_000n, recipient: RECIPIENT },
    hex: '0x0100000000000000000f4240dddf991858311597bfd3d125cb342a0d4b56ea0a',
  },
  {
    what: 'Firelight deposit — value in drops, a vault id in bytes 14–15',
    input: { instructionId: 0x11, value: 500_000n, vaultId: 1 },
    hex: '0x11000000000000000007a1200000000100000000000000000000000000000000',
  },
  {
    what: 'Upshift requestRedeem — shares, a vault id, and a non-zero wallet identifier',
    input: { instructionId: 0x22, value: 250_000n, vaultId: 3, walletId: 7 },
    hex: '0x22070000000000000003d0900000000300000000000000000000000000000000',
  },
  {
    what: 'FXRP redeem — lots, and no tail at all',
    input: { instructionId: 0x02, value: 2n },
    hex: '0x0200000000000000000000020000000000000000000000000000000000000000',
  },
  {
    what: 'Firelight reserve-and-deposit — BOTH an agent vault id and a vault id',
    input: { instructionId: 0x10, value: 5n, agentVaultId: 1, vaultId: 4 },
    hex: '0x1000000000000000000000050001000400000000000000000000000000000000',
  },
  {
    what: 'Upshift claim — a yyyymmdd date in the value field',
    input: { instructionId: 0x23, value: 20260813n, vaultId: 2 },
    hex: '0x2300000000000000013527cd0000000200000000000000000000000000000000',
  },
] as const

describe('the payment reference matches the Solidity layout', () => {
  it.each(FIXTURES)('$what', (fixture) => {
    expect(encodePaymentReference(fixture.input)).toBe(fixture.hex)

    const packed = BigInt(fixture.hex)
    expect(SHIFTS.instructionId(packed)).toBe(fixture.input.instructionId)
    expect(SHIFTS.value(packed)).toBe(fixture.input.value)

    const decoded = decodePaymentReference(fixture.hex)
    expect(decoded.instructionId).toBe(fixture.input.instructionId)
    expect(decoded.value).toBe(fixture.input.value)
    expect(decoded.walletId).toBe(fixture.input.walletId ?? 0)
  })

  it('round-trips every built-in instruction', () => {
    for (const instruction of BUILT_IN_INSTRUCTIONS) {
      const encoded = encodePaymentReference({
        instructionId: instruction.id,
        value: 42n,
        agentVaultId: 11,
        vaultId: 22,
        recipient: RECIPIENT,
      })
      const decoded = decodePaymentReference(encoded)
      expect(decoded.instructionId, instruction.action).toBe(instruction.id)
      expect(decoded.value, instruction.action).toBe(42n)
      expect(decoded.denomination, instruction.action).toBe(instruction.denomination)
    }
  })
})

describe('the overlapping tail windows', () => {
  it('never surfaces an agent vault id or vault id for a transfer', () => {
    // Bytes 12–13 of this recipient are 0xDddF — a perfectly plausible-looking uint16. A
    // decoder that read every window would print "agent vault 56799" beside a real one.
    const encoded = encodePaymentReference({
      instructionId: 0x01,
      value: 1_000_000n,
      recipient: RECIPIENT,
    })
    const packed = BigInt(encoded)
    expect(SHIFTS.agentVaultId(packed)).toBe(0xdddf)
    expect(SHIFTS.vaultId(packed)).toBe(0x9918)

    const decoded = decodePaymentReference(encoded)
    expect(decoded.recipient?.toLowerCase()).toBe(RECIPIENT.toLowerCase())
    expect(decoded.agentVaultId).toBeUndefined()
    expect(decoded.vaultId).toBeUndefined()
  })

  it('never surfaces a recipient for a vault instruction', () => {
    const decoded = decodePaymentReference(
      encodePaymentReference({ instructionId: 0x11, value: 500_000n, vaultId: 1 }),
    )
    expect(decoded.vaultId).toBe(1)
    expect(decoded.recipient).toBeUndefined()
    expect(decoded.agentVaultId).toBeUndefined()
  })

  it('reads both ids for a reserve-and-deposit, which genuinely carries both', () => {
    const decoded = decodePaymentReference(
      encodePaymentReference({ instructionId: 0x20, value: 5n, agentVaultId: 1, vaultId: 4 }),
    )
    expect(decoded.agentVaultId).toBe(1)
    expect(decoded.vaultId).toBe(4)
  })
})

describe('refusals — every one of these is a revert the chain would raise after the XRP has moved', () => {
  it('refuses a zero value, which PaymentReferenceParser reverts on', () => {
    expect(() => encodePaymentReference({ instructionId: 0x02, value: 0n })).toThrow(/greater than zero/)
  })

  it('refuses a value wider than the 80-bit field', () => {
    expect(() => encodePaymentReference({ instructionId: 0x02, value: 1n << 80n })).toThrow(/80 bits/)
  })

  it('refuses a zero vault id and a zero agent vault id', () => {
    expect(() => encodePaymentReference({ instructionId: 0x11, value: 1n, vaultId: 0 })).toThrow(
      /vault id/,
    )
    expect(() =>
      encodePaymentReference({ instructionId: 0x00, value: 1n, agentVaultId: 0 }),
    ).toThrow(/agent vault id/)
  })

  it('refuses a missing vault id rather than silently encoding zero', () => {
    expect(() => encodePaymentReference({ instructionId: 0x11, value: 1n })).toThrow(/vault id/)
  })

  it('refuses the zero recipient, which the parser reverts on', () => {
    expect(() =>
      encodePaymentReference({
        instructionId: 0x01,
        value: 1n,
        recipient: '0x0000000000000000000000000000000000000000',
      }),
    ).toThrow(/zero address/)
  })

  it('refuses a malformed recipient', () => {
    expect(() =>
      encodePaymentReference({ instructionId: 0x01, value: 1n, recipient: '0xnope' }),
    ).toThrow(/20-byte EVM address/)
  })

  it('refuses an instruction id the kit cannot build', () => {
    expect(() => encodePaymentReference({ instructionId: 0x33, value: 1n })).toThrow(/0x33/)
  })

  it('refuses a wallet identifier outside one byte', () => {
    expect(() =>
      encodePaymentReference({ instructionId: 0x02, value: 1n, walletId: 256 }),
    ).toThrow(/0 to 255/)
  })

  it('refuses a reference that is not 32 bytes', () => {
    expect(() => decodePaymentReference('0x1234')).toThrow(/32 bytes/)
  })
})

describe('an instruction the kit does not recognise', () => {
  it('decodes what it can and claims no tail, rather than throwing or hiding it', () => {
    // A deployment may dispatch an instruction added after this table was written. The
    // account's history must still show it happened.
    const unknown = `0x3300000000000000000000070001000200000000000000000000000000000000` as const
    const decoded = decodePaymentReference(unknown)
    expect(decoded.instructionId).toBe(0x33)
    expect(decoded.instruction).toBeUndefined()
    expect(decoded.denomination).toBeUndefined()
    expect(decoded.value).toBe(7n)
    expect(decoded.vaultId).toBeUndefined()
    expect(decoded.agentVaultId).toBeUndefined()
    expect(decoded.recipient).toBeUndefined()
  })
})
