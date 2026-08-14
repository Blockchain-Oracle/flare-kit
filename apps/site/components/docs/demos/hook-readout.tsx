'use client'

import { useEffect, useState } from 'react'
import { CodeBlock } from '../code-block'

/**
 * The live pane every hook page shares: the hook's actual return value, read
 * from the running hook against the mock kit on this render. Not a transcript
 * and not a fixture — if the hook's shape changes, this pane changes with it.
 *
 * It is written as a TypeScript object literal rather than JSON, because it is
 * documenting a RETURN SHAPE and JSON cannot express one. JSON also could not
 * tell the truth about this kit's values: it has no `undefined` (so "not read"
 * became `null`, a state this kit distinguishes everywhere else), no bigint (so
 * an exact value became a quoted string), and no functions (so every action
 * became "[function]").
 */

/** Keys that are valid identifiers are written bare, the way a type is written. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * A function's parameter list, for display only.
 *
 * Read from the source text, so a minified client bundle may show mangled
 * parameter names. That is cosmetic: a parameter's local name is not a claim
 * about protocol reality, and the arity and the shape stay correct either way.
 */
function signatureOf(fn: (...args: never[]) => unknown): string {
  const source = fn.toString()
  const params = source.slice(source.indexOf('(') + 1, source.indexOf(')')).trim()
  const named = params
    .split(',')
    .map((part) => part.split(/[=:]/)[0]!.trim())
    .filter(Boolean)
  return `(${named.join(', ')}) => …`
}

/**
 * How deep the pane renders before summarising.
 *
 * A plan result carries the call it would make, which carries the ABI fragment,
 * which runs for hundreds of lines of `stateMutability` / `inputs` / `outputs`.
 * A pane documenting a return SHAPE has to show the shape, so depth is capped —
 * but what is elided is counted and named, never silently dropped, because a
 * structure must not read as smaller than it is.
 */
const READABLE_DEPTH = 4

function summarise(value: object): string {
  if (Array.isArray(value)) return `[…${value.length} items]`
  const keys = Object.keys(value).length
  return `{…${keys} ${keys === 1 ? 'key' : 'keys'}}`
}

function formatValue(value: unknown, depth: number, seen: WeakSet<object>, max: number): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'

  switch (typeof value) {
    case 'bigint':
      // Unquoted, with its `n`. An exact value never renders as prose.
      return `${value}n`
    case 'string':
      return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    case 'number':
    case 'boolean':
      return String(value)
    case 'function':
      return signatureOf(value as (...args: never[]) => unknown)
    case 'symbol':
      return value.toString()
    default:
      break
  }

  const object = value as object
  // A cycle is a real shape, not an error. Naming it beats throwing.
  if (seen.has(object)) return '[circular]'
  seen.add(object)

  if (value instanceof Date) return `new Date('${value.toISOString()}')`

  // An EMPTY collection is a real answer — "read as empty" — so it is always
  // rendered literally, never summarised away as `[…0 items]`.
  const isEmpty = Array.isArray(value)
    ? value.length === 0
    : Object.keys(value as object).length === 0
  if (isEmpty) return Array.isArray(value) ? '[]' : '{}'

  if (depth >= max) return summarise(object)

  const pad = '  '.repeat(depth + 1)
  const close = '  '.repeat(depth)

  if (Array.isArray(value)) {
    const items = value.map((item) => `${pad}${formatValue(item, depth + 1, seen, max)},`)
    return `[\n${items.join('\n')}\n${close}]`
  }

  const lines = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const name = IDENTIFIER.test(key) ? key : `'${key}'`
    return `${pad}${name}: ${formatValue(entry, depth + 1, seen, max)},`
  })
  return `{\n${lines.join('\n')}\n${close}}`
}

/** The hook's return value as a TypeScript literal. */
export function formatHookValue(value: unknown, max = READABLE_DEPTH): string {
  return formatValue(value, 0, new WeakSet(), max)
}

export function HookReadout({
  name,
  value,
  returnType,
  depth = READABLE_DEPTH,
}: {
  name: string
  /** The value the hook returned on this render. */
  value: unknown
  /** The hook's declared return type, when the page states one. */
  returnType?: string
  /** How deep to render before summarising. Rarely worth overriding. */
  depth?: number
}) {
  /**
   * The pane reads LIVE hook state, so the server's pre-read snapshot and the
   * client's settled value differ by construction — and React fails hydration
   * when the update lands mid-hydration rather than after it.
   *
   * Every hook demo shares this pane, so every one carries the same race.
   * `useGovernance` was simply the first mock fast enough to lose it: it
   * resolves in one microtask, while `useDelegation` takes several and lands
   * after hydration completes. Fixing it per-page would have left the race in
   * place for whichever mock got faster next.
   *
   * So nothing live renders until mount. Both passes then agree, and the value
   * arrives immediately afterwards — which costs nothing, because a live
   * readout was never static content.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <>
      <CodeBlock
        code={mounted ? formatHookValue(value, depth) : '// reads on mount'}
        language="ts"
        title={returnType ?? `${name} — live return value`}
      />
      <p className="hook-readout-note">
        Read from the running hook against the mock kit, on this render.
      </p>
    </>
  )
}
