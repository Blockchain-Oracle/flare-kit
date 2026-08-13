import type { ReactNode } from 'react'

/**
 * An inline notice. Every tone carries an icon as well as its colour, and an
 * attention or danger note is announced, because a state change a screen reader
 * never hears is a state change that did not happen (R11).
 */

export type NoteTone = 'info' | 'att' | 'bad' | 'ok'

const ICONS: Record<NoteTone, string> = {
  info: 'info',
  att: 'warning',
  bad: 'warning-circle',
  ok: 'seal',
}

export interface NoteProps {
  tone: NoteTone
  title?: ReactNode
  children: ReactNode
  className?: string
  /** So a control can point `aria-describedby` at the visible explanation. */
  id?: string
}

/**
 * Only a note that reports a *change* is a live region.
 *
 * `att` and `bad` interrupt, because something needs attention. `ok` announces
 * politely, because a result arrived. `info` gets no role at all: explanatory
 * copy that happens to sit in a box is not a status change, and marking it as
 * one makes a screen reader read the whole surface aloud every time anything
 * moves.
 */
const ROLES: Record<NoteTone, string | undefined> = {
  att: 'alert',
  bad: 'alert',
  ok: 'status',
  info: undefined,
}

export function Note({ tone, title, children, className, id }: NoteProps) {
  return (
    <div
      className={`fk-note fk-note-${tone}${className ? ` ${className}` : ''}`}
      {...(id ? { id } : {})}
      {...(ROLES[tone] ? { role: ROLES[tone] } : {})}
    >
      <span className={`fk-i fk-i-${ICONS[tone]}`} aria-hidden="true" />
      <div>
        {title ? <div className="fk-note-title">{title}</div> : null}
        <div className="fk-note-body">{children}</div>
      </div>
    </div>
  )
}
