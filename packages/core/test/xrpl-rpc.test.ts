import { describe, expect, it, vi } from 'vitest'
import { createXrplClient } from '../src/xrpl-rpc.js'

const TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'
const ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function reply(body: unknown, status = 200) {
  return { status, ok: status === 200, text: async () => JSON.stringify(body) } as Response
}

const validatedTx = {
  result: {
    status: 'success',
    validated: true,
    hash: TX,
    ledger_index: 4_821_766,
    meta: { TransactionResult: 'tesSUCCESS' },
  },
}

describe('transaction finality', () => {
  it('reports a validated, successful payment as final', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(validatedTx))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    const result = await xrpl.getTransaction(TX)
    expect(result.found).toBe(true)
    expect(result.validated).toBe(true)
    expect(result.succeeded).toBe(true)
    expect(result.ledgerIndex).toBe(4_821_766)
  })

  it('does not treat an unvalidated transaction as final', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply({ result: { status: 'success', validated: false, hash: TX } }))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    const result = await xrpl.getTransaction(TX)
    expect(result.validated).toBe(false)
    expect(result.succeeded).toBe(false)
  })

  it('reports a validated failure as found but not succeeded', async () => {
    // tecPATH_DRY and friends are validated, and they did not pay anyone.
    const fetchMock = vi.fn().mockResolvedValue(
      reply({
        result: {
          status: 'success',
          validated: true,
          hash: TX,
          meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' },
        },
      }),
    )
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    const result = await xrpl.getTransaction(TX)
    expect(result.found).toBe(true)
    expect(result.validated).toBe(true)
    expect(result.succeeded).toBe(false)
    expect(result.resultCode).toBe('tecUNFUNDED_PAYMENT')
  })

  it('treats a not-found transaction as unknown, never as failed', async () => {
    // A submitted payment the node has not indexed yet is not a failure.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply({ result: { status: 'error', error: 'txnNotFound' } }))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    const result = await xrpl.getTransaction(TX)
    expect(result.found).toBe(false)
    expect(result.validated).toBe(false)
    expect(result.succeeded).toBe(false)
  })

  it('surfaces a transport failure as retryable, with nothing moved', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    await expect(xrpl.getTransaction(TX)).rejects.toMatchObject({
      recovery: 'safe_to_retry',
      valueMoved: 'no',
    })
  })
})

describe('account and ledger reads', () => {
  it('reads balance and sequence for building a payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply({
        result: {
          status: 'success',
          account_data: { Balance: '100000000', Sequence: 42 },
          ledger_current_index: 4_821_800,
        },
      }),
    )
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    const info = await xrpl.getAccountInfo(ACCOUNT)
    expect(info.balanceDrops).toBe(100_000_000n)
    expect(info.sequence).toBe(42)
  })

  it('keeps the balance exact as drops, never as a float', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply({
        result: {
          status: 'success',
          account_data: { Balance: '99999999999999999', Sequence: 1 },
        },
      }),
    )
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    expect((await xrpl.getAccountInfo(ACCOUNT)).balanceDrops).toBe(99_999_999_999_999_999n)
  })

  it('reports an unfunded account clearly rather than throwing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply({ result: { status: 'error', error: 'actNotFound' } }))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    await expect(xrpl.getAccountInfo(ACCOUNT)).rejects.toMatchObject({
      code: 'XRPL_ACCOUNT_NOT_FOUND',
    })
  })

  it('reads the current ledger index for a payment deadline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply({ result: { status: 'success', ledger_current_index: 4_821_800 } }))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    expect(await xrpl.getCurrentLedgerIndex()).toBe(4_821_800)
  })
})

describe('request shape', () => {
  it('posts the standard XRPL JSON-RPC envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(validatedTx))
    const xrpl = createXrplClient({ jsonRpcUrl: 'https://x', fetch: fetchMock })
    await xrpl.getTransaction(TX)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://x')
    expect(JSON.parse(init.body as string)).toEqual({
      method: 'tx',
      params: [{ transaction: TX, binary: false }],
    })
  })
})
