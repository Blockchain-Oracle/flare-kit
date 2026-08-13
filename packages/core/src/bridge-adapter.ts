// packages/core/src/bridge-adapter.ts
import { type Abi, type Address, type Hex, type PublicClient, pad } from 'viem'
import {
  type BridgeRoute,
  COMPOSER_ABI,
  ERC20_ABI,
  OFT_ADAPTER_ABI,
  OFT_DEST_ABI,
} from '@flare-kit/contracts'
import { encodeExecutorOptions } from './bridge-options.js'

/**
 * The `CrossChainAdapter` — M8's "one lifecycle, two chains" seam. Every prior
 * adapter took a single client because the signature and its outcome lived on the
 * same chain. Cross-chain is the first capability whose outcome lives on a
 * *different* chain than the signature, so this adapter reads a **source** client
 * (quote, allowance, balance, the OFT `send`) and a **destination** client
 * (delivery truth: the OFT `OFTReceived`, and for a redeem the composer's
 * `FAssetRedeemed`). For the redeem route the caller passes Sepolia as `src` and
 * Coston2 as `dst` — same code path, only the wiring flips.
 *
 * Reads are pure chain reads (no key). Writes build structured, unsigned
 * `BridgeCall`s the signing edge (`live-bridge.mjs` / the host's `onSubmit`)
 * encodes via `bridgeAbiFor(call.abiKind)` — the `send` carries `value` (the
 * `nativeFee`). Every raw OFT/Composer ABI and every option byte lives here and
 * nowhere downstream (M8-R11).
 */

export interface SendParam {
  readonly dstEid: number
  readonly to: Hex
  readonly amountLD: bigint
  readonly minAmountLD: bigint
  readonly extraOptions: Hex
  readonly composeMsg: Hex
  readonly oftCmd: Hex
}

export interface MessagingFee {
  readonly nativeFee: bigint
  readonly lzTokenFee: bigint
}

/** A structured, unsigned call; the edge encodes it via `bridgeAbiFor(call.abiKind)`. */
export interface BridgeCall {
  readonly abiKind: 'oft' | 'erc20'
  readonly address: Address
  readonly functionName: string
  readonly args: readonly unknown[]
  /** Present on the payable `send` (= nativeFee); absent otherwise. */
  readonly value?: bigint
  readonly label: string
}

/** Delivery is a destination-chain read; absence is `in-flight`, NEVER failure. */
export type DeliveryState =
  | { readonly kind: 'in-flight' }
  | { readonly kind: 'delivered'; readonly amountReceivedLD: bigint | null }

/**
 * The redeem FAssets leg, read from the composer. `filed` = FAssetRedeemed observed
 * (the redemption REQUEST is filed on chain) — NOT "XRP received": the FAssets agent
 * still pays XRPL separately, so settlement is a distinct signal (`SettlementState`).
 * `failed` only from a real FAssetRedeemFailed log; an unknown outcome is neither.
 */
export type RedemptionState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'filed'; readonly redeemedAmountUBA: bigint | null; readonly underlyingAddress: string | null }
  | { readonly kind: 'failed' }

/**
 * The XRPL settlement leg — the FAssets agent's payment to the redeemer's XRPL
 * address. `settled` (XRP received) is the ONLY thing that carries a redeem to
 * `succeeded` (AC3: "XRP received is asserted only from settlement evidence"). Read
 * off the XRP Ledger by the caller (the adapter is EVM-only); absence is `pending`,
 * never a failure.
 */
export type SettlementState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'settled'; readonly amountDrops: bigint | null; readonly txHash: string | null }

export interface BridgeReads {
  /** The destination peer wired for `eid`, or the zero bytes32 when unset (no-peer gate). */
  peer(eid: number): Promise<Hex>
  assetBalance(owner: Address): Promise<bigint>
  /** The owner's SOURCE native balance (C2FLR / ETH) — the insufficient-fee gate. */
  nativeBalance(owner: Address): Promise<bigint>
  assetAllowance(owner: Address, spender: Address): Promise<bigint>
  quoteFee(sp: SendParam): Promise<MessagingFee>
  /** `quoteOFT`'s dust-adjusted delivered amount. (The OFT's own min/max limits are read
   * but not gated: FXRP has no per-tx cap — a capped route would add a limit gate here.) */
  quoteReceive(sp: SendParam): Promise<{ amountReceivedLD: bigint }>
  /** DEST read: OFTReceived for `guid` at/after `since`. Absent → in-flight, never failed. */
  delivery(guid: Hex, since: bigint): Promise<DeliveryState>
  /** DEST read: the composer's FAssetRedeemed / FAssetRedeemFailed for `guid` (redeem only). */
  redemption(guid: Hex, since: bigint): Promise<RedemptionState>
}

export interface BridgeWrites {
  approveAsset(spender: Address, amount: bigint): BridgeCall
  send(sp: SendParam, fee: MessagingFee, refund: Address): BridgeCall
}

export interface BridgeAdapter {
  readonly route: BridgeRoute
  readonly reads: BridgeReads
  readonly writes: BridgeWrites
}

