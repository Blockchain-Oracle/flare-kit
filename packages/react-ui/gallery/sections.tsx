import {
  MOCK_EPOCH,
  MOCK_PORTFOLIO_SCENARIOS,
  accountChanged,
  bindContext,
  buildActivity,
  createAccountContext,
  mockOperationRecords,
  mockPortfolio,
  mockSourceConflicts,
  networkName,
  parseReadOnlyIdentity,
  rejected,
  restoredSession,
  supplyReadOnly,
  walletConnected,
  walletUnavailable,
  wrongNetwork,
  type PendingOperation,
} from '@flare-kit/core'
import {
  AccountSheet,
  ActivityTable,
  NetworkResolutionSheet,
  PendingTray,
  PortfolioTable,
  SourceDrawer,
} from '../src/index.js'

/**
 * Every required state of every M2 surface, as data.
 *
 * Dev-only. This is the thing a person looks at to check the surfaces are
 * right, because a passing test says a string is present, not that the screen
 * is legible. It is not DEV-06 and it ships with nothing.
 */

const NOW = MOCK_EPOCH
const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const FLARE = { name: 'Flare Mainnet', chainId: 14 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const
const EVM = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const BOB = '0x0000000000000000000000000000000000000B0B'
const XRPL = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

export interface Case {
  readonly name: string
  readonly node: React.ReactNode
}

export interface Section {
  readonly id: string
  readonly title: string
  readonly cases: readonly Case[]
}

const pending = (state: PendingOperation['state'], id = 'op_mock_1'): PendingOperation => ({
  operationId: id,
  capability: 'fassets.direct-mint',
  state,
  network: 114,
  updatedAt: NOW - 30_000,
  source: { class: 'local', provider: 'Operation registry', network: networkName(114), chainId: 114 },
})

const ctx = (over: Parameters<typeof createAccountContext>[0]) => createAccountContext(over)
const boundToAlice = () => bindContext(ctx({ evm: walletConnected('evm', EVM, COSTON2) }), NOW)
const feed = () => buildActivity({ records: mockOperationRecords(NOW), at: NOW })

export const SECTIONS: readonly Section[] = [
  {
    id: 'sh-02',
    title: 'SH-02 AccountSheet',
    cases: [
      { name: 'disconnected', node: <AccountSheet context={ctx({})} onConnectEvm={() => {}} onConnectXrpl={() => {}} onSupplyReadOnly={() => {}} /> },
      { name: 'connecting', node: <AccountSheet context={ctx({ evm: { family: 'evm', status: 'connecting' } })} onConnectEvm={() => {}} /> },
      { name: 'rejected', node: <AccountSheet context={ctx({ evm: rejected('evm', 'The wallet declined the request.') })} onConnectEvm={() => {}} /> },
      { name: 'unavailable wallet', node: <AccountSheet context={ctx({ evm: walletUnavailable('evm', 'No EVM wallet is installed in this browser.') })} onSupplyReadOnly={() => {}} /> },
      { name: 'wrong network', node: <AccountSheet context={ctx({ evm: wrongNetwork('evm', EVM, FLARE, COSTON2) })} /> },
      { name: 'account changed', node: <AccountSheet context={ctx({ evm: accountChanged(walletConnected('evm', EVM, COSTON2), BOB) })} /> },
      { name: 'restored session', node: <AccountSheet context={ctx({ evm: restoredSession('evm', EVM, COSTON2, NOW) })} /> },
      { name: 'read-only supplied', node: <AccountSheet context={ctx({ xrpl: supplyReadOnly('xrpl', XRPL, XRPL_TESTNET) })} onConnectEvm={() => {}} /> },
      { name: 'invalid read-only identity', node: <AccountSheet context={ctx({ xrpl: parseReadOnlyIdentity('xrpl', 'not-an-address', XRPL_TESTNET) })} onSupplyReadOnly={() => {}} /> },
      { name: 'both ready', node: <AccountSheet context={ctx({ evm: walletConnected('evm', EVM, COSTON2), xrpl: walletConnected('xrpl', XRPL, XRPL_TESTNET) })} /> },
    ],
  },
  {
    id: 'sh-03',
    title: 'SH-03 NetworkResolutionSheet',
    cases: [
      { name: 'wrong network', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: wrongNetwork('evm', EVM, FLARE, COSTON2) })} affected="your quote for 25.000000 XRP" onSwitchNetwork={() => {}} /> },
      { name: 'wrong account', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: walletConnected('evm', BOB, COSTON2) })} affected="your quote for 25.000000 XRP" onReconnect={() => {}} /> },
      { name: 'switch rejected', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: wrongNetwork('evm', EVM, FLARE, COSTON2) })} status="switch-rejected" onSwitchNetwork={() => {}} /> },
      { name: 'unsupported combination', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: walletConnected('evm', EVM, COSTON2) })} status="unsupported-combination" /> },
      { name: 'restored', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: restoredSession('evm', EVM, COSTON2, NOW) })} onReconnect={() => {}} /> },
      { name: 'expired', node: <NetworkResolutionSheet binding={boundToAlice()} context={ctx({ evm: walletConnected('evm', EVM, COSTON2) })} status="expired" /> },
    ],
  },
  {
    id: 'user-01',
    title: 'USER-01 PortfolioTable',
    cases: [
      { name: 'loading', node: <PortfolioTable loading now={NOW} /> },
      ...MOCK_PORTFOLIO_SCENARIOS.map((scenario) => ({
        name: scenario,
        node: (
          <PortfolioTable
            portfolio={mockPortfolio(scenario, NOW)}
            now={NOW}
            hasConflict={scenario === 'source-conflict'}
            onOpenSources={() => {}}
          />
        ),
      })),
    ],
  },
  {
    id: 'user-02',
    title: 'USER-02 ActivityTable',
    cases: [
      { name: 'loading', node: <ActivityTable loading /> },
      { name: 'empty', node: <ActivityTable feed={buildActivity({ records: [], at: NOW })} /> },
      { name: 'ready', node: <ActivityTable feed={feed()} onExport={() => {}} /> },
      { name: 'backfilling', node: <ActivityTable feed={buildActivity({ records: [], at: NOW, backfilling: true })} /> },
      { name: 'partial coverage', node: <ActivityTable feed={feed()} entries={feed().entries.slice(0, 1)} /> },
      { name: 'export error', node: <ActivityTable feed={feed()} onExport={() => {}} exportError="Refusing to export: intent.seed must never leave this device." /> },
    ],
  },
  {
    id: 'user-03',
    title: 'USER-03 SourceDrawer',
    cases: [
      { name: 'ready', node: <SourceDrawer portfolio={mockPortfolio('ready', NOW)} now={NOW} /> },
      { name: 'canonical/indexed conflict', node: <SourceDrawer portfolio={mockPortfolio('source-conflict', NOW)} conflicts={mockSourceConflicts('source-conflict', NOW)} now={NOW} /> },
      { name: 'provider unavailable', node: <SourceDrawer portfolio={mockPortfolio('provider-unavailable', NOW)} now={NOW} /> },
    ],
  },
  {
    id: 'sh-10',
    title: 'SH-10 PendingTray',
    cases: [
      { name: 'loading', node: <PendingTray pending={[]} loading now={NOW} /> },
      { name: 'empty', node: <PendingTray pending={[]} now={NOW} /> },
      { name: 'active', node: <PendingTray pending={[pending('awaiting_external')]} now={NOW} onOpen={() => {}} /> },
      { name: 'action required', node: <PendingTray pending={[pending('action_required')]} now={NOW} onOpen={() => {}} /> },
      { name: 'partial', node: <PendingTray pending={[pending('submitted'), pending('action_required', 'op_mock_2')]} now={NOW} /> },
      { name: 'degraded source', node: <PendingTray pending={[pending('submitted')]} degraded now={NOW} /> },
      { name: 'restored', node: <PendingTray pending={[pending('submitted')]} restored now={NOW} /> },
    ],
  },
]
