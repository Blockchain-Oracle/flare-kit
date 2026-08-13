import type { FamilyRow, Observation } from '@flarekit-dev/core'
import { isObserved, staleness } from '@flarekit-dev/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The attestation catalogue as React state (M3-R3).
 *
 * The hook returns the `Observation` itself rather than unwrapping it. That is
 * deliberate: `AttestationCatalogue` has to render "the verifier disagreed with
 * the built-in table" and "we could not reach the verifier" as different
 * screens, and an unwrapped `rows: FamilyRow[]` would make the second look like
 * the first with an empty array. The only route to the rows is through
 * `isObserved`.
 *
 * `loading` is the absence of an answer, never an answer of zero families.
 */

export type LoadCatalogue = (input: {
  now: number
}) => Promise<Observation<readonly FamilyRow[]>>

export interface UseAttestationFamiliesOptions {
  /** The loader. A host passes the live one; the mock passes a fixture. */
  load: LoadCatalogue
}

export interface UseAttestationFamiliesResult {
  /** Undefined until the first answer lands. Never an empty list standing in. */
  readonly catalogue: Observation<readonly FamilyRow[]> | undefined
  readonly rows: readonly FamilyRow[]
  readonly loading: boolean
  /** True when the catalogue is older than its source class's budget. */
  readonly stale: boolean
  /** Rows where the table and the deployment do not agree. Never hidden. */
  readonly disagreements: readonly FamilyRow[]
  /** Rows nothing could be checked against, which is not the same as absent. */
  readonly unchecked: readonly FamilyRow[]
  /** The load that threw, if the last attempt did. Never a fabricated table. */
  readonly error: string | undefined
  refresh(): void
}

export function useAttestationFamilies(
  options: UseAttestationFamiliesOptions,
): UseAttestationFamiliesResult {
  const [catalogue, setCatalogue] = useState<Observation<readonly FamilyRow[]> | undefined>(
    undefined,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  const loadRef = useRef(options.load)
  loadRef.current = options.load

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const next = await loadRef.current({ now: Date.now() })
        if (cancelled) return
        setCatalogue(next)
        setError(undefined)
      } catch (cause) {
        // A failed load never becomes an empty catalogue. The built-in table is
        // not substituted either: presenting it as though it had been checked
        // is precisely what M3-R3 forbids.
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [tick])

  const rows = catalogue && isObserved(catalogue) ? catalogue.value : []

  return {
    catalogue,
    rows,
    loading,
    // Evaluated per render: a catalogue that was current when it arrived goes
    // stale while it sits on screen, and a matrix nobody has re-checked must say
    // so rather than keep presenting itself as today's answer.
    stale: catalogue ? staleness(catalogue, Date.now()).stale : false,
    disagreements: rows.filter(
      (row) => row.agreement === 'table_claims_more' || row.agreement === 'verifier_serves_more',
    ),
    unchecked: rows.filter((row) => row.agreement === 'unreachable'),
    error,
    refresh,
  }
}
