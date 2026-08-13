import { amount } from './amounts.js'
import { createAccountContext, supplyReadOnly, walletConnected } from './account.js'
import { evidence } from './evidence.js'
import { type Observation, observe, unavailable } from './observation.js'
import type { Amount } from './amounts.js'
import type { OperationRecord } from './operation.js'
import {
  type Portfolio,
  type PortfolioPosition,
  type SourceConflict,
  assemblePortfolio,
  portfolioConflicts,
  position,
} from './portfolio.js'
import { MOCK_EPOCH } from './mock-config.js'

/**
 * The labelled mock producer for portfolio and activity surfaces (M2-AC1).
 *
 * This is the only place `indexer`, `provider` and `cache` observations come
 * from. No indexer adapter is built (see
 * `.thoughts/decisions/2026-08-04-m2-open-questions.md`), so the live kit
 * produces `chain` and `local` only — and a mock source is never a fallback the
 * live kit reaches after a failure. Every identifier and address below is
 * visibly fake so a screenshot cannot pass as a live one.
 */

const MOCK_NETWORK = { name: 'Mock Network', chainId: 114 } as const
const MOCK_UNDERLYING = { name: 'Mock Ledger' } as const

export const MOCK_EVM_ACCOUNT = '0xM0CK000000000000000000000000000000000000'
export const MOCK_XRPL_ACCOUNT = 'rMOCKAccountNotARea1Ledger1dentity'

const CHAIN: Observation<Amount>['source'] = {
  class: 'chain',
  provider: 'Mock chain reader',
  network: 'Mock Network',
  chainId: 114,
}
const LEDGER: Observation<Amount>['source'] = {
  class: 'chain',
  provider: 'Mock ledger reader',
  network: 'Mock Ledger',
}
const INDEXER: Observation<Amount>['source'] = {
  class: 'indexer',
  provider: 'Mock indexer',
  network: 'Mock Network',
  chainId: 114,
}
const PROVIDER: Observation<Amount>['source'] = {
  class: 'provider',
  provider: 'Mock price provider',
  network: 'Mock Network',
  chainId: 114,
}

const mflr = (value: bigint) => amount(value, 18, 'MFLR')
const mxrp = (value: bigint) => amount(value, 6, 'MXRP')
const fmock = (value: bigint) => amount(value, 6, 'FMockXRP')

function evmPosition(
  id: string,
  kind: 'native' | 'fasset',
  asset: string,
  balance: Observation<Amount>,
): PortfolioPosition {
  return position({
    id,
    kind,
    family: 'evm',
    account: MOCK_EVM_ACCOUNT,
    network: MOCK_NETWORK,
    asset,
    balance,
  })
}

function xrplPosition(balance: Observation<Amount>): PortfolioPosition {
  return position({
    id: 'xrpl:native',
    kind: 'native',
    family: 'xrpl',
    account: MOCK_XRPL_ACCOUNT,
    network: MOCK_UNDERLYING,
    asset: 'MXRP',
    balance,
  })
}

/** One scenario per USER-01 required state, minus `loading` — which is the
 * absence of a portfolio rather than a portfolio in a particular shape. */
export const MOCK_PORTFOLIO_SCENARIOS = [
  'ready',
  'no-assets',
  'read-only',
  'partial-coverage',
  'stale',
  'source-conflict',
  'provider-unavailable',
] as const

export type MockPortfolioScenario = (typeof MOCK_PORTFOLIO_SCENARIOS)[number]

const bothWallets = () =>
  createAccountContext({
    evm: walletConnected('evm', MOCK_EVM_ACCOUNT, MOCK_NETWORK),
    xrpl: walletConnected('xrpl', MOCK_XRPL_ACCOUNT, MOCK_UNDERLYING),
  })

