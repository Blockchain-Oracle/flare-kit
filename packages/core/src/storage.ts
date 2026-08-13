import { FlareKitError } from './errors.js'
import type { OperationRecord } from './operation.js'
import { isTerminal } from './states.js'

/** R-REC-001: durable storage is pluggable and versioned. */
export const OPERATION_SCHEMA_VERSION = 1

export interface ListFilter {
  /** Only operations that have not reached a value-final state. */
  open?: boolean
}

export interface OperationStore {
  get(id: string): Promise<OperationRecord | undefined>
  put(record: OperationRecord): Promise<void>
  list(filter?: ListFilter): Promise<OperationRecord[]>
  delete(id: string): Promise<void>
}

const BIGINT_TAG = '$bigint'

/**
 * JSON cannot carry a bigint, and R-OP-001 forbids degrading base units to a
 * number to make it fit. Tagging is the only lossless option.
 */
export function encodeRecord(record: OperationRecord): string {
  return JSON.stringify(record, (_key, value: unknown) =>
    typeof value === 'bigint' ? { [BIGINT_TAG]: value.toString() } : value,
  )
}

function isBigIntTag(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[BIGINT_TAG] === 'string'
  )
}

export function decodeRecord(text: string): OperationRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(text, (_key, value: unknown) =>
      isBigIntTag(value) ? BigInt(value[BIGINT_TAG] as string) : value,
    )
  } catch (cause) {
    throw new FlareKitError('PERSISTED_RECORD_MALFORMED', {
      domain: 'internal',
      message: 'The persisted operation record is not valid JSON.',
      recovery: 'terminal',
      valueMoved: 'unknown',
      cause,
    })
  }

  const record = parsed as Partial<OperationRecord>
  if (record?.schemaVersion !== OPERATION_SCHEMA_VERSION) {
    // R-REC-008: an unrecognized version is surfaced, never coerced. A record
    // written by a newer build may hold evidence this build cannot interpret,
    // and guessing at it is how a paid mint gets re-paid.
    throw new FlareKitError('PERSISTED_SCHEMA_UNSUPPORTED', {
      domain: 'internal',
      message: `Unsupported operation schema version ${String(record?.schemaVersion)}; this build reads version ${OPERATION_SCHEMA_VERSION}.`,
      recovery: 'terminal',
      valueMoved: 'unknown',
    })
  }
  if (typeof record.id !== 'string' || typeof record.state !== 'string') {
    throw new FlareKitError('PERSISTED_RECORD_MALFORMED', {
      domain: 'internal',
      message: 'The persisted operation record is missing its id or state.',
      recovery: 'terminal',
      valueMoved: 'unknown',
    })
  }
  return record as OperationRecord
}

/**
 * Matched as a substring, not as a whole key. An anchored pattern let
 * `seedPhrase`, `walletSeed`, `privateKeyHex` and `mnemonicPhrase` through —
 * every one of them a real thing a caller would plausibly name — while
 * catching only the exact word. A false positive here costs a caller one
 * rename; a false negative writes a seed to disk.
 */
const SECRET_KEY =
  /(privatekey|secret|seed|mnemonic|passphrase|password|apikey|signingkey|keystore)/i

/** `private_key` and `signing_key` become `privatekey` and `signingkey`. */
function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '')
}

/**
 * R-REC-002 and M2-R8: no wallet secret or plaintext confidential input is
 * persisted, logged or transported. Enforced at the boundary rather than
 * trusted, because the caller shapes the intent and a durable store is the
 * worst place to learn a seed ended up in one.
 *
 * Exported so every export path — the durable store, an activity export, a
 * support bundle — runs the same check rather than each growing its own.
 */
export function assertNoSecrets(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(normalizeKey(key))) {
      throw new FlareKitError('SECRET_IN_PERSISTED_RECORD', {
        domain: 'policy',
        message: `Refusing to persist "${path}.${key}": operation records must never carry a wallet secret or confidential input.`,
        recovery: 'terminal',
        valueMoved: 'no',
      })
    }
    assertNoSecrets(child, `${path}.${key}`)
  }
}

function matches(record: OperationRecord, filter: ListFilter | undefined): boolean {
  return filter?.open !== true || !isTerminal(record.state)
}

/**
 * The default store. It holds encoded records rather than object references, so
 * a caller can never reach in and mutate persisted state, and every read
 * exercises the same codec a browser or server store would.
 */
export function createMemoryStore(): OperationStore {
  const rows = new Map<string, string>()

  return {
    async get(id) {
      const row = rows.get(id)
      return row === undefined ? undefined : decodeRecord(row)
    },
    async put(record) {
      assertNoSecrets(record.intent, 'intent')
      assertNoSecrets(record.quote, 'quote')
      assertNoSecrets(record.plan, 'plan')
      rows.set(record.id, encodeRecord(record))
    },
    async list(filter) {
      return [...rows.values()]
        .map(decodeRecord)
        .filter((record) => matches(record, filter))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async delete(id) {
      rows.delete(id)
    },
  }
}
