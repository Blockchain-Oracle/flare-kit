import { describe, expect, it } from 'vitest'
import { createWalletClient, http, hashDomain, getTypesForEIP712Domain, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { x402For } from '@flare-kit/contracts'
import { EIP3009_TRANSFER_TYPES, eip3009Domain, signAuthorization, recoverAuthorizationSigner } from '../src/x402-eip3009.js'

const TOKEN = x402For('coston2')!.token.address
// The deployed MockUSDT0's on-chain DOMAIN_SEPARATOR() read-back (M9 Task 2).
const ON_CHAIN_TOKEN_DOMAIN_SEPARATOR = '0x1d7bc96f000e0225b69006853e9948d7922fa574463822397abe8f2d958bd9d2'
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAYEE: Address = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const NONCE = `0x${'11'.repeat(32)}` as Hex

describe('x402 EIP-3009 (M9-R6)', () => {
  it('TransferWithAuthorization field order matches the token', () => {
    expect(EIP3009_TRANSFER_TYPES.TransferWithAuthorization.map((f) => f.name)).toEqual([
      'from',
      'to',
      'value',
      'validAfter',
      'validBefore',
      'nonce',
    ])
  })

  it('eip3009Domain("Mock USDT0","1",114,token) reproduces the DEPLOYED token domain separator', () => {
    const domain = eip3009Domain('Mock USDT0', '1', 114, TOKEN)
    const ds = hashDomain({ domain, types: { EIP712Domain: getTypesForEIP712Domain({ domain }) } } as never)
    expect(ds.toLowerCase()).toBe(ON_CHAIN_TOKEN_DOMAIN_SEPARATOR)
  })

  it('sign → recover round-trips to the signer (the facilitator accepts this authorization)', async () => {
    const account = privateKeyToAccount(KEY)
    const wallet = createWalletClient({ account, transport: http('http://localhost:0') })
    const domain = eip3009Domain('Mock USDT0', '1', 114, TOKEN)
    const auth = { from: account.address, to: PAYEE, value: 100_000n, validAfter: 0n, validBefore: 4_000_000_000n, nonce: NONCE }
    const sig = await signAuthorization(wallet, domain, auth)
    expect([27, 28]).toContain(sig.v)
    const recovered = await recoverAuthorizationSigner(domain, auth, sig)
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it('a tampered value recovers to a DIFFERENT address (the signature binds the whole auth)', async () => {
    const account = privateKeyToAccount(KEY)
    const wallet = createWalletClient({ account, transport: http('http://localhost:0') })
    const domain = eip3009Domain('Mock USDT0', '1', 114, TOKEN)
    const auth = { from: account.address, to: PAYEE, value: 100_000n, validAfter: 0n, validBefore: 4_000_000_000n, nonce: NONCE }
    const sig = await signAuthorization(wallet, domain, auth)
    const recovered = await recoverAuthorizationSigner(domain, { ...auth, value: 200_000n }, sig)
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase())
  })
})
