/**
 * The leg timeline — a compact, read-only progression of named legs, distinct from the
 * `OperationTimeline` spine (which carries the wallet-signed steps). One shared anatomy
 * so the payment surfaces never re-code it inline (M9-R13): the gasless relay timeline
 * (accepted → submitting → confirmed) and the x402 outcome timeline (settlement →
 * resource) are the same render over different legs. A leg can be `failed` (the x402
 * resource leg when the payment settled but the resource did not).
 */
export interface Leg {
  readonly id: string
  readonly label: string
  readonly state: 'pending' | 'active' | 'done' | 'failed'
}

export interface LegTimelineProps {
  readonly legs: readonly Leg[]
  readonly ariaLabel: string
  readonly className?: string
}

export function LegTimeline({ legs, ariaLabel, className }: LegTimelineProps) {
  return (
    <div className={`fk-legtl${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {legs.map((leg) => (
        <div key={leg.id} className="fk-legtl-leg" data-state={leg.state}>
          <span className="fk-legtl-leg-label">{leg.label}</span>
        </div>
      ))}
    </div>
  )
}
