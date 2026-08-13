import { chainFor, registryFor, sourceFor } from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'
import { createFdcClient } from '../fdc/client.js'
import { type XrpPaymentProofRetriever, xrpPaymentFamily } from '../fdc/families/xrp-payment.js'
import { type XrplClient, createXrplClient } from '../xrpl-rpc.js'
import {
  type DirectMintIntent,
  type DirectMintProtocolState,
  type DirectMintQuote,
  quoteDirectMint,
} from './direct-mint-quote.js'
import {
  type DirectMintOperation,
  createDirectMintOperation,
  reconcileDirectMint,
} from './direct-mint.js'
import { type ChainStateReader, readDirectMintChainState } from './read-chain-state.js'
import { readDirectMintProtocolState } from './read-protocol-state.js'
import {
  type RedeemContext,
  type RedeemIntent,
  type RedeemProtocolState,
  type RedeemQuote,
  quoteRedeem as quoteRedeemPure,
} from './quote-redeem.js'
import {
  type RedeemOperation,
  createRedeemOperation,
  reconcileRedeem as reconcileRedeemPure,
} from './redeem.js'
import {
  type RawCallReader,
  readRedeemChainState,
  readRedeemProtocolState,
} from './read-redeem-state.js'
import { findEvidence } from '../evidence.js'

/**
 * The live kit.
 *
 * It satisfies the same `DirectMintKit` contract the mock does, so a component
 * tree runs against Coston2 or against the mock with no branch anywhere in the
 * UI. That equivalence is the whole point of the interface, and it is only
 * meaningful now that both sides exist.
 *
 * **This file must never import the simulated kit.** R-MOCK-004 forbids mock
 * mode being a fallback triggered by a failure. Every error path below either
 * throws or reports an honest unknown; none substitutes a simulation. A test
 * asserts this module contains no textual reference to it at all — which is
 * why the name is not written here either.
 */

export interface CreateFlareKitInput {
  /** A viem PublicClient, or anything with the same read/simulate/call shape. */
  client: ChainStateReader & RawCallReader
  chainId: number
  underlyingSymbol?: string
  /** Defaults to the network's XRPL endpoint from the registry. */
  xrpl?: XrplClient
  fdc?: XrpPaymentProofRetriever
  apiKey?: string
}

export interface FlareKit {
  readonly isMock: false
  readonly label: string
  readonly chainId: number
  readonly protocolState: DirectMintProtocolState
  readonly redeemState: RedeemProtocolState
  quote(intent: DirectMintIntent, now?: number): DirectMintQuote
  start(intent: DirectMintIntent): DirectMintOperation
  reconcile(record: DirectMintOperation): Promise<DirectMintOperation>
  /** Redemption: the same lifecycle, with an agent as the counterparty. */
  quoteRedeem(intent: RedeemIntent, now?: number, context?: RedeemContext): RedeemQuote
  startRedeem(intent: RedeemIntent): RedeemOperation
  reconcileRedeem(record: RedeemOperation): Promise<RedeemOperation>
  /** Re-read protocol settings. Fees and pauses change under a running app. */
  refresh(): Promise<void>
}

/**
 * Reads protocol state once, so quotes are snapshots rather than a fresh
 * network round trip per keystroke. `refresh()` takes a new snapshot.
 */
export async function createFlareKit(input: CreateFlareKitInput): Promise<FlareKit> {
  const chain = chainFor(input.chainId)
  const registry = registryFor(input.chainId)
  const underlyingSymbol = input.underlyingSymbol ?? 'XRP'

  const xrpl =
    input.xrpl ?? createXrplClient({ jsonRpcUrl: chain.underlying.jsonRpcUrl })
  // M3-R2: the mint path is now one instance of the shared FDC lifecycle rather
  // than the owner of a private one. The source comes from the family table for
  // this network, so `testXRP` and `XRP` are configuration, not a branch.
  const xrplSource = sourceFor(xrpPaymentFamily.row, chain.key, registry.services.xrplSourceId)
  if (!xrplSource) {
    throw new FlareKitError('FDC_SOURCE_UNKNOWN', {
      domain: 'config',
      message: `The family table lists no XRPPayment source "${registry.services.xrplSourceId}" on ${chain.name}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  const fdc =
    input.fdc ??
    createFdcClient({
      services: registry.services,
      family: xrpPaymentFamily,
      source: xrplSource,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    })

  const loadState = () =>
    readDirectMintProtocolState({
      client: input.client,
      chainId: input.chainId,
      underlyingSymbol,
    })

  const loadRedeemState = () =>
    readRedeemProtocolState({ client: input.client, chainId: input.chainId, underlyingSymbol })

  let protocolState: DirectMintProtocolState
  let redeemState: RedeemProtocolState
  try {
    ;[protocolState, redeemState] = await Promise.all([loadState(), loadRedeemState()])
  } catch (cause) {
    // Fail loudly. A kit that cannot read the chain is not a kit that quietly
    // becomes a simulation — the caller decides what to do with an outage.
    throw new FlareKitError('KIT_UNAVAILABLE', {
      domain: 'network',
      message: `Could not read protocol state for chain ${input.chainId}. The kit will not start in a degraded state; retry or use an explicitly labelled mock kit.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      cause,
    })
  }

  const kit: FlareKit = {
    isMock: false,
    label: chain.name,
    chainId: input.chainId,
    get protocolState() {
      return protocolState
    },
    get redeemState() {
      return redeemState
    },

    quote(intent, now = Date.now()) {
      return quoteDirectMint(protocolState, intent, now)
    },

    start(intent) {
      return createDirectMintOperation({
        quote: quoteDirectMint(protocolState, intent, Date.now()),
        intent,
        network: input.chainId,
        now: Date.now(),
      })
    },

    async reconcile(record) {
      // The same call the mock serves, reading the chain instead of a clock.
      const chainState = await readDirectMintChainState({
        client: input.client,
        xrpl,
        fdc,
        chainId: input.chainId,
        operation: record,
        now: Date.now(),
        underlyingSymbol,
      })
      return reconcileDirectMint(record, chainState, Date.now())
    },

    quoteRedeem(intent, now = Date.now(), context = {}) {
      return quoteRedeemPure(redeemState, intent, now, context)
    },

    startRedeem(intent) {
      return createRedeemOperation({
        quote: quoteRedeemPure(redeemState, intent, Date.now()),
        intent,
        network: input.chainId,
        now: Date.now(),
      })
    },

    async reconcileRedeem(record) {
      const requestId = findEvidence(record.evidence, 'reservation_id')?.value
      // No request id means the redemption was never submitted, so there is
      // nothing on chain to reconcile against.
      if (!requestId) return record
      const chainState = await readRedeemChainState({
        client: input.client,
        chainId: input.chainId,
        requestId,
        underlyingSymbol,
      })
      return reconcileRedeemPure(record, chainState, Date.now())
    },

    async refresh() {
      ;[protocolState, redeemState] = await Promise.all([loadState(), loadRedeemState()])
    },
  }

  return kit
}
