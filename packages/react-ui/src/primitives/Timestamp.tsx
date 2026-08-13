/**
 * The one way an instant renders.
 *
 * ISO to the second, in the mono face, always UTC. A relative time ("4m ago")
 * is unusable in an exported record and ambiguous across a day boundary, and
 * the moment two surfaces each choose their own format the same round reads two
 * different ways on two screens.
 *
 * Seconds and milliseconds both arrive here because the chain and this package
 * disagree about the unit: every FTSO reading carries `timestampSeconds` as a
 * `bigint`, while an operation record carries `Date.now()` milliseconds. The
 * conversion happens once, here, rather than at nine call sites where one of
 * them would eventually multiply by the wrong power of ten.
 */

/** Milliseconds since the epoch, as the ISO string every surface shows. */
export function formatInstant(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Chain time. `bigint` in, because a `uint64` seconds value through `Number`
 * is the exact corruption this kit spends its existence preventing — and
 * `Number(seconds) * 1000` is safe only after the multiplication is done in
 * bigint space.
 */
export function formatInstantSeconds(seconds: bigint): string {
  return formatInstant(Number(seconds * 1_000n))
}

export interface TimestampProps {
  /** Chain time in seconds, or `undefined` when nothing was read. */
  seconds?: bigint
  /** Host time in milliseconds, for records this package wrote itself. */
  ms?: number
  className?: string
}

export function Timestamp({ seconds, ms, className }: TimestampProps) {
  const text =
    seconds !== undefined
      ? formatInstantSeconds(seconds)
      : ms !== undefined
        ? formatInstant(ms)
        : undefined

  // Never a dash and never an epoch zero: a placeholder shaped like a time is
  // read as a time.
  if (text === undefined) return <span className="fk-unread">no timestamp</span>

  // The visible text is ISO-to-the-second with the zone spelled out; the
  // machine-readable attribute must carry the offset or it parses as local time
  // and disagrees with the words beside it.
  const machine = seconds !== undefined ? new Date(Number(seconds * 1_000n)) : new Date(ms as number)

  return (
    <time
      className={`fk-mono fk-ts${className ? ` ${className}` : ''}`}
      dateTime={machine.toISOString()}
    >
      {text}
      <span className="fk-ts-zone"> UTC</span>
    </time>
  )
}
