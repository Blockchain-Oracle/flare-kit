import { describe, expect, it } from 'vitest'
import { createWalletClient, http, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { x402For } from '@flarekit-dev/contracts'
import { eip3009Domain, encodeXPayment, parseChallenge, signAuthorization } from '@flarekit-dev/core'
import {
  buildChallenge,
  decodePaymentHeader,
  settlePayment,
  syntheticResource,
  type X402ChallengeConfig,
  type X402ServerContext,
} from '../src/x402-settle.js'

const D = x402For('coston2')!
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const A = privateKeyToAccount(KEY)
const NONCE = `0x${'33'.repeat(32)}` as Hex
const TX = `0x${'ab'.repeat(32)}` as Hex
const PID = `0x${'cd'.repeat(32)}` as Hex
const DOMAIN = eip3009Domain(D.token.eip712Name, D.token.eip712Version, 114, D.token.address)

const cfg: X402ChallengeConfig = {
  resourcePath: '/api/demo',
  network: 'flare-coston2',
  payee: D.payee,
  token: D.token.address,
  tokenSymbol: D.token.symbol,
  facilitator: D.facilitator,
  chainId: 114,
  maxTimeoutSeconds: 300,
  price: 100_000n,
}

function fakePublic(opts: { valid?: boolean; receiptStatus?: 'success' | 'reverted' } = {}): PublicClient {
  return {
    async readContract({ functionName }: { functionName: string }) {
      if (functionName === 'verifyPayment') return [PID, opts.valid ?? true]
      throw new Error(`unexpected read ${functionName}`)
    },
    async simulateContract() {
      return { request: { address: D.facilitator, functionName: 'settlePayment' } }
    },
    async waitForTransactionReceipt() {
      return { status: opts.receiptStatus ?? 'success', blockNumber: 1n }
    },
  } as unknown as PublicClient
}

const fakeWallet = (): WalletClient =>
  ({ account: { address: D.payee, type: 'local' }, async writeContract() { return TX } }) as unknown as WalletClient

function ctx(pub: PublicClient): X402ServerContext {
  return { publicClient: pub, walletClient: fakeWallet(), facilitator: D.facilitator, token: D.token.address, payee: D.payee, minAmount: 100_000n, domain: DOMAIN }
}

async function paymentHeader(value: bigint, from: Address = A.address, to: Address = D.payee): Promise<string> {
  const wallet = createWalletClient({ account: A, transport: http('http://localhost:0') })
  const auth = { from, to, value, validAfter: 0n, validBefore: 4_000_000_000n, nonce: NONCE }
  const sig = await signAuthorization(wallet, DOMAIN, auth)
  return encodeXPayment(auth, sig, D.token.address)
}

describe('x402 challenge (M9-R6/R7)', () => {
  it('the 402 challenge is demo-labelled and carries the registry addresses', () => {
    const req = buildChallenge(cfg).accepts[0]!
    expect(req.asset).toBe('mUSDT0 (demo)')
    expect(req.payTo).toBe(D.payee)
    expect(req.extra.tokenAddress).toBe(D.token.address)
    expect(req.extra.facilitatorAddress).toBe(D.facilitator)
  })

  it("core's parseChallenge reads the server's 402 and derives demoToken TRUE from the registry", () => {
    const c = parseChallenge(buildChallenge(cfg), 1_000)
    expect(c.demoToken).toBe(true)
    expect(c.maxAmountRequired).toBe(100_000n)
    expect(c.payTo).toBe(D.payee)
    expect(c.expiresAt).toBe(1_000 + 300 * 1000)
  })

  it('the synthetic resource invents no data (no flarePrice, no secret)', () => {
    const r = syntheticResource(1234, { paymentId: PID, txHash: TX })
    expect(Object.keys(r).sort()).toEqual(['demo', 'note', 'servedAt', 'settlement'])
    expect(JSON.stringify(r)).not.toMatch(/flarePrice|secret/i)
  })
})

describe('x402 settle (M9-R6)', () => {
  it('decodePaymentHeader round-trips with core.encodeXPayment', async () => {
    const decoded = decodePaymentHeader(await paymentHeader(100_000n))
    expect(decoded?.from.toLowerCase()).toBe(A.address.toLowerCase())
    expect(decoded?.value).toBe('100000')
    expect(decoded?.token.toLowerCase()).toBe(D.token.address.toLowerCase())
  })

  it('rejects an under-value payment (402, before settling)', async () => {
    const res = await settlePayment(ctx(fakePublic()), await paymentHeader(50n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(402)
  })

  it('rejects an authorization whose signer != from (402)', async () => {
    // sign as A but claim from = the payee (a different address)
    const header = await paymentHeader(100_000n, D.payee)
    const res = await settlePayment(ctx(fakePublic()), header)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(402)
  })

  it('settles a valid authorization and returns the paymentId + tx hash', async () => {
    const res = await settlePayment(ctx(fakePublic({ valid: true })), await paymentHeader(100_000n))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.paymentId).toBe(PID)
      expect(res.txHash).toBe(TX)
    }
  })

  it('rejects when the facilitator says the authorization is invalid', async () => {
    const res = await settlePayment(ctx(fakePublic({ valid: false })), await paymentHeader(100_000n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(402)
  })

  it('rejects a mined-but-REVERTED settlement (never serves the resource for a reverted tx)', async () => {
    const res = await settlePayment(ctx(fakePublic({ valid: true, receiptStatus: 'reverted' })), await paymentHeader(100_000n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(502)
  })

  it('rejects an authorization whose `to` is not the configured payee (no free-resource bypass)', async () => {
    // The payer signs a self-transfer (to = A, not the payee) — this must be refused
    // BEFORE settling, or an attacker gets the resource for free.
    const header = await paymentHeader(100_000n, A.address, A.address)
    const res = await settlePayment(ctx(fakePublic()), header)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(402)
  })

  it('returns a 400 (not a crash) for a malformed X-Payment header', async () => {
    const junk = Buffer.from(JSON.stringify({ token: 123, value: 'abc' })).toString('base64')
    const res = await settlePayment(ctx(fakePublic()), junk)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(400)
  })

  it('decodePaymentHeader returns null for wrong-typed fields', () => {
    expect(decodePaymentHeader(Buffer.from(JSON.stringify({ from: '0x1', to: '0x2', token: 123, value: '1', validAfter: '0', validBefore: '9', nonce: '0x0', v: 27, r: '0x', s: '0x' })).toString('base64'))).toBeNull()
    expect(decodePaymentHeader(Buffer.from(JSON.stringify({ from: '0x1', to: '0x2', token: '0x3', value: 'notnumber', validAfter: '0', validBefore: '9', nonce: '0x0', v: 27, r: '0x', s: '0x' })).toString('base64'))).toBeNull()
  })
})
