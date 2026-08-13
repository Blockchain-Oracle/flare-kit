import type { ReactNode } from 'react'

/**
 * The Swap/Limit control (M5-R10): the one new shared primitive, a segmented
 * pick-one-mode control for any future two-mode card.
 *
 * Its reason for being a primitive rather than two chips is the **declared-unbuilt
 * tab**. A mode the kit cannot act on — Limit, with no limit-order venue wired —
 * is shown, disabled and reasoned, never omitted and never faked into looking
 * available. The reason is text on screen and is tied to the tab for assistive
 * tech (R11: conveyed by text and shape, not colour or a cursor), the same
 * declared-unbuilt discipline the `fk-unbuilt-*` blocks use elsewhere.
 */

export interface SegmentedTab {
  readonly id: string
  readonly label: ReactNode
  /** A mode the kit cannot act on yet. Shown, but inert. */
  readonly disabled?: boolean
  /** Why a disabled tab cannot act. Rendered as a caption and read by AT. */
  readonly reason?: string
}

export interface SegmentedTabsProps {
  readonly tabs: readonly SegmentedTab[]
  /** The active tab's id. */
  readonly value: string
  readonly onChange?: (id: string) => void
  /** Names the group for assistive tech, e.g. "Order type". */
  readonly label: string
  readonly className?: string
}

const reasonId = (id: string) => `fk-segtab-reason-${id}`

export function SegmentedTabs({ tabs, value, onChange, label, className }: SegmentedTabsProps) {
  const reasons = tabs.filter((tab) => tab.disabled && tab.reason)
  return (
    <div className={`fk-segtabs-group${className ? ` ${className}` : ''}`}>
      <div className="fk-segtabs" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="fk-segtab"
            aria-selected={tab.id === value}
            disabled={tab.disabled}
            data-unbuilt={tab.disabled ? 'true' : undefined}
            {...(tab.disabled && tab.reason
              ? { title: tab.reason, 'aria-describedby': reasonId(tab.id) }
              : {})}
            onClick={tab.disabled ? undefined : () => onChange?.(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {reasons.map((tab) => (
        <p key={tab.id} id={reasonId(tab.id)} className="fk-segtabs-reason">
          {tab.reason}
        </p>
      ))}
    </div>
  )
}
