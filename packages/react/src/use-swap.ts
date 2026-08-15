import {
  type SerializedError,
  type SwapIntent,
  type SwapOperation,
  type SwapPlan,
  type SwapQuote,
  type SwapQuoteResult,
  applyTransition,
  buildSwapPlan,
  createOperation,
  evidence,
  isTerminal,
  parseAmount,
  quoteSwap,
  toSerializedError,
} from '@flarekit-dev/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * `useSwap` — the quote/plan/submit loop for a Uniswap-V2-interface swap.
 *
 * The kit shipped `SwapCard` and the whole core lifecycle with nothing in
 * between, so a consumer had to re-implement this loop themselves — the loop the
 * kit exists to own. This is that missing middle.
 *
 * Reads and `plan` are KEYLESS: `quoteSwap` and `buildSwapPlan` need no wallet.
 * `submit` is the one exception and requires the caller's own injected
 * `walletClient`; without one it is a clearly-disabled no-op (`canWrite: false`)
 * and never fabricates a submission.
 *
 * `succeeded` is NEVER entered from the submit. A broadcast swap is `submitted`
 * and stays there until something reads the chain back — this hook advances no
 * further on its own, because a transaction hash is not an outcome.
 */

/** The read surface a quote needs, named transitively so this package stays viem-free. */
export type SwapEvmClient = Parameters<typeof quoteSwap>[0]['reader']

/** The dex registry, named through core's own signature rather than by importing contracts. */
export type SwapDex = Parameters<typeof buildSwapPlan>[3]

/**
 * The one write capability `submit` needs. Structural, not a `viem` import, so a
 * real `WalletClient` satisfies it directly.
 */
export interface SwapWalletClient {
  writeContract(call: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
    account: `0x${string}`
  }): Promise<`0x${string}`>
}

export interface UseSwapInput {
  readonly chainId: number
  /** From `dexFor(chainId)`. The host owns the registry, exactly as `useGovernance` takes its deployment. */
  readonly dex: SwapDex
  readonly publicClient: SwapEvmClient
  /** The account the swap is for. Absent = quote only; there is nobody to approve or receive. */
  readonly account?: `0x${string}`
  readonly fromKey: string
  readonly toKey: string
  readonly slippageBips?: number
  /** The caller's own wallet. Absent = read/plan only; the hook never signs. */
  readonly walletClient?: SwapWalletClient
  /** A previously-persisted operation to resume. There is no Resume button. */
  readonly operation?: SwapOperation
  /** How long a quote is good for, in seconds, before the router refuses it. */
  readonly deadlineSeconds?: number
}

export interface UseSwapResult {
  readonly operation: SwapOperation | undefined
  /** quote | no_route | unavailable. `no_route` is never rendered as a price. */
  readonly quoteResult: SwapQuoteResult | undefined
  readonly isSettled: boolean
  /** True only once a wallet is injected AND a quote has landed. */
  readonly canWrite: boolean
  /**
   * A refused/failed write, or a failed quote tick — held in SEPARATE slots so a
   * later successful quote cannot silently wipe a standing write refusal. That
   * bug was found in `useGovernance`, where one shared slot cleared a refusal
   * within a single poll interval with nothing having changed to justify it.
   */
  readonly error: SerializedError | undefined
  /** Quote a decimal amount of the `from` token. Keyless. */
  quote(amountIn: string): void
  /** Pure and synchronous; `undefined` until a quote has landed. Never plans off a guess. */
  plan(): SwapPlan | undefined
  submit(): void
}

/** Walk a plan to a SUBMITTED swap through the legal state path. */
function toSubmittedSwapOp(
  chainId: number,
  intent: SwapIntent,
  quote: SwapQuote,
  plan: SwapPlan,
  hash: `0x${string}`,
  now: number,
): SwapOperation {
  const base = createOperation<SwapIntent, SwapQuote, SwapPlan>({
    capability: 'swap',
    network: chainId,
    intent,
    now,
  })
  const quoting = applyTransition(base, {
    to: 'quoting',
    at: now,
    patch: { quote, plan },
  }).record
  const ready = applyTransition(quoting, { to: 'ready', at: now }).record
  const executing = applyTransition(ready, { to: 'executing', at: now }).record
  return applyTransition(executing, {
    to: 'submitted',
    at: now,
    evidence: [evidence({ kind: 'flare_tx', label: 'Flare tx', value: hash, observedAt: now })],
  }).record
}