export function mockPortfolio(
  scenario: MockPortfolioScenario = 'ready',
  at: number = MOCK_EPOCH,
): Portfolio {
  if (scenario === 'no-assets') {
    return assemblePortfolio({
      context: bothWallets(),
      positions: [
        evmPosition('evm:native', 'native', 'MFLR', observe(mflr(0n), CHAIN, at)),
        evmPosition('evm:fasset', 'fasset', 'FMockXRP', observe(fmock(0n), CHAIN, at)),
        xrplPosition(observe(mxrp(0n), LEDGER, at)),
      ],
      pending: [],
      at,
    })
  }

  if (scenario === 'read-only') {
    return assemblePortfolio({
      context: createAccountContext({
        evm: supplyReadOnly('evm', MOCK_EVM_ACCOUNT, MOCK_NETWORK),
        xrpl: supplyReadOnly('xrpl', MOCK_XRPL_ACCOUNT, MOCK_UNDERLYING),
      }),
      positions: readyPositions(at),
      pending: [],
      at,
    })
  }

  if (scenario === 'partial-coverage') {
    // Only the Flare identity is attached. The ledger side is unasked, which
    // is a different claim from it being empty.
    return assemblePortfolio({
      context: createAccountContext({
        evm: walletConnected('evm', MOCK_EVM_ACCOUNT, MOCK_NETWORK),
      }),
      positions: readyPositions(at).filter((entry) => entry.family === 'evm'),
      pending: [],
      at,
    })
  }

  if (scenario === 'stale') {
    // Observed long enough ago that the chain class's budget has passed.
    const old = at - 10 * 60_000
    return assemblePortfolio({ context: bothWallets(), positions: readyPositions(old), pending: [], at })
  }

  if (scenario === 'provider-unavailable') {
    return assemblePortfolio({
      context: bothWallets(),
      positions: [
        evmPosition('evm:native', 'native', 'MFLR', observe(mflr(120_000000000000000000n), CHAIN, at)),
        evmPosition(
          'evm:fasset',
          'fasset',
          'FMockXRP',
          unavailable(PROVIDER, at, 'The mock price provider did not respond.'),
        ),
        xrplPosition(unavailable(LEDGER, at, 'The mock ledger reader did not respond.')),
      ],
      pending: [],
      at,
    })
  }

  return assemblePortfolio({ context: bothWallets(), positions: readyPositions(at), pending: [], at })
}

function readyPositions(at: number): readonly PortfolioPosition[] {
  return [
    evmPosition('evm:native', 'native', 'MFLR', observe(mflr(120_500000000000000000n), CHAIN, at)),
    evmPosition('evm:fasset', 'fasset', 'FMockXRP', observe(fmock(31_250000n), CHAIN, at)),
    xrplPosition(observe(mxrp(84_950000n), LEDGER, at)),
  ]
}

/**
 * What an indexer claims about the same positions. USER-03's canonical/indexed
 * conflict needs two source classes disagreeing, and the chain read is always
 * the canonical one.
 */
function mockIndexedPositions(
  scenario: MockPortfolioScenario = 'ready',
  at: number = MOCK_EPOCH,
): readonly PortfolioPosition[] {
  const disagrees = scenario === 'source-conflict'
  return [
    evmPosition(
      'evm:native',
      'native',
      'MFLR',
      observe(mflr(disagrees ? 118_000000000000000000n : 120_500000000000000000n), INDEXER, at - 4_000),
    ),
    evmPosition(
      'evm:fasset',
      'fasset',
      'FMockXRP',
      observe(fmock(disagrees ? 29_000000n : 31_250000n), INDEXER, at - 4_000),
    ),
  ]
}

export function mockSourceConflicts(
  scenario: MockPortfolioScenario = 'source-conflict',
  at: number = MOCK_EPOCH,
): readonly SourceConflict[] {
  return portfolioConflicts(mockPortfolio(scenario, at), mockIndexedPositions(scenario, at))
}

/**
 * Two finished operations and one still in flight, each keeping its ledger
 * payment, its attestation round and its execution as three identifiers.
 */
export function mockOperationRecords(at: number = MOCK_EPOCH): readonly OperationRecord[] {
  const mint = (id: string, state: OperationRecord['state'], updatedAt: number): OperationRecord => ({
    schemaVersion: 1,
    id,
    capability: 'fassets.direct-mint',
    network: 114,
    intent: { amountXrp: '25.000000', recipient: MOCK_EVM_ACCOUNT, xrplAccount: MOCK_XRPL_ACCOUNT },
    quoteHistory: [],
    state,
    steps: [],
    evidence: [
      evidence({ kind: 'xrpl_tx', label: 'Ledger payment', value: `MOCK${id.toUpperCase()}PAYMENT`, observedAt: updatedAt - 900 }),
      evidence({ kind: 'fdc_round', label: 'Attestation round', value: '900001', observedAt: updatedAt - 600 }),
      evidence({ kind: 'flare_tx', label: 'Execution', value: `0xM0CK${id}EXECUTION`, observedAt: updatedAt }),
    ],
    attempts: [],
    createdAt: updatedAt - 1_800,
    updatedAt,
  })

  return [
    mint('op_mock_1', 'succeeded', at - 86_400_000),
    mint('op_mock_2', 'awaiting_external', at - 300_000),
    {
      ...mint('op_mock_3', 'action_required', at - 60_000),
      capability: 'fassets.redeem',
    },
  ]
}
