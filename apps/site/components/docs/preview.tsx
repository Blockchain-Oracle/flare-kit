'use client'

import { CopyButton } from '@flarekit-dev/react-ui'
import { useState, type ReactNode } from 'react'
import { highlight } from '../../lib/highlight'

/**
 * Preview / Code tabs over one demo.
 *
 * The preview pane mounts the real component against the real mock — it is not
 * a picture of the component. That is the whole point of the docs running on
 * React rather than a static site generator.
 *
 * The `mock kit` chip is not decoration: every surface driven by the mock says
 * so, and a mock is never a fallback triggered by a failure.
 */
export function Preview({
  children,
  code,
  label = 'mock kit',
}: {
  children: ReactNode
  code: string
  label?: string
}) {
  const [pane, setPane] = useState<'preview' | 'code'>('preview')

  return (
    <div className="preview">
      <div className="preview-bar">
        <div className="preview-tabs" role="tablist" aria-label="Preview or code">
          <button
            type="button"
            role="tab"
            id="tab-preview"
            aria-selected={pane === 'preview'}
            aria-controls="panel-preview"
            className="preview-tab"
            onClick={() => setPane('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            id="tab-code"
            aria-selected={pane === 'code'}
            aria-controls="panel-code"
            className="preview-tab"
            onClick={() => setPane('code')}
          >
            Code
          </button>
        </div>
        <span className="preview-chip mono">{label}</span>
      </div>

      <div
        id="panel-preview"
        role="tabpanel"
        aria-labelledby="tab-preview"
        className="preview-stage"
        hidden={pane !== 'preview'}
        // Focusable because it scrolls: a component wider than the column — the
        // M13 composers are — must be reachable by keyboard, not only by mouse
        // (axe: scrollable-region-focusable). The code window beside it does the
        // same thing for the same reason.
        tabIndex={0}
      >
        {children}
      </div>

      <div
        id="panel-code"
        role="tabpanel"
        aria-labelledby="tab-code"
        className="preview-code"
        hidden={pane !== 'code'}
      >
        <CopyButton value={code} label="the code" className="preview-copy" />
        <pre>
          <code>{highlight(code, 'tsx')}</code>
        </pre>
      </div>
    </div>
  )
}
