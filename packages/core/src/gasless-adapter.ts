// packages/core/src/gasless-adapter.ts
import { type Address, type Hex, type PublicClient } from 'viem'
import { type GaslessDeployment, ERC20_ABI, FORWARDER_ABI } from '@flare-kit/contracts'

/**
 * The `GaslessAdapter` — the reads/writes/relay seam for the gasless FXRP operation
 * (M9-R2), mirroring `bridge-adapter.ts`. Reads are pure chain reads (no key): the
 * forwarder nonce, the FXRP balance/allowance, and the on-chain transfer that is the
 * ONLY source of `succeeded`. The one write is the one-time FXRP approval (a structured
 * call the signing edge encodes — the same idea as the swap/bridge approve). `relay`
 * POSTs the signed request to the reference relayer and NEVER throws into the caller:
 * an unreachable relayer is `{ accepted: false }`, which the hook renders as
 * `relayer-unreachable`, not an unhandled rejection.
 *
 * The EIP-712 types the relayer needs live in `gasless-eip712.ts` (imported by the
 * service), never here — this file is chain I/O only.
 */

/** The on-chain transfer truth. `confirmed` is read from `PaymentExecuted`; absence is
 *  `in-flight`, NEVER failure (the relayer may still be submitting). */
export type GaslessTransferState =
  | { readonly kind: 'in-flight' }
  | { readonly kind: 'confirmed'; readonly txHash: Hex; readonly amount: bigint }

/** The one-time FXRP approval — a structured, unsigned call the edge encodes as
 *  `approve(spender, amount)` on the token. Rendered as the loud gas-costing step. */
export interface GaslessApprove {
  readonly token: Address
  readonly spender: Address
  readonly amount: bigint
  readonly label: string
}

export interface GaslessReads {
  /** forwarder.fxrp() — proves the forwarder resolves FXRP from the registry. */
  fxrpToken(): Promise<Address>
  decimals(): Promise<number>
  /** forwarder.getNonce(owner) — the replay nonce for the next signature. */
  nonce(owner: Address): Promise<bigint>
  balance(owner: Address): Promise<bigint>
  /** FXRP.allowance(owner, forwarder) — 0 means the one-time approval is still needed. */
  allowance(owner: Address): Promise<bigint>
  /** PaymentExecuted(from, ·, ·, nonce) at/after sinceBlock; absent → in-flight. */
  paymentSince(from: Address, nonce: bigint, sinceBlock: bigint): Promise<GaslessTransferState>
}

export interface GaslessWrites {
  approveForwarder(amount: bigint): GaslessApprove
}

export interface RelayerEndpoint {
  readonly baseUrl: string
}

export interface RelayRequest {
  readonly from: Address
  readonly to: Address
  readonly amount: bigint
  readonly deadline: bigint
  readonly signature: Hex
}

/** The relayer's HTTP acceptance — NOT the transfer. `accepted` means the job was
 *  taken, never that the money moved (`succeeded` comes only from `paymentSince`). */
export interface RelayReceipt {
  readonly accepted: boolean
  readonly txHash?: Hex
  /** The block the relayer mined it in, when known — a tight `sinceBlock` for the poll. */
  readonly blockNumber?: string
  readonly error?: string
}

export interface GaslessAdapter {
  /** The deployment this adapter was built for — carries `gaslessVerified` (the plan gate). */
  readonly deployment: GaslessDeployment
  readonly reads: GaslessReads
  readonly writes: GaslessWrites
  readonly forwarder: Address
  readonly fxrp: Address
  readonly relayer: RelayerEndpoint
  relay(req: RelayRequest): Promise<RelayReceipt>
}

// Coston2's RPC caps eth_getLogs to ~30 blocks (the M8 rule), so a `paymentSince`
// scan over a multi-minute relay wait must chunk into ≤25-block ranges or it reverts.
const MAX_BLOCK_RANGE = 25n

export function makeGaslessAdapter(client: PublicClient, d: GaslessDeployment): GaslessAdapter {
  const forwarder = d.forwarder
  const fxrp = d.fxrp.address
  const relayer: RelayerEndpoint = { baseUrl: d.relayerUrl }

  const reads: GaslessReads = {
    fxrpToken: () =>
      client.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'fxrp' }) as Promise<Address>,
    decimals: () => client.readContract({ address: fxrp, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
    nonce: (owner) =>
      client.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: 'getNonce', args: [owner] }) as Promise<bigint>,
    balance: (owner) =>
      client.readContract({ address: fxrp, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>,
    allowance: (owner) =>
      client.readContract({ address: fxrp, abi: ERC20_ABI, functionName: 'allowance', args: [owner, forwarder] }) as Promise<bigint>,
    paymentSince: async (from, nonce, sinceBlock) => {
      const latest = await client.getBlockNumber()
      let cursor = sinceBlock
      while (cursor <= latest) {
        const end = cursor + MAX_BLOCK_RANGE - 1n > latest ? latest : cursor + MAX_BLOCK_RANGE - 1n
        const logs = (await client.getContractEvents({
          address: forwarder,
          abi: FORWARDER_ABI,
          eventName: 'PaymentExecuted',
          args: { from },
          fromBlock: cursor,
          toBlock: end,
        })) as readonly { args: Record<string, unknown>; transactionHash: Hex }[]
        for (const log of logs) {
          // `nonce` is not indexed, so match it in the decoded args (from is the filter).
          if ((log.args as { nonce?: bigint }).nonce === nonce) {
            const amount = (log.args as { amount?: bigint }).amount
            // Never fabricate a 0 for an unknown amount (the "unknown renders —, never 0"
            // law). A decoded PaymentExecuted always carries its non-indexed amount, so an
            // undecodable one is not a real confirm — keep scanning (stays in-flight).
            if (typeof amount === 'bigint') return { kind: 'confirmed', txHash: log.transactionHash, amount }
          }
        }
        cursor = end + 1n
      }
      // Absence is IN-FLIGHT, never failure — the relayer may still be submitting.
      return { kind: 'in-flight' }
    },
  }

  const writes: GaslessWrites = {
    approveForwarder: (amount) => ({
      token: fxrp,
      spender: forwarder,
      amount,
      label: `Approve ${d.fxrp.symbol} for the forwarder`,
    }),
  }

  const relay = async (req: RelayRequest): Promise<RelayReceipt> => {
    try {
      const res = await fetch(`${relayer.baseUrl}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // amount/deadline serialised as strings — JSON has no bigint. The relayer parses back.
        body: JSON.stringify({
          from: req.from,
          to: req.to,
          amount: req.amount.toString(),
          deadline: req.deadline.toString(),
          signature: req.signature,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { accepted: false, error: `relayer ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}` }
      }
      const data = (await res.json().catch(() => ({}))) as { txHash?: Hex; blockNumber?: string }
      return {
        accepted: true,
        ...(data.txHash ? { txHash: data.txHash } : {}),
        ...(data.blockNumber ? { blockNumber: data.blockNumber } : {}),
      }
    } catch (e) {
      // NEVER throws into the caller: the hook renders `relayer-unreachable`.
      return { accepted: false, error: e instanceof Error ? e.message : 'relayer unreachable' }
    }
  }

  return { deployment: d, reads, writes, forwarder, fxrp, relayer, relay }
}
