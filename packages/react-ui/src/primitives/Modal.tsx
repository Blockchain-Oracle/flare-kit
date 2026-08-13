import { type ReactNode, useEffect, useRef } from 'react'

/**
 * The one modal shell. A dialog is a pattern, not a screen, so it is built once
 * and both the wallet picker and the token selector consume it rather than each
 * re-coding an overlay that then drifts on accessibility.
 *
 * `role="dialog"` sits on the content, not the backdrop; it traps and restores
 * focus, and closes on Escape and on a backdrop click — the modal behaviour a
 * hand-rolled copy silently omits (R11).
 */

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  readonly open: boolean
  readonly title: ReactNode
  /** The dialog's accessible name for assistive tech. */
  readonly ariaLabel: string
  readonly onClose: () => void
  readonly children: ReactNode
  /** Optional pinned footer (e.g. the connect modal's custody note). */
  readonly footer?: ReactNode
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function Modal({ open, title, ariaLabel, onClose, children, footer, theme, className }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const restoreTo = document.activeElement as HTMLElement | null
    const node = contentRef.current
    node?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('disabled'),
      )
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreTo?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`fk fk-modal-overlay${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={contentRef}
        className="fk-modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        <div className="fk-modal-head">
          <span className="fk-modal-title">{title}</span>
          <button type="button" className="fk-modal-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
        {footer ? <div className="fk-modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}
