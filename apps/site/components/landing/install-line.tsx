'use client'

import { CopyButton } from '@flare-kit/react-ui'

/**
 * The mono `$ command` field. Isolated as a client component so the hero around
 * it stays a server component — the kit's CopyButton holds state.
 */
export function InstallLine({ command }: { command: string }) {
  return (
    <div className="copyline">
      <span className="copyline-cmd mono">
        <span className="copyline-prefix" aria-hidden="true">
          $
        </span>{' '}
        {command}
      </span>
      <CopyButton value={command} label="the install command" />
    </div>
  )
}
