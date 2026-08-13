'use client'

import { CopyButton } from '@flare-kit/react-ui'
import { useState } from 'react'
import { highlight } from '../../lib/highlight'

// Same code-window chrome as CodeBlock, with a package-manager segmented
// control in the title bar. The command the tab produces is what the copy
// button hands over — never the `$` prompt.

type Pm = 'npm' | 'pnpm' | 'bun'

const VERB: Record<Pm, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
}

const ORDER: Pm[] = ['npm', 'pnpm', 'bun']

export function InstallTabs({ packages }: { packages: string }) {
  const [pm, setPm] = useState<Pm>('npm')
  const command = `${VERB[pm]} ${packages}`

  return (
    <div className="win doc-code">
      <div className="win-bar">
        <div className="seg" role="tablist" aria-label="Package manager">
          {ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={pm === key}
              className="seg-tab mono"
              onClick={() => setPm(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <CopyButton value={command} label={`the ${pm} install command`} className="win-copy" />
      </div>
      <div className="code">
        <pre>
          <code>{highlight(`$ ${command}`, 'bash')}</code>
        </pre>
      </div>
    </div>
  )
}