export function useSwap(input: UseSwapInput): UseSwapResult {
  const {
    chainId,
    dex,
    publicClient,
    account,
    fromKey,
    toKey,
    slippageBips = 50,
    walletClient,
    operation: incoming,
    deadlineSeconds = 1_200,
  } = input

  const [operation, setOperation] = useState<SwapOperation | undefined>(incoming)
  const [quoteResult, setQuoteResult] = useState<SwapQuoteResult | undefined>(undefined)
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [amountIn, setAmountIn] = useState<bigint>(0n)
  // Two slots, not one: a quote must never clear a write refusal.
  const [readError, setReadError] = useState<SerializedError | undefined>(undefined)
  const [writeError, setWriteError] = useState<SerializedError | undefined>(undefined)

  const opRef = useRef<SwapOperation | undefined>(operation)
  useEffect(() => {
    if (incoming?.id !== opRef.current?.id) {
      setOperation(incoming)
      opRef.current = incoming
    }
  }, [incoming])

  const quote = useCallback(
    (text: string) => {
      const from = dex.tokens[fromKey]
      if (!from) return
      const parsed = parseAmount(text, from.decimals, from.symbol)
      setAmountIn(parsed.value)
      void (async () => {
        try {
          const result = await quoteSwap({
            reader: publicClient,
            chainId,
            fromKey,
            toKey,
            amountIn: parsed.value,
            slippageBips,
            now: Date.now(),
          })
          setQuoteResult(result)
          // The allowance is a separate read: a plan cannot know whether it needs
          // an approve step without it, and guessing would emit a plan that
          // reverts after a real approval.
          if (account) {
            const current = await publicClient.readContract({
              address: from.address,
              abi: ERC20_ALLOWANCE_ABI,
              functionName: 'allowance',
              args: [account, dex.router],
            })
            setAllowance(typeof current === 'bigint' ? current : 0n)
          }
          setReadError(undefined)
        } catch (cause) {
          setReadError(toSerializedError(cause))
        }
      })()
    },
    [dex, fromKey, toKey, publicClient, chainId, slippageBips, account],
  )

  const intentFor = useCallback(
    (): SwapIntent | undefined =>
      account
        ? {
            fromKey,
            toKey,
            amountIn,
            slippageBips,
            recipient: account,
            deadline: Math.floor(Date.now() / 1000) + deadlineSeconds,
          }
        : undefined,
    [account, fromKey, toKey, amountIn, slippageBips, deadlineSeconds],
  )

  const plan = useCallback((): SwapPlan | undefined => {
    if (quoteResult?.kind !== 'quote') return undefined
    const intent = intentFor()
    if (!intent) return undefined
    return buildSwapPlan(intent, quoteResult.quote, allowance, dex)
  }, [quoteResult, intentFor, allowance, dex])

  const submit = useCallback(() => {
    void (async () => {
      if (!walletClient || !account || quoteResult?.kind !== 'quote') return
      const intent = intentFor()
      if (!intent) return
      const built = buildSwapPlan(intent, quoteResult.quote, allowance, dex)
      try {
        const { swap } = built
        const hash = await walletClient.writeContract({
          address: built.router,
          abi: UNIV2_SWAP_ABI,
          functionName: swap.functionName,
          args: [swap.amountIn, swap.amountOutMin, swap.path, swap.to, swap.deadline],
          account,
        })
        const op = toSubmittedSwapOp(chainId, intent, quoteResult.quote, built, hash, Date.now())
        opRef.current = op
        setOperation(op)
        setWriteError(undefined)
      } catch (cause) {
        setWriteError(toSerializedError(cause))
      }
    })()
  }, [walletClient, account, quoteResult, intentFor, allowance, dex, chainId])

  return {
    operation,
    quoteResult,
    isSettled: operation ? isTerminal(operation.state) : false,
    canWrite: Boolean(walletClient) && quoteResult?.kind === 'quote',
    // A standing write refusal outranks a read failure: it is the one the person
    // caused and must act on.
    error: writeError ?? readError,
    quote,
    plan,
    submit,
  }
}

/** The two ABI fragments this hook submits with. Kept local so react needs no contracts import. */
const ERC20_ALLOWANCE_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

const UNIV2_SWAP_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const