const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`

// Coston2's RPC caps eth_getLogs to a ~30-block range, so a delivery reconcile that
// looks back from the submit block over a multi-minute wait must CHUNK the scan or the
// read reverts. Sepolia tolerates a wide range, but chunking is correct on both.
const MAX_BLOCK_RANGE = 25n

/** Scan `[since, latest]` for an event by `guid`, in ≤MAX_BLOCK_RANGE chunks (RPC cap safe). */
async function scanByGuid(
  client: PublicClient,
  address: Address,
  abi: readonly unknown[],
  eventName: string,
  guid: Hex,
  since: bigint,
): Promise<readonly { readonly args: Record<string, unknown> }[]> {
  const latest = await client.getBlockNumber()
  let cursor = since
  while (cursor <= latest) {
    const end = cursor + MAX_BLOCK_RANGE - 1n > latest ? latest : cursor + MAX_BLOCK_RANGE - 1n
    const logs = await client.getContractEvents({
      address,
      abi: abi as never,
      eventName,
      args: { guid },
      fromBlock: cursor,
      toBlock: end,
    })
    if (logs.length > 0) return logs as never
    cursor = end + 1n
  }
  return []
}

/** Resolve the ABI that encodes a `BridgeCall` for `writeContract`. */
export function bridgeAbiFor(abiKind: 'oft' | 'erc20'): Abi {
  return (abiKind === 'oft' ? OFT_ADAPTER_ABI : ERC20_ABI) as unknown as Abi
}

/**
 * Build the IOFT `SendParam`. `to` is the recipient (a plain bridge) or the composer
 * (a redeem), left-padded to bytes32; the options carry the executor (and, for a
 * redeem, the compose) gas from the route. `composeMsg` is the encoded
 * RedeemComposeMessage for a redeem, else `0x`.
 */
export function buildSendParam(
  route: BridgeRoute,
  opts: { to: Address; amountLD: bigint; minAmountLD: bigint; composeMsg?: Hex },
): SendParam {
  return {
    dstEid: route.to.eid,
    to: pad(opts.to, { size: 32 }),
    amountLD: opts.amountLD,
    minAmountLD: opts.minAmountLD,
    extraOptions: encodeExecutorOptions(route),
    composeMsg: opts.composeMsg ?? '0x',
    oftCmd: '0x',
  }
}

export function makeBridgeAdapter(src: PublicClient, dst: PublicClient, route: BridgeRoute): BridgeAdapter {
  const oft = route.from.oft

  const reads: BridgeReads = {
    peer: (eid) =>
      src.readContract({ address: oft, abi: OFT_ADAPTER_ABI, functionName: 'peers', args: [eid] }) as Promise<Hex>,
    assetBalance: (owner) =>
      src.readContract({
        address: route.asset.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [owner],
      }) as Promise<bigint>,
    nativeBalance: (owner) => src.getBalance({ address: owner }),
    assetAllowance: (owner, spender) =>
      src.readContract({
        address: route.asset.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, spender],
      }) as Promise<bigint>,
    quoteFee: (sp) =>
      src.readContract({
        address: oft,
        abi: OFT_ADAPTER_ABI,
        functionName: 'quoteSend',
        args: [sp, false],
      }) as Promise<MessagingFee>,
    quoteReceive: async (sp) => {
      const [, , receipt] = (await src.readContract({
        address: oft,
        abi: OFT_ADAPTER_ABI,
        functionName: 'quoteOFT',
        args: [sp],
      })) as [unknown, unknown, { amountSentLD: bigint; amountReceivedLD: bigint }]
      return { amountReceivedLD: receipt.amountReceivedLD }
    },
    delivery: async (guid, since) => {
      const logs = await scanByGuid(dst, route.to.oft, OFT_DEST_ABI, 'OFTReceived', guid, since)
      // Absence is IN-FLIGHT, never failure: LZ delivery takes minutes and the
      // destination RPC can lag (cf. the never-conclude-from-single-absence rule).
      if (logs.length === 0) return { kind: 'in-flight' }
      const amount = (logs[0]!.args as { amountReceivedLD?: bigint }).amountReceivedLD
      return { kind: 'delivered', amountReceivedLD: typeof amount === 'bigint' ? amount : null }
    },
    redemption: async (guid, since) => {
      if (!route.composer) return { kind: 'pending' }
      const [ok, failed] = await Promise.all([
        scanByGuid(dst, route.composer, COMPOSER_ABI, 'FAssetRedeemed', guid, since),
        scanByGuid(dst, route.composer, COMPOSER_ABI, 'FAssetRedeemFailed', guid, since),
      ])
      if (ok.length > 0) {
        const a = ok[0]!.args as { redeemedAmountUBA?: bigint; redeemerUnderlyingAddress?: string }
        // FAssetRedeemed = redemption FILED on chain, NOT XRP received — the agent
        // still pays XRPL. The op stays awaiting-settlement until the XRPL read confirms.
        return {
          kind: 'filed',
          redeemedAmountUBA: typeof a.redeemedAmountUBA === 'bigint' ? a.redeemedAmountUBA : null,
          underlyingAddress: typeof a.redeemerUnderlyingAddress === 'string' ? a.redeemerUnderlyingAddress : null,
        }
      }
      // `failed` ONLY from a real FAssetRedeemFailed — an unknown outcome stays pending.
      if (failed.length > 0) return { kind: 'failed' }
      return { kind: 'pending' }
    },
  }

  const call = (
    abiKind: 'oft' | 'erc20',
    address: Address,
    functionName: string,
    args: readonly unknown[],
    label: string,
    value?: bigint,
  ): BridgeCall => ({ abiKind, address, functionName, args, label, ...(value !== undefined ? { value } : {}) })

  const writes: BridgeWrites = {
    approveAsset: (spender, amount) =>
      call('erc20', route.asset.address, 'approve', [spender, amount], `Approve ${route.asset.symbol}`),
    send: (sp, fee, refund) =>
      call('oft', oft, 'send', [sp, fee, refund], `Bridge ${route.asset.symbol}`, fee.nativeFee),
  }

  return { route, reads, writes }
}

export { ZERO_BYTES32 }
