'use client'

import { CodeWindow } from '@flare-kit/react-ui'

/**
 * The live pane every hook page shares: the hook's actual return value,
 * serialized from the running hook against the mock kit. Not a transcript and
 * not a fixture — if the hook's shape changes, this pane changes with it,
 * which is the point.
 */
export function serializeHookValue(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, entry) => {
      if (typeof entry === 'bigint') return `${entry.toString()}n`
      if (typeof entry === 'function') return '[function]'
      if (entry === undefined) return null
      return entry
    },
    2,
  )
}

export function HookReadout({ name, value }: { name: string; value: unknown }) {
  return (
    <CodeWindow
      filename={`${name} — live return value`}
      code={serializeHookValue(value)}
      caption="Read from the running hook against the mock kit, on this render."
    />
  )
}
