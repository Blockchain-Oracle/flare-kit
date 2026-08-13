import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The one async-read hook every FTSO surface is built from.
 *
 * All six FTSO hooks are the same shape: run a read, hold what came back, keep
 * showing it while the next read is in flight, and never let a failed read
 * become an empty result. Writing that six times would be six chances for one
 * copy to start rendering a failure as an absence — so it is written once.
 *
 * Two behaviours carried over from `usePortfolio`, for the same reasons:
 *
 * - **`loading` is the absence of a result, not a result full of zeroes.** A
 *   value of `undefined` and a value of "no feeds" are different claims and must
 *   not share a representation.
 * - **A refresh never clears what is on screen.** Replacing good values with a
 *   spinner every few seconds is how somebody watches a price flicker and stops
 *   trusting it. The previous value stays, carrying its own observation time,
 *   until a better one arrives.
 *
 * There is deliberately no interval here. The provider owns this package's one
 * polling knob; a second clock would mean two answers to "how often does this
 * refresh".
 */

export interface ObservedRead<T> {
  readonly data: T | undefined
  readonly loading: boolean
  /**
   * The read that failed. Never a fabricated result, and never allowed to
   * overwrite a value we already had — a provider being unreachable says nothing
   * about the value it last reported.
   */
  readonly error: string | undefined
  refresh(): void
}

export function useObservedRead<T>(
  read: () => Promise<T>,
  deps: readonly unknown[],
): ObservedRead<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  // Held in a ref so a caller that rebuilds the reader inline every render does
  // not restart the effect on every render and never complete a read.
  const readRef = useRef(read)
  readRef.current = read

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const next = await readRef.current()
        if (cancelled) return
        setData(next)
        setError(undefined)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // The dependency list is the caller's: each hook names what its read is a
    // function of, so a feed id change re-reads and a render does not. The
    // reader itself is held in a ref precisely so it need not be a dependency.
  }, [...deps, tick])

  return { data, loading, error, refresh }
}
