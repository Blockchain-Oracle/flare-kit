import { useCallback, useState } from 'react'

/**
 * The code window. `rounded.lg` frame, a `surface` title bar carrying a mono
 * filename, a copy control, and horizontal scroll inside its own container —
 * DESIGN.md > Components > Code window.
 *
 * A primitive rather than something a screen assembles, because the moment two
 * surfaces render code the two will drift. Nothing here is syntax-highlighted:
 * a highlighter that mis-tokenises a hex literal would be decorating a value
 * this kit spends its whole existence keeping exact.
 */

export interface CodeWindowProps {
  /** Shown in the title bar. A filename, so the snippet has an identity. */
  filename: string
  /** The code itself, already formatted. Rendered verbatim. */
  code: string
  /** A sentence above the frame, when the snippet needs one. */
  caption?: string
  className?: string
}

export function CodeWindow({ filename, code, caption, className }: CodeWindowProps) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1_500)
      },
      // A clipboard the browser refuses is not worth an error state; the code
      // is on screen and selectable either way.
      () => {},
    )
  }, [code])

  return (
    <div className={`fk-code${className ? ` ${className}` : ''}`}>
      <div className="fk-code-bar">
        <span className="fk-code-name">{filename}</span>
        <button
          type="button"
          className="fk-code-copy"
          data-copied={copied}
          onClick={copy}
          aria-label={copied ? `${filename} copied` : `Copy ${filename}`}
        >
          <span className={`fk-i ${copied ? 'fk-i-check' : 'fk-i-copy'}`} aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {caption ? <p className="fk-code-caption">{caption}</p> : null}
      {/* Scrolls inside its own container: DESIGN.md forbids the page scrolling
          horizontally at any width, and a proof struct is wider than a phone. */}
      <pre className="fk-code-body">
        <code>{code}</code>
      </pre>
    </div>
  )
}
