import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createFlareKit } from '../src/fassets/flare-kit.js'

/**
 * The live kit. It satisfies the same `DirectMintKit` contract the mock does,
 * so one component tree runs against either.
 */

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

const PROTOCOL_READS: Record<string, unknown> = {
  directMintingPaymentAddress: 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p',
  getDirectMintingFeeBIPS: 25n,
  getDirectMintingMinimumFeeUBA: 100_000n,
  getDirectMintingExecutorFeeUBA: 100_000n,
  getDirectMintingLargeMintingThresholdUBA: 100_000_000_000n,
  getDirectMintingLargeMintingDelaySeconds: 3_600n,
  getDirectMintingOthersCanExecuteAfterSeconds: 7_200n,
  mintingPaused: false,
  emergencyPaused: false,
  symbol: 'FTestXRP',
  decimals: 6,
  directMintingDelayState: [0, 0n, 0n],
  // Redemption is lot-based, so the redeem reader needs this and the mint one does not.
  lotSize: 10_000_000n,
}

/** getSettings() return data: an offset, then one head word per field. */
const word = (n: bigint) => n.toString(16).padStart(64, '0')
const SETTINGS_DATA = `0x${word(32n)}${Array.from({ length: 60 }, (_, i) =>
  word({ 23: 500n, 24: 900n, 25: 50n, 26: 10_500n }[i] ?? 0n),
).join('')}`

function client(overrides: Record<string, unknown> = {}) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      const table = { ...PROTOCOL_READS, ...overrides }
      if (functionName in table) return table[functionName]
      throw new Error(`unexpected read ${functionName}`)
    }),
    simulateContract: vi.fn(async () => ({ request: {} })),
    // The redemption settings are only available through getSettings(), read
    // as raw bytes and decoded by position.
    call: vi.fn(async () => ({ data: SETTINGS_DATA })),
  }
}

const xrpl = {
  getTransaction: vi.fn(async () => ({ found: false, validated: false, succeeded: false })),
  getCurrentLedgerIndex: vi.fn(async () => 100),
  getAccountInfo: vi.fn(),
}
const fdc = {
  prepareRequest: vi.fn(async () => '0xdead'),
  retrieveProof: vi.fn(async () => {
    throw new Error('not yet')
  }),
}

describe('createFlareKit', () => {
  it('reads live protocol state and reports the chain’s own symbol', async () => {
    const kit = await createFlareKit({ client: client(), chainId: 114, xrpl, fdc })
    expect(kit.isMock).toBe(false)
    expect(kit.label).toMatch(/coston2/i)
    expect(kit.protocolState.fAssetSymbol).toBe('FTestXRP')
  })

  it('quotes from the live settings, matching what the chain charges', async () => {
    const kit = await createFlareKit({ client: client(), chainId: 114, xrpl, fdc })
    const quote = kit.quote(INTENT)
    // 250 XRP at 25 BIPS = 0.625000, which is above the 0.100000 minimum, so
    // the relative fee applies. Executor takes a further 0.100000.
    expect(quote.mintingFee.value).toBe(625_000n)
    expect(quote.executorFee.value).toBe(100_000n)
    expect(quote.mintedEstimate.value).toBe(249_275_000n)
    expect(quote.fAssetSymbol).toBe('FTestXRP')
  })

  it('starts an operation in the same shape the mock produces', async () => {
    const kit = await createFlareKit({ client: client(), chainId: 114, xrpl, fdc })
    const op = kit.start(INTENT)
    expect(op.capability).toBe('fassets.directMint')
    expect(op.state).toBe('ready')
    expect(op.network).toBe(114)
  })

  it('reconciles through the same reducer the mock drives', async () => {
    const kit = await createFlareKit({ client: client(), chainId: 114, xrpl, fdc })
    const op = kit.start(INTENT)
    const next = await kit.reconcile(op)
    // Nothing paid yet, so it stays put rather than inventing progress.
    expect(next.state).toBe('ready')
  })

  it('refuses to start when the chain cannot be read', async () => {
    const broken = {
      readContract: vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
      simulateContract: vi.fn(),
      call: vi.fn(async () => ({ data: SETTINGS_DATA })),
    }
    await expect(
      createFlareKit({ client: broken, chainId: 114, xrpl, fdc }),
    ).rejects.toMatchObject({ code: 'KIT_UNAVAILABLE', recovery: 'safe_to_retry' })
  })

  it('re-reads settings on refresh, because fees and pauses change', async () => {
    const c = client()
    const kit = await createFlareKit({ client: c, chainId: 114, xrpl, fdc })
    expect(kit.protocolState.mintingPaused).toBe(false)
    c.readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
      const table: Record<string, unknown> = { ...PROTOCOL_READS, mintingPaused: true }
      if (functionName in table) return table[functionName]
      throw new Error('unexpected')
    })
    await kit.refresh()
    expect(kit.protocolState.mintingPaused).toBe(true)
    expect(kit.quote(INTENT).canProceed).toBe(false)
  })
})

describe('mock mode is never a fallback (R-MOCK-004)', () => {
  it('does not reference the mock anywhere in the live kit', () => {
    // Structural, not behavioural: if the source cannot name the mock, no error
    // path can quietly become one.
    const source = readFileSync(
      fileURLToPath(new URL('../src/fassets/flare-kit.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/createMockKit|from '\.\.\/mock/)
  })

  it('throws rather than degrading when protocol reads fail', async () => {
    const broken = {
      readContract: vi.fn(async () => {
        throw new Error('down')
      }),
      simulateContract: vi.fn(),
      call: vi.fn(async () => ({ data: SETTINGS_DATA })),
    }
    const result = await createFlareKit({ client: broken, chainId: 114, xrpl, fdc }).catch(
      (e) => e,
    )
    expect(result).toBeInstanceOf(Error)
    expect((result as { isMock?: unknown }).isMock).toBeUndefined()
  })

  it('stays isMock false even when every downstream read is failing', async () => {
    const kit = await createFlareKit({
      client: client(),
      chainId: 114,
      xrpl: {
        ...xrpl,
        getTransaction: vi.fn(async () => {
          throw new Error('xrpl down')
        }),
      },
      fdc,
    })
    const next = await kit.reconcile(kit.start(INTENT))
    expect(kit.isMock).toBe(false)
    expect(next.state).not.toBe('failed')
  })
})
