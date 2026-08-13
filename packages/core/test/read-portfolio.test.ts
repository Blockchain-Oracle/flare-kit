import { describe, expect, it } from 'vitest'
import { createAccountContext, supplyReadOnly, walletConnected } from '../src/account.js'
import { isObserved } from '../src/observation.js'
import { readPortfolio } from '../src/fassets/read-portfolio.js'
import { ALICE, COSTON2, XRPL_ALICE, XRPL_TESTNET } from './portfolio-fixtures.js'

// M2-R4: "readPortfolio returns observations across both identities: C2FLR and
// XRP native balances, the FAsset balance, and open operations from the
// registry."
// M2-AC4: an unreadable source is unavailable, never zero.

const CHAIN_ID = 114

function reader(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    async getBalance() {
      if ('getBalance' in overrides) throw overrides['getBalance']
      return 100_000000000000000000n
    },
    async readContract({ functionName }: { functionName: string }) {
      if (functionName in overrides) throw overrides[functionName]
      return 24_800000n
    },
  }
}

function xrplClient(overrides: { fail?: unknown } = {}) {
  return {
    async getAccountInfo() {
      if ('fail' in overrides) throw overrides.fail
      return { balanceDrops: 84_950000n, sequence: 1 }
    },
    async getTransaction() {
      return { found: false, validated: false, succeeded: false }
    },
    async getCurrentLedgerIndex() {
      return 1
    },
  }
}

const bothConnected = () =>
  createAccountContext({
    evm: walletConnected('evm', ALICE, COSTON2),
    xrpl: walletConnected('xrpl', XRPL_ALICE, XRPL_TESTNET),
  })

const base = () => ({
  client: reader(),
  xrpl: xrplClient(),
  chainId: CHAIN_ID,
  openOperations: [],
  now: 5_000,
})

describe('readPortfolio', () => {
  it('reads C2FLR, the FAsset and XRP across both identities', async () => {
    const portfolio = await readPortfolio({ ...base(), context: bothConnected() })
    const assets = portfolio.positions.map((entry) => entry.asset).sort()
    expect(assets).toEqual(['C2FLR', 'FTestXRP', 'XRP'])
  })

  it('labels every value with its source class, provider and network', async () => {
    const portfolio = await readPortfolio({ ...base(), context: bothConnected() })
    for (const entry of portfolio.positions) {
      expect(entry.balance.source.class).toBe('chain')
      expect(entry.balance.source.provider.length).toBeGreaterThan(0)
      expect(entry.balance.observedAt).toBe(5_000)
    }
    const xrp = portfolio.positions.find((entry) => entry.asset === 'XRP')
    expect(xrp?.balance.source.network).toBe('XRP Ledger Testnet')
    const flare = portfolio.positions.find((entry) => entry.asset === 'C2FLR')
    expect(flare?.balance.source.network).toBe('Flare Testnet Coston2')
  })

  it('carries exact base units with the asset and its scale', async () => {
    const portfolio = await readPortfolio({ ...base(), context: bothConnected() })
    const xrp = portfolio.positions.find((entry) => entry.asset === 'XRP')
    expect(isObserved(xrp!.balance) && xrp!.balance.value.value).toBe(84_950000n)
    expect(isObserved(xrp!.balance) && xrp!.balance.value.decimals).toBe(6)
    const flare = portfolio.positions.find((entry) => entry.asset === 'C2FLR')
    expect(isObserved(flare!.balance) && flare!.balance.value.decimals).toBe(18)
  })

  it('names the FAsset by its deployed symbol, not a hardcoded one', async () => {
    // Coston2 deploys FTestXRP; mainnet deploys FXRP. The registry decides.
    const portfolio = await readPortfolio({ ...base(), context: bothConnected() })
    expect(portfolio.positions.some((entry) => entry.asset === 'FTestXRP')).toBe(true)
  })

  it('asks only for the identities that are attached', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      context: createAccountContext({ evm: walletConnected('evm', ALICE, COSTON2) }),
    })
    expect(portfolio.positions.every((entry) => entry.family === 'evm')).toBe(true)
    expect(portfolio.coverage.xrpl).toBe('not-connected')
  })

  it('reads a read-only identity exactly as it reads a wallet', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      context: createAccountContext({ xrpl: supplyReadOnly('xrpl', XRPL_ALICE, XRPL_TESTNET) }),
    })
    const xrp = portfolio.positions.find((entry) => entry.asset === 'XRP')
    expect(isObserved(xrp!.balance) && xrp!.balance.value.value).toBe(84_950000n)
    expect(portfolio.readOnly).toBe(true)
  })
})

describe('a source that will not answer', () => {
  it('reports XRP as unavailable with the reason, never as zero', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      xrpl: xrplClient({ fail: new Error('socket hang up') }),
      context: bothConnected(),
    })
    const xrp = portfolio.positions.find((entry) => entry.asset === 'XRP')
    expect(xrp?.balance.status).toBe('unavailable')
    expect(isObserved(xrp!.balance)).toBe(false)
    expect(portfolio.coverage.xrpl).toBe('unavailable')
  })

  it('keeps the reason the endpoint gave, rather than a generic one', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      xrpl: xrplClient({ fail: new Error('socket hang up') }),
      context: bothConnected(),
    })
    const xrp = portfolio.positions.find((entry) => entry.asset === 'XRP')
    expect(xrp?.balance.status === 'unavailable' && xrp.balance.reason).toContain('socket hang up')
  })

  it('lets one chain fail without taking the other down with it', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      xrpl: xrplClient({ fail: new Error('socket hang up') }),
      context: bothConnected(),
    })
    const flare = portfolio.positions.find((entry) => entry.asset === 'C2FLR')
    expect(isObserved(flare!.balance)).toBe(true)
    expect(portfolio.coverage.evm).toBe('covered')
    expect(portfolio.partialCoverage).toBe(true)
  })

  it('reports the FAsset as unavailable when only that call fails', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      client: reader({ balanceOf: new Error('execution reverted') }),
      context: bothConnected(),
    })
    const fasset = portfolio.positions.find((entry) => entry.asset === 'FTestXRP')
    expect(fasset?.balance.status).toBe('unavailable')
    const flare = portfolio.positions.find((entry) => entry.asset === 'C2FLR')
    expect(isObserved(flare!.balance)).toBe(true)
  })
})

describe('open operations', () => {
  it('carries them through as local observations of our own record', async () => {
    const portfolio = await readPortfolio({
      ...base(),
      context: bothConnected(),
      openOperations: [
        {
          schemaVersion: 1,
          id: 'op_1',
          capability: 'fassets.direct-mint',
          network: CHAIN_ID,
          intent: {},
          quoteHistory: [],
          state: 'awaiting_external',
          steps: [],
          evidence: [],
          attempts: [],
          createdAt: 1_000,
          updatedAt: 4_000,
        },
      ],
    })
    expect(portfolio.pending).toHaveLength(1)
    expect(portfolio.pending[0]?.operationId).toBe('op_1')
    expect(portfolio.pending[0]?.capability).toBe('fassets.direct-mint')
    expect(portfolio.pending[0]?.state).toBe('awaiting_external')
  })
})
