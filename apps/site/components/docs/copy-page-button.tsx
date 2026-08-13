'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copies the page's raw MDX, so a reader can paste the source of what they are
 * looking at into an agent. The markdown is read on the server and passed down
 * as a string — no extra fetch.
 */
export function CopyPageButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(markdown).then(
      () => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1_500)
      },
      () => {},
    )
  }, [markdown])

  if (!markdown) return null

  return (
    <button type="button" className="copy-page mono" onClick={copy}>
      <span className={`fk-i ${copied ? 'fk-i-check' : 'fk-i-copy'}`} aria-hidden="true" />
      {copied ? 'Copied' : 'Copy page'}
    </button>
  )
}
