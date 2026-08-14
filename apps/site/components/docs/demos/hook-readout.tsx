'use client'

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

function formatValue(value: unknown, depth: number, seen: WeakSet<object>): string {
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

  const pad = '  '.repeat(depth + 1)
  const close = '  '.repeat(depth)

  if (value instanceof Date) return `new Date('${value.toISOString()}')`

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => `${pad}${formatValue(item, depth + 1, seen)},`)
    return `[\n${items.join('\n')}\n${close}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const lines = entries.map(([key, entry]) => {
    const name = IDENTIFIER.test(key) ? key : `'${key}'`
    return `${pad}${name}: ${formatValue(entry, depth + 1, seen)},`
  })
  return `{\n${lines.join('\n')}\n${close}}`
}

/** The hook's return value as a TypeScript literal. */
export function formatHookValue(value: unknown): string {
  return formatValue(value, 0, new WeakSet())
}

export function HookReadout({
  name,
  value,
  returnType,
}: {
  name: string
  /** The value the hook returned on this render. */
  value: unknown
  /** The hook's declared return type, when the page states one. */
  returnType?: string
}) {
  return (
    <>
      <CodeBlock
        code={formatHookValue(value)}
        language="ts"
        title={returnType ?? `${name} — live return value`}
      />
      <p className="hook-readout-note">
        Read from the running hook against the mock kit, on this render.
      </p>
    </>
  )
}
