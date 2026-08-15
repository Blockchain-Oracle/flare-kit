import { dexFor } from '@flarekit-dev/contracts'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type UseSwapInput, useSwap } from '../src/use-swap.js'

/**
 * Fixtures are DERIVED, not invented.
 *
 * The chain id, the router, the token keys and their decimals all come from the
 * real Coston2 dex registry — the one the R1 probe read on chain. A fixture
 * written by hand here would make the hook pass against a venue that does not
 * exist, which is worse than having no test.
 */
const COSTON2 = 114
const DEX = dexFor(COSTON2)
const [FROM_KEY, TO_KEY] = DEX.canonicalPair
const FROM = DEX.tokens[FROM_KEY]!
const TO = DEX.tokens[TO_KEY]!
const ACCOUNT = '0x1111111111111111111111111111111111111111' as const

/** One unit of the `from` token, in its own raw units. */
const ONE_IN = 10n ** BigInt(FROM.decimals)
/** What the router is told to return for `getAmountsOut`. */
const OUT = 2n * 10n ** BigInt(TO.decimals)

/**
 * A reader that answers the three calls the swap path actually makes: the
 * factory's `getPair`, the pair's `getReserves`/`token0`, the router's
 * `getAmountsOut`, and the ERC-20 `allowance`.
 */
function reader({ allowance = 0n }: { allowance?: bigint } = {}) {
  return {
    readContract: async ({ functionName }: { functionName: string }): Promise<unknown> => {
      switch (functionName) {
        case 'getPair':
          return '0x2222222222222222222222222222222222222222'
        case 'token0':
          return FROM.address
        case 'token1':
          return TO.address
        case 'getReserves':
          return [ONE_IN * 1_000_000n, OUT * 1_000_000n, 0]
        case 'getAmountsOut':
          return [ONE_IN, OUT]
        case 'allowance':
          return allowance
        default:
          throw new Error(`unexpected read: ${functionName}`)
      }
    },
  }
}

const input = (over: Partial<UseSwapInput> = {}): UseSwapInput => ({
  chainId: COSTON2,
  dex: DEX,
  publicClient: reader(),
  account: ACCOUNT,
  fromKey: FROM_KEY,
  toKey: TO_KEY,
  ...over,
})

describe('useSwap', () => {
  it('plans nothing before a quote has landed, rather than planning off a guess', () => {
    const { result } = renderHook(() => useSwap(input()))
    expect(result.current.plan()).toBeUndefined()
  })

  it('cannot write without a wallet, even once a quote has landed', async () => {
    const { result } = renderHook(() => useSwap(input()))
    await act(async () => result.current.quote('1'))
    await waitFor(() => expect(result.current.quoteResult?.kind).toBe('quote'))
    expect(result.current.canWrite).toBe(false)
  })

  it('quotes from the router rather than computing a price itself', async () => {
    const { result } = renderHook(() => useSwap(input()))
    await act(async () => result.current.quote('1'))
    await waitFor(() => expect(result.current.quoteResult?.kind).toBe('quote'))
    const quoted = result.current.quoteResult
    expect(quoted?.kind === 'quote' && quoted.quote.amountOut.value).toBe(OUT)
  })

  it('plans an approve step when the allowance is short, and none when it is not', async () => {
    const short = renderHook(() => useSwap(input({ publicClient: reader({ allowance: 0n }) })))
    await act(async () => short.result.current.quote('1'))
    await waitFor(() => expect(short.result.current.plan()?.approve).toBeDefined())

    const ample = renderHook(() =>
      useSwap(input({ publicClient: reader({ allowance: ONE_IN * 10n }) })),
    )
    await act(async () => ample.result.current.quote('1'))
    await waitFor(() => expect(ample.result.current.quoteResult?.kind).toBe('quote'))
    expect(ample.result.current.plan()?.approve).toBeUndefined()
  })

  it('reports no route as no route, never as a price', async () => {
    const empty = {
      readContract: async ({ functionName }: { functionName: string }): Promise<unknown> =>
        functionName === 'getPair' ? '0x0000000000000000000000000000000000000000' : 0n,
    }
    const { result } = renderHook(() => useSwap(input({ publicClient: empty })))
    await act(async () => result.current.quote('1'))
    await waitFor(() => expect(result.current.quoteResult).toBeDefined())
    expect(result.current.quoteResult?.kind).not.toBe('quote')
  })

  it('never enters succeeded from a submit; a submitted swap stays submitted', async () => {
    const { result } = renderHook(() =>
      useSwap(
        input({
          walletClient: { writeContract: async () => '0xabc' as `0x${string}` },
        }),
      ),
    )
    await act(async () => result.current.quote('1'))
    await waitFor(() => expect(result.current.canWrite).toBe(true))
    await act(async () => result.current.submit())
    await waitFor(() => expect(result.current.operation).toBeDefined())
    expect(result.current.operation?.state).toBe('submitted')
    expect(result.current.isSettled).toBe(false)
  })
})
