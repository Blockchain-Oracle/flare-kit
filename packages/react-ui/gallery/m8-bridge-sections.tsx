import {
  type BridgeCall,
  type BridgePlanResult,
  type BridgeQuote,
  type DexToken,
  type OperationRecord,
  type OperationStep,
  MOCK_EPOCH,
  amount,
  observe,
  routeByKey,
} from '@flarekit-dev/core'
import { BridgeCard, RouteCatalogue, type RouteRow } from '@flarekit-dev/react-ui'

/**
 * Dev-only. Every AC5 state of the M8 cross-chain surfaces, in both themes (the one
 * gallery toggle re-themes them). States are records + quotes built from the OBSERVED
 * live fixtures — the surfaces are prop-driven, so each state is data, never a live
 * call. A fixed `now` (MOCK_EPOCH) keeps the screenshots deterministic. The
 * load-bearing honesty is visible here: a `submitted` send's Delivered leg is still
 * pending, and `succeeded` (delivered / redeemed) is a distinct, later state.
 */

const NOW = MOCK_EPOCH
const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!
const FTESTXRP: DexToken = { symbol: 'FTestXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 }
const XRP: DexToken = { symbol: 'XRP', address: '0x0000000000000000000000000000000000000000', decimals: 6 }
const CHAIN = observe({}, { class: 'chain', provider: 'Coston2 RPC', network: 'Coston2', chainId: 114 }, NOW)

const bridgeFee = amount(22_950_824_887_834_713_257n, 18, 'C2FLR')
const redeemFee = amount(101_716_112_596_575n, 18, 'ETH')

const BRIDGE_QUOTE: BridgeQuote = {
  routeKey: bridge.key,
  amountIn: amount(1_000_000n, 6, 'FTestXRP'),
  amountReceivedLD: amount(1_000_000n, 6, 'FTestXRP'),
  minReceived: amount(995_000n, 6, 'FTestXRP'),
  nativeFee: bridgeFee,
  slippageBips: 50,
  readAt: NOW,
}
const REDEEM_QUOTE: BridgeQuote = {
  routeKey: redeem.key,
  amountIn: amount(10_000_000n, 6, 'FTestXRP'),
  amountReceivedLD: amount(10_000_000n, 6, 'FTestXRP'),
  minReceived: amount(9_950_000n, 6, 'FTestXRP'),
  nativeFee: redeemFee,
  slippageBips: 50,
  readAt: NOW,
}

const SEND_CALL: BridgeCall = { abiKind: 'oft', address: bridge.from.oft, functionName: 'send', args: [], value: bridgeFee.value, label: 'Bridge FTestXRP' }
const APPROVE_CALL: BridgeCall = { abiKind: 'erc20', address: bridge.asset.address, functionName: 'approve', args: [], label: 'Approve FTestXRP' }
const READY_PLAN: BridgePlanResult = { kind: 'plan', plan: { kind: 'bridge', send: SEND_CALL, nativeFee: bridgeFee.value } }
const APPROVE_PLAN: BridgePlanResult = { kind: 'plan', plan: { kind: 'bridge', approve: APPROVE_CALL, send: SEND_CALL, nativeFee: bridgeFee.value } }
const INSUFF_BAL: BridgePlanResult = { kind: 'error', error: { kind: 'insufficient-balance' } }
const INSUFF_FEE: BridgePlanResult = { kind: 'error', error: { kind: 'insufficient-fee', needed: bridgeFee.value, have: 0n } }
const DUST: BridgePlanResult = { kind: 'error', error: { kind: 'dust-below-min' } }

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({ id, type, actor, state, attempts: 0 })
const mkOp = (state: OperationRecord['state'], over: Partial<OperationRecord> = {}): OperationRecord =>
  ({ state, id: 'op', capability: 'bridge', network: 114, intent: {}, steps: [], evidence: [], attempts: [], quoteHistory: [], createdAt: NOW, updatedAt: NOW, schemaVersion: 1, ...over }) as OperationRecord

const SEND_STEPS = [step('approve', 'approve', 'done'), step('send', 'bridge_send', 'active'), step('deliver', 'await_delivery', 'pending', 'executor')]
const APPROVE_STEPS = [step('approve', 'approve', 'active'), step('send', 'bridge_send', 'pending'), step('deliver', 'await_delivery', 'pending', 'executor')]
const SCAN = 'https://testnet.layerzeroscan.com/tx/0xdea75d2d0b31ffb3816b95efb2ae8cbba3a07114d834b471d391b61c58ed50c4'
const SRC = 'https://coston2-explorer.flare.network/tx/0xdea75d2d0b31ffb3816b95efb2ae8cbba3a07114d834b471d391b61c58ed50c4'
const awaiting = (actor: 'executor' | 'flare' | 'xrpl', reason: string) => ({ awaiting: { actor, reason, since: Math.floor(NOW / 1000) } })

const ROUTES: RouteRow[] = [
  { route: bridge, reads: { fee: bridgeFee }, provenance: CHAIN },
  { route: redeem, reads: { fee: redeemFee }, provenance: CHAIN },
]
const UNVERIFIED: RouteRow[] = [{ route: { ...bridge, key: 'coston2-hyperliquid', to: { ...bridge.to, key: 'hyperliquid' }, bridgeVerified: false }, reads: { fee: bridgeFee }, provenance: CHAIN }]
const UNAVAILABLE_ROUTES: RouteRow[] = [{ route: bridge, provenance: CHAIN }]

export const M8_BRIDGE_SECTIONS = [
  {
    id: 'm8-routes',
    title: 'M8 · RouteCatalogue (cross-chain routes)',
    cases: [
      { name: 'routes — both live-verified, live fee via SourceChip', node: <RouteCatalogue rows={ROUTES} now={Math.floor(NOW / 1000)} networkLabel="Coston2" /> },
      { name: 'declared-unbuilt — an unverified route: config shown, action reasoned-off, never a plan', node: <RouteCatalogue rows={UNVERIFIED} now={Math.floor(NOW / 1000)} networkLabel="Coston2" /> },
      { name: 'read-unavailable — fee could not be read; unavailable, never a confident 0', node: <RouteCatalogue rows={UNAVAILABLE_ROUTES} now={Math.floor(NOW / 1000)} networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm8-bridge',
    title: 'M8 · BridgeCard (Coston2 → Sepolia)',
    cases: [
      { name: 'quote — real fee, dust-adjusted receive, exact minimum', node: <BridgeCard operation={mkOp('ready')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} planResult={READY_PLAN} fromBalance={amount(23_294_499n, 6, 'FTestXRP')} networkLabel="Coston2" /> },
      { name: 'no-balance — honest empty, distinct from a failed read', node: <BridgeCard operation={mkOp('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} planResult={INSUFF_BAL} fromBalance={amount(0n, 6, 'FTestXRP')} networkLabel="Coston2" /> },
      { name: 'unavailable — read failed; never rendered as no-balance (M6 F1)', node: <BridgeCard operation={mkOp('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} unavailable="The Coston2 RPC did not answer. This is not a zero — retry when the network settles." networkLabel="Coston2" /> },
      { name: 'needs-approval — approve is its own step, stated before the send', node: <BridgeCard operation={mkOp('awaiting_approval')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} planResult={APPROVE_PLAN} networkLabel="Coston2" /> },
      { name: 'approving — the approve tx in flight on the spine', node: <BridgeCard operation={mkOp('executing', { steps: APPROVE_STEPS })} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} networkLabel="Coston2" /> },
      { name: 'sending — approval done, the send tx in flight', node: <BridgeCard operation={mkOp('executing', { steps: SEND_STEPS })} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} networkLabel="Coston2" /> },
      { name: 'submitted — a confirmed send is NOT delivered; LayerZeroScan link', node: <BridgeCard operation={mkOp('submitted', { steps: SEND_STEPS })} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} scanUrl={SCAN} sourceExplorerUrl={SRC} networkLabel="Coston2" /> },
      { name: 'awaiting-delivery — held in flight until the destination read', node: <BridgeCard operation={mkOp('awaiting_external', { steps: SEND_STEPS, ...awaiting('executor', 'Waiting for LayerZero to deliver on the destination chain.') })} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} scanUrl={SCAN} networkLabel="Coston2" /> },
      { name: 'delivered — succeeded ONLY from the destination read', node: <BridgeCard operation={mkOp('succeeded', { steps: SEND_STEPS.map((s) => ({ ...s, state: 'done' as const })) })} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} networkLabel="Coston2" /> },
      { name: 'insufficient-fee — the C2FLR fee gates the send, distinct note', node: <BridgeCard operation={mkOp('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} planResult={INSUFF_FEE} networkLabel="Coston2" /> },
      { name: 'dust-below-min — delivered would breach the floor; its own state', node: <BridgeCard operation={mkOp('awaiting_input')} route={bridge} sendToken={FTESTXRP} receiveToken={FTESTXRP} quote={BRIDGE_QUOTE} planResult={DUST} networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm8-redeem',
    title: 'M8 · BridgeCard redeem route (Sepolia FXRP → native XRP)',
    cases: [
      { name: 'quote — deliver as native XRP, fee in ETH', node: <BridgeCard operation={mkOp('ready', { capability: 'bridge_redeem' })} route={redeem} sendToken={FTESTXRP} receiveToken={XRP} quote={REDEEM_QUOTE} planResult={{ kind: 'plan', plan: { kind: 'redeem', send: { ...SEND_CALL, address: redeem.from.oft, value: redeemFee.value }, nativeFee: redeemFee.value } }} receiveValueText="10.00" networkLabel="Coston2" /> },
      { name: 'awaiting-lz-delivery — leg 1, to the composer on Coston2', node: <BridgeCard operation={mkOp('awaiting_external', { capability: 'bridge_redeem', steps: SEND_STEPS, ...awaiting('executor', 'Waiting for LayerZero to deliver to the composer.') })} route={redeem} sendToken={FTESTXRP} receiveToken={XRP} quote={REDEEM_QUOTE} receiveValueText="10.00" scanUrl={SCAN} networkLabel="Coston2" /> },
      { name: 'awaiting-fasset-redemption — leg 2/3, agent paying XRPL; NOT yet redeemed', node: <BridgeCard operation={mkOp('awaiting_external', { capability: 'bridge_redeem', steps: SEND_STEPS, ...awaiting('xrpl', 'Redemption filed — the FAssets agent is paying native XRP to your XRPL address.') })} route={redeem} sendToken={FTESTXRP} receiveToken={XRP} quote={REDEEM_QUOTE} receiveValueText="10.00" networkLabel="Coston2" /> },
      { name: 'xrp-redeemed — succeeded ONLY from the XRPL settlement read', node: <BridgeCard operation={mkOp('succeeded', { capability: 'bridge_redeem' })} route={redeem} sendToken={FTESTXRP} receiveToken={XRP} receiveValueText="9.94" networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm8-mint',
    title: 'M8 · cross-chain mint (declared-unbuilt)',
    cases: [
      {
        name: 'declared-unbuilt — XRPL pay → FDC automint → bridge out, present/reasoned, never faked',
        node: (
          <div className="fk fk-route" data-theme={undefined} style={{ maxWidth: 480, padding: 16 }}>
            <div className="fk-unbuilt" aria-disabled="true">
              <p className="fk-unbuilt-title">Cross-chain mint not built this milestone</p>
              <p className="fk-unbuilt-reason">
                The mint path (an XRPL payment → FDC automint → bridge out via the FxrpLzBridgeShim) is configured but not driven live in this build. It ships present and reasoned rather than faked; the shim address stays in the M8 spec record until the milestone that verifies the path admits it to the registry.
              </p>
            </div>
          </div>
        ),
      },
    ],
  },
]
