import type { ReactNode } from 'react'

/**
 * The widget shell. Carries the `fk` scope class that every token is declared
 * on, so a host page needs no wrapper of its own and nothing leaks out.
 */

export interface PanelProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Rendered at the top right: usually a mode or state chip. */
  aside?: ReactNode
  children: ReactNode
  theme?: 'light' | 'dark'
  className?: string
  /**
   * Any `data-*` the surface wants on its root — `data-blocked`, `data-stale`
   * and friends. A state that only exists as a paragraph cannot be styled by a
   * host, targeted by a test, or told apart from a state that reads the same and
   * means something else.
   */
  [dataAttribute: `data-${string}`]: unknown
}

export function Panel({
  title,
  subtitle,
  aside,
  children,
  theme,
  className,
  ...dataAttributes
}: PanelProps) {
  return (
    <section
      className={`fk fk-panel${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      {...dataAttributes}
    >
      <header className="fk-panel-head">
        <div>
          <h2 className="fk-panel-title">{title}</h2>
          {subtitle ? <div className="fk-panel-sub">{subtitle}</div> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}
