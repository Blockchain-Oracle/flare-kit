import {
  type Portfolio,
  type PortfolioPosition,
  type SourceConflict,
  portfolioConflicts,
  portfolioIsStale,
} from '@flare-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccounts } from './use-accounts.js'

/**
 * The portfolio as React state (M2-R4).
 *
 * `loading` is the absence of a portfolio, not a portfolio with empty values —
 * which is why `portfolio` is `undefined` until a read lands rather than an
 * object full of zeroes. USER-01's `loading` and `no assets` are different
 * claims and must not share a representation.
 *
 * A refresh never clears what is already on screen. Replacing good values with
 * a spinner every few seconds is how a person watches their balance flicker
 * and stops trusting it; the previous portfolio stays, with its own observation
 * times, until better values arrive.
 */

export type ReadPortfolio = (input: {
  context: ReturnType<typeof useAccounts>['context']
  now: number
}) => Promise<Portfolio>

export interface UsePortfolioOptions {
  /** The reader. A host passes the live one; the mock passes its own. */
  read: ReadPortfolio
  /** Compared against the chain read to surface a source conflict (USER-03). */
  compareWith?: readonly PortfolioPosition[]
}

export interface UsePortfolioResult {
  readonly portfolio: Portfolio | undefined
  readonly loading: boolean
  readonly stale: boolean
  readonly conflicts: readonly SourceConflict[]
  /** The read that failed, if the last attempt threw. Never a fake portfolio. */
  readonly error: string | undefined
  refresh(): void
}

export function usePortfolio(options: UsePortfolioOptions): UsePortfolioResult {
  const { context } = useAccounts()
  const [portfolio, setPortfolio] = useState<Portfolio | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  const readRef = useRef(options.read)
  readRef.current = options.read

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const next = await readRef.current({ context, now: Date.now() })
        if (cancelled) return
        setPortfolio(next)
        setError(undefined)
      } catch (cause) {
        // A read that failed is a failed read. It never becomes an empty
        // portfolio, and it never overwrites values we already had.
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // One read per account change, plus whatever `refresh()` asks for. There is
    // deliberately no interval here: the provider already owns this package's
    // one polling knob (`pollMs`, which reconciles open operations), and a
    // second clock would mean two answers to "how often does this refresh".
    void run()
    return () => {
      cancelled = true
    }
  }, [context, tick])

  return {
    portfolio,
    loading,
    // Evaluated per render against the wall clock. A portfolio that was fresh
    // when it arrived goes stale while it sits on screen, and that has to show.
    stale: portfolio ? portfolioIsStale(portfolio, Date.now()) : false,
    conflicts:
      portfolio && options.compareWith ? portfolioConflicts(portfolio, options.compareWith) : [],
    error,
    refresh,
  }
}
