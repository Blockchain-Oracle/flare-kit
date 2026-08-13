import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { recoverPaymentSigner } from '@flare-kit/core'
import { ERC20_ABI, FORWARDER_ABI } from '@flare-kit/contracts'

/**
 * The fee-free relayer's validate-and-submit core (M9-R5), split from the express
 * wiring in `index.ts` to stay under 300 lines. It imports `recoverPaymentSigner` from
 * `@flare-kit/core` — the SAME EIP-712 vocabulary the client signs with (M9-R2/R8), so
 * the crypto cannot drift. It re-declares no domain, no types.
 *
 * It absorbs its own gas and adds no fee or quota. The operator key lives only in the
 * `WalletClient` the caller injects; it is never read, logged, or returned here.
 */

export interface ExecuteRequest {
  readonly from: Address
  readonly to: Address
  readonly amount: bigint
  readonly deadline: bigint
  readonly signature: Hex
}

export type RejectCode =
  | 'bad-signature'
  | 'short-balance'
  | 'short-allowance'
  | 'expired'
  | 'simulate-failed'
  | 'submit-failed'

export type ExecuteResult =
  | { readonly ok: true; readonly txHash: Hex; readonly blockNumber?: string }
  | { readonly ok: false; readonly code: RejectCode; readonly error: string }

export interface RelayerContext {
  readonly publicClient: PublicClient
  /** Carries the operator's LOCAL account — msg.sender for executePayment (must be
   *  an authorized relayer). Its local account is used to sign, so the tx goes out via
   *  eth_sendRawTransaction, never a node-side eth_sendTransaction. */
  readonly walletClient: WalletClient
  readonly forwarder: Address
  readonly fxrp: Address
  readonly chainId: number
}

function shortErr(e: unknown): string {
  if (e instanceof Error) {
    const withShort = e as { shortMessage?: string }
    return (typeof withShort.shortMessage === 'string' ? withShort.shortMessage : e.message).slice(0, 160)
  }
  return String(e).slice(0, 160)
}

/**
 * Validate a signed PaymentRequest and submit it, paying the gas. Mirrors the
 * forwarder's own checks so a doomed request is rejected off-chain instead of wasting a
 * revert: recover the signer against the CURRENT on-chain nonce (a stale nonce recovers
 * a different address → rejected), then balance/allowance/deadline, then a `staticCall`
 * simulate before sending.
 */
export async function executePayment(ctx: RelayerContext, req: ExecuteRequest): Promise<ExecuteResult> {
  // 1) Recover the signer against the current on-chain nonce — the forwarder reads the
  // same nonce internally, so a stale-nonce or tampered request recovers a wrong signer.
  const nonce = (await ctx.publicClient.readContract({
    address: ctx.forwarder,
    abi: FORWARDER_ABI,
    functionName: 'getNonce',
    args: [req.from],
  })) as bigint
  const signer = await recoverPaymentSigner(
    ctx.chainId,
    ctx.forwarder,
    { from: req.from, to: req.to, amount: req.amount, nonce, deadline: req.deadline },
    req.signature,
  )
  if (signer.toLowerCase() !== req.from.toLowerCase()) {
    return { ok: false, code: 'bad-signature', error: 'recovered signer != from (bad signature, stale nonce, or altered request)' }
  }

  // 2) Deadline from CHAIN time, not the wall clock.
  const block = await ctx.publicClient.getBlock()
  if (block.timestamp > req.deadline) return { ok: false, code: 'expired', error: 'request deadline has passed' }

  // 3) Balance + allowance (the forwarder pulls `amount` from `from` via transferFrom).
  const [balance, allowance] = (await Promise.all([
    ctx.publicClient.readContract({ address: ctx.fxrp, abi: ERC20_ABI, functionName: 'balanceOf', args: [req.from] }),
    ctx.publicClient.readContract({ address: ctx.fxrp, abi: ERC20_ABI, functionName: 'allowance', args: [req.from, ctx.forwarder] }),
  ])) as [bigint, bigint]
  if (balance < req.amount) return { ok: false, code: 'short-balance', error: 'payer FXRP balance is below the amount' }
  if (allowance < req.amount) return { ok: false, code: 'short-allowance', error: 'payer allowance to the forwarder is below the amount' }

  // 4) Simulate (staticCall) BEFORE sending — catches a revert without spending gas.
  // The account is the wallet's LOCAL account (an Account object), so `sim.request`
  // carries a local signer and step 5 goes out via eth_sendRawTransaction. Passing a
  // bare address here would make viem treat it as a node-signed account and the RPC
  // would reject the send with "missing/invalid parameters".
  let request
  try {
    const sim = await ctx.publicClient.simulateContract({
      address: ctx.forwarder,
      abi: FORWARDER_ABI,
      functionName: 'executePayment',
      args: [req.from, req.to, req.amount, req.deadline, req.signature],
      account: ctx.walletClient.account,
    })
    request = sim.request
  } catch (e) {
    return { ok: false, code: 'simulate-failed', error: shortErr(e) }
  }

  // 5) Submit (the relayer pays the gas). Capture the txHash BEFORE waiting so a
  // broadcast-then-receipt-timeout reports the tx (which may still land), never a false
  // "nothing moved"; and gate success on the receipt STATUS — waitForTransactionReceipt
  // RESOLVES for a mined-but-reverted tx (a balance/allowance/nonce race after the
  // pre-send simulate), so an unchecked receipt would report a reverted relay as ok.
  let txHash: Hex
  try {
    txHash = await ctx.walletClient.writeContract(request)
  } catch (e) {
    return { ok: false, code: 'submit-failed', error: shortErr(e) }
  }
  try {
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') return { ok: false, code: 'submit-failed', error: 'executePayment reverted on-chain' }
    return { ok: true, txHash, blockNumber: receipt.blockNumber.toString() }
  } catch {
    // Broadcast succeeded but the receipt is not yet available (RPC/timeout). The tx may
    // still land; the kit's nonce-based paymentSince poll confirms it. Report accepted
    // WITH the txHash — never a false "nothing moved."
    return { ok: true, txHash }
  }
}
