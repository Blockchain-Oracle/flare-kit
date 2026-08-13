import { amount } from '../src/amounts.js'
import { createAccountContext, walletConnected } from '../src/account.js'
import { type Observation, observe } from '../src/observation.js'
import { type PortfolioPosition, position } from '../src/portfolio.js'

/** The funded live accounts from `.thoughts/verification/`, so the fixtures
 * describe holdings that actually exist rather than invented round numbers. */
export const COSTON2 = { name: 'Coston2', chainId: 114 } as const
export const XRPL_TESTNET = { name: 'XRPL Testnet' } as const
export const ALICE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
export const XRPL_ALICE = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

export const chainSource = {
  class: 'chain',
  provider: 'Coston2 RPC',
  network: 'Coston2',
  chainId: 114,
} as const

export const xrplSource = {
  class: 'chain',
  provider: 'XRPL Testnet RPC',
  network: 'XRPL Testnet',
} as const

export const indexerSource = {
  class: 'indexer',
  provider: 'Example indexer',
  network: 'Coston2',
} as const

export const c2flr = (value: bigint) => amount(value, 18, 'C2FLR')
export const xrp = (value: bigint) => amount(value, 6, 'XRP')
export const fxrp = (value: bigint) => amount(value, 6, 'FTestXRP')

export function flarePosition(balance: Observation<ReturnType<typeof c2flr>>): PortfolioPosition {
  return position({
    id: 'evm:native',
    kind: 'native',
    family: 'evm',
    account: ALICE,
    network: COSTON2,
    asset: 'C2FLR',
    balance,
  })
}

export function xrplPosition(balance: Observation<ReturnType<typeof xrp>>): PortfolioPosition {
  return position({
    id: 'xrpl:native',
    kind: 'native',
    family: 'xrpl',
    account: XRPL_ALICE,
    network: XRPL_TESTNET,
    asset: 'XRP',
    balance,
  })
}

export function fAssetPosition(balance: Observation<ReturnType<typeof fxrp>>): PortfolioPosition {
  return position({
    id: 'evm:fasset',
    kind: 'fasset',
    family: 'evm',
    account: ALICE,
    network: COSTON2,
    asset: 'FTestXRP',
    balance,
  })
}

export const nativeFlare = (at = 1_000) =>
  flarePosition(observe(c2flr(100_000000000000000000n), chainSource, at))

export const nativeXrp = (at = 1_000) => xrplPosition(observe(xrp(84_950000n), xrplSource, at))

export const fAsset = (at = 1_000) =>
  position({
    id: 'evm:fasset',
    kind: 'fasset',
    family: 'evm',
    account: ALICE,
    network: COSTON2,
    asset: 'FTestXRP',
    balance: observe(fxrp(24_800000n), chainSource, at),
  })

export const bothConnected = () =>
  createAccountContext({
    evm: walletConnected('evm', ALICE, COSTON2),
    xrpl: walletConnected('xrpl', XRPL_ALICE, XRPL_TESTNET),
  })
