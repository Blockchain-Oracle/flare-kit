import { chainFor, fassetFor } from '@flare-kit/contracts'
import { erc20Abi } from 'viem'
import { type Amount, amount } from '../amounts.js'
import { type AccountContext, identityFor } from '../account.js'
import { type Observation, type ObservationSource, observe, unavailable } from '../observation.js'
import type { OperationRecord } from '../operation.js'
import {
  type PendingOperation,
  type Portfolio,
  type PortfolioPosition,
  assemblePortfolio,
  position,
} from '../portfolio.js'
import { XRP_DECIMALS } from '../xrpl.js'
import type { XrplClient } from '../xrpl-rpc.js'

/**
 * The live producer of a portfolio (M2-R4). Reads only what exists today —
 * native balances on both chains, the FAsset, and our own open operations —
 * and reports anything it could not read as unavailable with the endpoint's
 * own reason.
 *
 * Every read is independent. One chain being unreachable degrades that chain's
 * coverage and nothing else, because a portfolio that fails whole tells a
 * person nothing about the half that answered.
 */

/** viem's `PublicClient`, structurally — the two calls a balance needs. */
export interface PortfolioReader {
  getBalance(args: { address: `0x${string}` }): Promise<bigint>
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

export interface ReadPortfolioInput {
  readonly context: AccountContext
  readonly client: PortfolioReader
  readonly xrpl: XrplClient
  readonly chainId: number
  /** From the operation store. R-DATA-002 counts these as positions. */
  readonly openOperations: readonly OperationRecord[]
  readonly now: number
  readonly underlyingSymbol?: string
}

function reasonFrom(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message}` : fallback
}

/**
 * Runs one read and turns its outcome into an observation. A throw becomes
 * `unavailable` carrying the endpoint's own words — never a zero, and never a
 * generic "failed to load" that hides which endpoint was silent.
 */
async function observeBalance(
  read: () => Promise<Amount>,
  source: ObservationSource,
  at: number,
  fallbackReason: string,
): Promise<Observation<Amount>> {
  try {
    return observe(await read(), source, at)
  } catch (error) {
    return unavailable(source, at, reasonFrom(error, fallbackReason))
  }
}

export async function readPortfolio(input: ReadPortfolioInput): Promise<Portfolio> {
  const chain = chainFor(input.chainId)
  const fasset = fassetFor(input.chainId, input.underlyingSymbol ?? 'XRP')

  const flareSource: ObservationSource = {
    class: 'chain',
    provider: chain.rpcUrl,
    network: chain.name,
    chainId: chain.id,
  }
  const xrplSource: ObservationSource = {
    class: 'chain',
    provider: chain.underlying.jsonRpcUrl,
    network: chain.underlying.name,
  }

  const evm = identityFor(input.context, 'evm')
  const xrpl = identityFor(input.context, 'xrpl')

  // A wallet on a different chain from the one being read would produce
  // mainnet FLR labelled `C2FLR`, attributed to a Coston2 endpoint nobody
  // contacted. That is a fabricated balance, so the read is not attempted:
  // the family reports no coverage and SH-03 repairs the network.
  const evmOnThisChain =
    evm.network?.chainId === undefined || evm.network.chainId === input.chainId
  const network = { name: chain.name, chainId: chain.id }
  const underlyingNetwork = { name: chain.underlying.name }

  const reads: Promise<PortfolioPosition>[] = []

  if (evm.address && evmOnThisChain) {
    const address = evm.address as `0x${string}`
    reads.push(
      observeBalance(
        async () =>
          amount(
            await input.client.getBalance({ address }),
            chain.nativeCurrency.decimals,
            chain.nativeCurrency.symbol,
          ),
        flareSource,
        input.now,
        `${chain.name} did not return a native balance`,
      ).then((balance) =>
        position({
          id: 'evm:native',
          kind: 'native',
          family: 'evm',
          account: address,
          network,
          asset: chain.nativeCurrency.symbol,
          balance,
        }),
      ),
    )

    reads.push(
      observeBalance(
        async () =>
          amount(
            (await input.client.readContract({
              address: fasset.token as `0x${string}`,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
            })) as bigint,
            chain.underlying.decimals,
            fasset.symbol,
          ),
        flareSource,
        input.now,
        `${chain.name} did not return a ${fasset.symbol} balance`,
      ).then((balance) =>
        position({
          id: 'evm:fasset',
          kind: 'fasset',
          family: 'evm',
          account: address,
          network,
          asset: fasset.symbol,
          balance,
        }),
      ),
    )
  }

  if (xrpl.address) {
    const account = xrpl.address
    reads.push(
      observeBalance(
        async () =>
          amount(
            (await input.xrpl.getAccountInfo(account)).balanceDrops,
            XRP_DECIMALS,
            chain.underlying.symbol,
          ),
        xrplSource,
        input.now,
        `${chain.underlying.name} did not return an account balance`,
      ).then((balance) =>
        position({
          id: 'xrpl:native',
          kind: 'native',
          family: 'xrpl',
          account,
          network: underlyingNetwork,
          asset: chain.underlying.symbol,
          balance,
        }),
      ),
    )
  }

  return assemblePortfolio({
    context: input.context,
    positions: await Promise.all(reads),
    pending: input.openOperations.map((record) => toPending(record, chain.name)),
    at: input.now,
  })
}

function toPending(record: OperationRecord, network: string): PendingOperation {
  return {
    operationId: record.id,
    capability: record.capability,
    state: record.state,
    network: record.network,
    updatedAt: record.updatedAt,
    source: { class: 'local', provider: 'Operation registry', network, chainId: record.network },
  }
}
