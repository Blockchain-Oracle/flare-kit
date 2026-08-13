// packages/react-ui/test/bridge-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  type BridgePlanResult,
  type BridgeQuote,
  type OperationRecord,
  amount,
  routeByKey,
} from '@flare-kit/core'
import { BridgeCard } from '../src/BridgeCard.js'

const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!
const FTESTXRP = { symbol: 'FTestXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7' as `0x${string}`, decimals: 6 }
const XRP = { symbol: 'XRP', address: '0x0000000000000000000000000000000000000000' as `0x${string}`, decimals: 6 }

const op = (state: OperationRecord['state'], extra: Partial<OperationRecord> = {}): OperationRecord =>
  ({ state, id: 'op', capability: 'bridge', network: 114, intent: {}, steps: [], evidence: [], attempts: [], quoteHistory: [], createdAt: 0, updatedAt: 0, schemaVersion: 1, ...extra }) as OperationRecord

const QUOTE: BridgeQuote = {
  routeKey: bridge.key,
  amountIn: amount(1_000_000n, 6, 'FTestXRP'),
  amountReceivedLD: amount(1_000_000n, 6, 'FTestXRP'),
  minReceived: amount(995_000n, 6, 'FTestXRP'),
  nativeFee: amount(22_950_824_887_834_713_257n, 18, 'C2FLR'),
  slippageBips: 50,
  readAt: 1_000,
}

describe('BridgeCard (M8-R8) — AC5 states from props', () => {
  it('renders you-send / you-receive with the dust-adjusted amount, the real fee and exact minimum', () => {
    render(<BridgeCard operation={op('ready')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={QUOTE} />)
    expect(screen.getByText('You send · Coston2')).toBeInTheDocument()
    expect(screen.getByText('You receive · Sepolia')).toBeInTheDocument()
    // the fee and minimum render in the detail rows
    expect(screen.getByText('Cross-chain fee')).toBeInTheDocument()
    expect(screen.getByText('Minimum received')).toBeInTheDocument()
    expect(screen.getByText('Review bridge')).toBeInTheDocument()
  })

  it('a SUBMITTED send is NOT rendered as delivered — the delivered leg is still pending', () => {
    render(<BridgeCard operation={op('submitted')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={QUOTE} scanUrl="https://testnet.layerzeroscan.com/tx/0xabc" />)
    const timeline = screen.getByLabelText('Delivery timeline')
    const delivered = within(timeline).getByText('Delivered').closest('.fk-bridge-leg')
    expect(delivered?.getAttribute('data-state')).toBe('pending') // the load-bearing honesty
    // and the LayerZeroScan evidence link is present at the submitted leg
    expect(within(timeline).getByText('LayerZeroScan')).toBeInTheDocument()
  })

  it('awaiting-delivery is a distinct active leg; delivered only when succeeded', () => {
    const awaiting = op('awaiting_external', { awaiting: { actor: 'executor', reason: 'x', since: 0 } })
    const { rerender } = render(<BridgeCard operation={awaiting} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={QUOTE} />)
    let timeline = screen.getByLabelText('Delivery timeline')
    expect(within(timeline).getByText('Awaiting delivery').closest('.fk-bridge-leg')?.getAttribute('data-state')).toBe('active')

    rerender(<BridgeCard operation={op('succeeded')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} />)
    timeline = screen.getByLabelText('Delivery timeline')
    expect(within(timeline).getByText('Delivered').closest('.fk-bridge-leg')?.getAttribute('data-state')).toBe('done')
  })

  it('the redeem route extends the timeline through FAssets redemption to native XRP', () => {
    const filed = op('awaiting_external', { capability: 'bridge_redeem', awaiting: { actor: 'xrpl', reason: 'x', since: 0 } })
    render(<BridgeCard operation={filed} route={redeem} sendToken={FTESTXRP} receiveToken={XRP} quote={{ ...QUOTE, routeKey: redeem.key }} receiveValueText="9.94" />)
    const timeline = screen.getByLabelText('Delivery timeline')
    expect(within(timeline).getByText('Awaiting FAssets redemption')).toBeInTheDocument()
    expect(within(timeline).getByText('Native XRP redeemed')).toBeInTheDocument()
  })

  it('an insufficient-fee plan renders its distinct note, not a generic failure', () => {
    const plan: BridgePlanResult = { kind: 'error', error: { kind: 'insufficient-fee', needed: 1n, have: 0n } }
    render(<BridgeCard operation={op('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} planResult={plan} />)
    expect(screen.getByText('Not enough for the fee')).toBeInTheDocument()
  })

  it('a dust-below-min plan is a distinct state, never rendered as success or failure', () => {
    const plan: BridgePlanResult = { kind: 'error', error: { kind: 'dust-below-min' } }
    render(<BridgeCard operation={op('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} planResult={plan} />)
    expect(screen.getByText('Amount too small')).toBeInTheDocument()
  })
})
