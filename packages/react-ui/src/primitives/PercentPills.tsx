/**
 * The partial-removal control (M6-R9, R7): four presets over the LP balance
 * to withdraw, plus an exact-percent entry beside them for any 0-100 the
 * preset grid does not cover. The active preset is told apart by
 * shape/weight/border, never colour alone (DESIGN.md's "no state by colour
 * alone" rule applied to a control rather than an outcome chip), and every
 * pill — and the exact-entry field — meets the 24px+ WCAG 2.2 target size
 * this package holds everywhere else (M4-R12). The exact-entry field is
 * told apart from the pills by shape/border, not colour: it sits outside
 * the pill track in its own bordered box.
 */

const PRESETS = [25, 50, 75, 100] as const

export interface PercentPillsProps {
  readonly value: number
  readonly onChange?: (percent: number) => void
}

export function PercentPills({ value, onChange }: PercentPillsProps) {
  return (
    <div className="fk-pct" role="group" aria-label="Portion to withdraw">
      {PRESETS.map((p) => (
        <button key={p} type="button" className="fk-pct-pill" aria-pressed={value === p} data-active={value === p} onClick={() => onChange?.(p)}>
          {p === 100 ? 'Max' : `${p}%`}
        </button>
      ))}
      <input
        className="fk-pct-exact"
        type="number"
        min={0}
        max={100}
        inputMode="decimal"
        aria-label="Exact percent to withdraw"
        placeholder="%"
        value={value ? String(value) : ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= 0 && n <= 100) onChange?.(n)
        }}
      />
    </div>
  )
}
