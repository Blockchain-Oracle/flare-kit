import {
  type Observation,
  type RandomResult,
  type RoundReader,
  readSecureRandom,
} from '@flarekit-dev/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Secure randomness, current or historical — FTSO-04.
 *
 * `requireSecure` is the whole policy surface this milestone owns: one option on
 * one read. When it refuses, the result carries the reason and no value, so a
 * component cannot reach past the flag to the number.
 */

export interface UseSecureRandomOptions {
  reader: RoundReader
  chainId: number
  /** Omit for the current random. */
  votingRoundId?: bigint
  requireSecure?: boolean
}

export function useSecureRandom(
  options: UseSecureRandomOptions,
): ObservedRead<Observation<RandomResult>> {
  const { reader, chainId, votingRoundId, requireSecure } = options
  return useObservedRead(
    () =>
      readSecureRandom({
        reader,
        chainId,
        ...(votingRoundId === undefined ? {} : { votingRoundId }),
        ...(requireSecure === undefined ? {} : { requireSecure }),
      }),
    [chainId, votingRoundId, requireSecure],
  )
}
