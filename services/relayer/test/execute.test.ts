import { describe, expect, it } from 'vitest'
import { createWalletClient, http, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signPaymentRequest } from '@flarekit-dev/core'
import { gaslessFor } from '@flarekit-dev/contracts'
import { executePayment, type RelayerContext } from '../src/relayer-execute.js'

const D = gaslessFor('coston2')!
const KEY_A = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const A = privateKeyToAccount(KEY_A)
const RELAYER: Address = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const RECIPIENT = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d').address
const TX = `0x${'ab'.repeat(32)}` as Hex

function fakePublic(opts: {
  nonce?: bigint
  timestamp?: bigint
  balance?: bigint
  allowance?: bigint
  simulateThrows?: boolean
  receiptStatus?: 'success' | 'reverted'
}): PublicClient {
  return {
    async readContract({ functionName }: { functionName: string }) {
      if (functionName === 'getNonce') return opts.nonce ?? 0n
      if (functionName === 'balanceOf') return opts.balance ?? 10_000_000n
      if (functionName === 'allowance') return opts.allowance ?? 10_000_000n
      throw new Error(`unexpected read ${functionName}`)
    },
    async getBlock() {
      return { timestamp: opts.timestamp ?? 1_000_000n }
    },
    async simulateContract() {
      if (opts.simulateThrows) throw new Error('execution reverted: UnauthorizedRelayer')
      return { request: { address: D.forwarder, functionName: 'executePayment' } }
    },
    async waitForTransactionReceipt() {
      return { status: opts.receiptStatus ?? 'success', blockNumber: 42n }
    },
  } as unknown as PublicClient
}

const fakeWallet = (): WalletClient =>
  ({
    account: { address: RELAYER, type: 'local' },
    async writeContract() {
      return TX
    },
  }) as unknown as WalletClient

function ctx(pub: PublicClient): RelayerContext {
  return {
    publicClient: pub,
    walletClient: fakeWallet(),
    forwarder: D.forwarder,
    fxrp: D.fxrp.address,
    chainId: 114,
  }
}

async function sign(from: Address, amount: bigint, deadline: bigint, nonce: bigint): Promise<Hex> {
  const wallet = createWalletClient({ account: A, transport: http('http://localhost:0') })
  return signPaymentRequest(wallet, 114, D.forwarder, { from, to: RECIPIENT, amount, nonce, deadline })
}

describe('relayer executePayment (M9-R5)', () => {
  it('accepts a valid request, simulates, submits, and returns the tx hash', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.txHash).toBe(TX)
      expect(res.blockNumber).toBe('42')
    }
  })

  it('rejects a stale-nonce request (recovered signer != from)', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n) // signed with nonce 0
    // the relayer reads a DIFFERENT current nonce → recovery yields a different address
    const res = await executePayment(ctx(fakePublic({ nonce: 5n })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('bad-signature')
  })

  it('rejects a short-allowance request before submitting', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n, allowance: 0n })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('short-allowance')
  })

  it('rejects an expired request (chain time past the deadline)', async () => {
    const deadline = 999_999n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n, timestamp: 1_000_000n })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('expired')
  })

  it('rejects a mined-but-REVERTED executePayment (never reports a reverted relay as ok)', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n, receiptStatus: 'reverted' })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('submit-failed')
  })

  it('reports simulate-failed when the staticCall reverts (never submits)', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n, simulateThrows: true })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('simulate-failed')
  })

  it('never includes the operator key in any response', async () => {
    const deadline = 2_000_000n
    const sig = await sign(A.address, 1_000_000n, deadline, 0n)
    const res = await executePayment(ctx(fakePublic({ nonce: 0n })), {
      from: A.address,
      to: RECIPIENT,
      amount: 1_000_000n,
      deadline,
      signature: sig,
    })
    expect(JSON.stringify(res)).not.toContain(KEY_A.slice(2))
  })
})
