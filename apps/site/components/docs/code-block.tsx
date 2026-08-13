'use client'

import { CopyButton } from '@flare-kit/react-ui'
import { isValidElement, type ReactNode } from 'react'
import { highlight, normalizeLang, type Lang } from '../../lib/highlight'

// Importing from `@flare-kit/react-ui` makes this client-only (the barrel calls
// createContext at module scope), same as InstallLine and LiveOperation. The
// tokenizer is cheap and runs during SSR, so the highlighted markup is still in
// the first paint.

/**
 * The one code surface for the docs: DESIGN.md's code window — `rounded.lg`
 * frame, `surface` title bar with a mono filename, a copy control, and
 * horizontal scroll inside its own container — with the code run through the
 * shared highlighter. Every fenced block and the Preview "Code" tab render
 * through this, so a code block is never flat, uncopyable text again.
 */
export function CodeBlock({
  code,
  language = 'tsx',
  title,
  copy = true,
}: {
  code: string
  language?: Lang
  title?: string
  copy?: boolean
}) {
  const showBar = Boolean(title) || copy
  return (
    <div className="win doc-code">
      {showBar && (
        <div className="win-bar">
          {title && <span className="win-title mono">{title}</span>}
          {copy && <CopyButton value={code} label="the code" className="win-copy" />}
        </div>
      )}
      <div className="code">
        <pre>
          <code>{highlight(code, language)}</code>
        </pre>
      </div>
    </div>
  )
}

/** Flatten MDX fenced-code children to the raw source string. */
function rawText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  if (isValidElement(node)) return rawText((node.props as { children?: ReactNode }).children)
  return ''
}

/**
 * MDX `pre` override. A fenced block arrives as `<pre><code class="language-x">`;
 * nothing in the pipeline highlights it, so this pulls the source and language
 * out of the inner `code` and renders the real code window instead.
 */
export function Pre({ children }: { children?: ReactNode }) {
  let className: string | undefined
  if (isValidElement(children)) {
    className = (children.props as { className?: string }).className
  }
  const code = rawText(children).replace(/\n$/, '')
  return <CodeBlock code={code} language={normalizeLang(className)} />
}
