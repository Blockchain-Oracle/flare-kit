import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The copy control on its own. Lifted out of `EvidenceChip` so a value that is
 * not operation evidence — a wallet address is identity, not an `EvidenceKind` —
 * gets the same affordance without being dressed as an evidence chip.
 *
 * The accessible name carries the confirmation, so the tick is not the only
 * signal. A clipboard the browser refuses is not an error state: the value is
 * still readable wherever it is shown, so the refusal is swallowed.
 */

export interface CopyButtonProps {
  /** The full value copied — never the truncated display form. */
  value: string
  /** Names the control: `Copy ${label}`, then `${label} copied`. */
  label: string
  /** Extra class so a host anatomy (a chip, a row) can place it. */
  className?: string
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  // One confirmation timer, cleared before re-arming and on unmount — this atom
  // renders many-per-screen, so a stray timer per instance is not free.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1_500)
      },
      () => {},
    )
  }, [value])

  return (
    <button
      type="button"
      className={`fk-copy${className ? ` ${className}` : ''}`}
      data-copied={copied}
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      <span className={`fk-i ${copied ? 'fk-i-check' : 'fk-i-copy'}`} aria-hidden="true" />
    </button>
  )
}
