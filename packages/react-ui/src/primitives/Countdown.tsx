/**
 * The live countdown for the durable withdraw timeline (M7-R9). It is PURE: the
 * host passes `now` (unix seconds) and the component renders `targetUnix − now`.
 * Nothing here reads a wall clock, so a gallery screenshot at `MOCK_EPOCH` is
 * deterministic (the M4 gallery-clock rule) and the real app makes it "live"
 * simply by advancing the `now` it already threads through every surface. When
 * the target has passed it clamps to zero and marks itself `data-reached` — the
 * WithdrawCard swaps it for a CLAIMABLE badge at that point, so the primitive
 * stays dumb.
 */

export interface CountdownProps {
  /** The moment the wait ends, unix seconds. */
  readonly targetUnix: number
  /** The host's current time, unix seconds — a prop, never `Date.now()`. */
  readonly now: number
  /** An optional lead-in shown before the digits, e.g. "Claimable in". */
  readonly label?: string
  readonly className?: string
}

function segments(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
}

export function Countdown({ targetUnix, now, label, className }: CountdownProps) {
  const remaining = targetUnix - now
  const reached = remaining <= 0
  const time = reached ? 'Ready' : segments(remaining)
  const spoken = reached ? 'Ready to claim' : `${label ? `${label} ` : ''}${segments(remaining)}`
  return (
    <span
      className={`fk-countdown${className ? ` ${className}` : ''}`}
      role="timer"
      aria-label={spoken}
      data-reached={reached ? 'true' : 'false'}
    >
      {label ? <span className="fk-countdown-label">{label}</span> : null}
      <span className="fk-countdown-time fk-mono" aria-hidden="true">
        {time}
      </span>
    </span>
  )
}
