import { describe, expect, it } from 'vitest'
import { createWalletClient, http, hashDomain, getTypesForEIP712Domain, getAddress, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  GASLESS_DOMAIN_NAME,
  GASLESS_DOMAIN_VERSION,
  PAYMENT_REQUEST_TYPES,
  gaslessDomain,
  signPaymentRequest,
  recoverPaymentSigner,
} from '../src/gasless-eip712.js'

// The deployed Coston2 forwarder (M9 Task 2) and its on-chain getDomainSeparator()
// read-back — core's domain MUST reproduce this exact value or executePayment rejects.
const FORWARDER: Address = '0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17'
const ON_CHAIN_DOMAIN_SEPARATOR = '0xe255e2944866edc202bb6e8061fd5bba654d587b905e0dd1607af49210c1383b'
// A fixed well-known test key (hardhat account #0). signTypedData is local — no chain.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// EIP-712 validates address fields, so `to` must be a valid EIP-55 checksum.
const RECIPIENT: Address = getAddress('0x00000000000000000000000000000000000000b2')

describe('gasless EIP-712 (M9-R2)', () => {
  it('domain constants and PaymentRequest field order match the forwarder', () => {
    expect(GASLESS_DOMAIN_NAME).toBe('GaslessPaymentForwarder')
    expect(GASLESS_DOMAIN_VERSION).toBe('1')
    expect(PAYMENT_REQUEST_TYPES.PaymentRequest.map((f) => f.name)).toEqual(['from', 'to', 'amount', 'nonce', 'deadline'])
    expect(PAYMENT_REQUEST_TYPES.PaymentRequest.map((f) => f.type)).toEqual([
      'address',
      'address',
      'uint256',
      'uint256',
      'uint256',
    ])
  })

  it('gaslessDomain(114, forwarder) reproduces the DEPLOYED forwarder domain separator (byte-identity)', () => {
    const domain = gaslessDomain(114, FORWARDER)
    // hashDomain's generic over `types` does not accept a widened TypedDataDomain
    // cleanly; the argument is cast. The runtime hash is asserted against the value
    // read back from the on-chain forwarder, which is the real guarantee.
    const ds = hashDomain({ domain, types: { EIP712Domain: getTypesForEIP712Domain({ domain }) } } as never)
    expect(ds.toLowerCase()).toBe(ON_CHAIN_DOMAIN_SEPARATOR)
  })

  it('sign → recover round-trips to the signer (the relayer accepts this signature)', async () => {
    const account = privateKeyToAccount(TEST_KEY)
    const wallet = createWalletClient({ account, transport: http('http://localhost:0') })
    const message = { from: account.address, to: RECIPIENT, amount: 1_000_000n, nonce: 0n, deadline: 4_000_000_000n }
    const sig = await signPaymentRequest(wallet, 114, FORWARDER, message)
    const recovered = await recoverPaymentSigner(114, FORWARDER, message, sig)
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it('a tampered amount recovers to a DIFFERENT address (the signature binds the whole request)', async () => {
    const account = privateKeyToAccount(TEST_KEY)
    const wallet = createWalletClient({ account, transport: http('http://localhost:0') })
    const message = { from: account.address, to: RECIPIENT, amount: 1_000_000n, nonce: 0n, deadline: 4_000_000_000n }
    const sig = await signPaymentRequest(wallet, 114, FORWARDER, message)
    const recovered = await recoverPaymentSigner(114, FORWARDER, { ...message, amount: 2_000_000n }, sig)
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase())
  })
})
