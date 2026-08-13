/** Where the fault lives, which decides who can act on it. */
export type ErrorDomain =
  | 'input'
  | 'config'
  | 'network'
  | 'wallet'
  | 'protocol'
  | 'provider'
  | 'policy'
  | 'internal'

/**
 * The recovery matrix, as a class on every error. The distinction R3 turns on is
 * `reuse_existing` versus `requires_new_value`: one completes a mint from the
 * XRP already paid, the other would send XRP a second time.
 */
export type RecoveryClass =
  /** Nothing moved. Repeating the call costs nothing. */
  | 'safe_to_retry'
  /** Value moved. Recovery completes it from the payment and proof already made. */
  | 'reuse_existing'
  /** Recovery would create a new value-moving action. Needs explicit consent. */
  | 'requires_new_value'
  /** An external actor must act. There is no user action yet, and that is fine. */
  | 'wait'
  /** The canonical outcome is unknown. Offering any action could double-spend. */
  | 'unsafe_no_action'
  /** Nothing further will change this outcome. */
  | 'terminal'

/** Never a boolean. "We do not know yet" is a first-class answer. */
export type ValueMoved = 'yes' | 'no' | 'unknown'

export type FlareKitErrorCode =
  | 'INVALID_AMOUNT'
  | 'AMOUNT_UNIT_MISMATCH'
  | 'QUOTE_EXPIRED'
  | 'WALLET_REJECTED'
  | 'RPC_UNREACHABLE'
  | 'XRPL_PAYMENT_NOT_FOUND'
  | 'XRPL_SUBMISSION_UNCONFIRMED'
  | 'FDC_ROUND_NOT_FINALIZED'
  | 'EXECUTOR_DID_NOT_RUN'
  | 'MINTING_NOT_EXECUTED'
  | 'RESERVATION_EXPIRED'
  | 'PERSISTED_SCHEMA_UNSUPPORTED'
  | 'PERSISTED_RECORD_MALFORMED'
  | 'SECRET_IN_PERSISTED_RECORD'
  | (string & {})

export interface FlareKitErrorInit {
  domain: ErrorDomain
  message: string
  recovery: RecoveryClass
  /** Omitted means unknown. Silence is never taken to mean "nothing moved". */
  valueMoved?: ValueMoved
  /** Flat, copyable identifiers a human can paste into a support conversation. */
  evidence?: Readonly<Record<string, string>>
  cause?: unknown
}

/** The wire form that lands inside a durable operation record. */
export interface SerializedError {
  readonly code: FlareKitErrorCode
  readonly domain: ErrorDomain
  readonly message: string
  readonly recovery: RecoveryClass
  readonly valueMoved: ValueMoved
  readonly evidence: Readonly<Record<string, string>>
  readonly causeName?: string
  readonly causeMessage?: string
}

export class FlareKitError extends Error {
  readonly code: FlareKitErrorCode
  readonly domain: ErrorDomain
  readonly recovery: RecoveryClass
  readonly valueMoved: ValueMoved
  readonly evidence: Readonly<Record<string, string>>

  constructor(code: FlareKitErrorCode, init: FlareKitErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'FlareKitError'
    this.code = code
    this.domain = init.domain
    this.recovery = init.recovery
    this.valueMoved = init.valueMoved ?? 'unknown'
    this.evidence = Object.freeze({ ...init.evidence })
  }

  /** True when the only way forward would send value again. */
  get movesNewValue(): boolean {
    return this.recovery === 'requires_new_value'
  }

  /**
   * True when we must not offer to repeat a value-moving action. Unknown
   * outcomes block by default: if we cannot prove the XRP did not leave, we
   * never offer to send it again.
   */
  get blocksResubmission(): boolean {
    return this.valueMoved !== 'no' || this.recovery === 'unsafe_no_action'
  }
}

export function isFlareKitError(value: unknown): value is FlareKitError {
  return value instanceof FlareKitError
}

/**
 * Whether a surface may present this as a failure. An unresolved outcome is
 * never rendered as failed, and a timeout never invents a protocol failure.
 */
export function narratesFailure(error: FlareKitError | SerializedError): boolean {
  return error.recovery === 'terminal' && error.valueMoved !== 'unknown'
}

/**
 * Only the taxonomy and a cause's *message* cross the boundary. A raw cause can
 * be any object a provider handed us, including one holding key material, and
 * R-REC-002 forbids persisting that.
 */
export function serializeError(error: FlareKitError): SerializedError {
  const cause = error.cause
  const named = cause instanceof Error ? cause : undefined
  return {
    code: error.code,
    domain: error.domain,
    message: error.message,
    recovery: error.recovery,
    valueMoved: error.valueMoved,
    evidence: { ...error.evidence },
    ...(named ? { causeName: named.name, causeMessage: named.message } : {}),
  }
}

/**
 * Turns anything thrown into the taxonomy. A surface must be able to render
 * what went wrong without knowing where it came from, and an unrecognised
 * throw is an unknown outcome — never a proven failure.
 */
export function toSerializedError(value: unknown): SerializedError {
  if (isFlareKitError(value)) return serializeError(value)
  return serializeError(
    new FlareKitError('UNEXPECTED_ERROR', {
      domain: 'internal',
      message: value instanceof Error ? value.message : 'An unexpected error occurred.',
      recovery: 'unsafe_no_action',
      valueMoved: 'unknown',
    }),
  )
}

export function deserializeError(wire: SerializedError): FlareKitError {
  return new FlareKitError(wire.code, {
    domain: wire.domain,
    message: wire.message,
    recovery: wire.recovery,
    valueMoved: wire.valueMoved,
    evidence: wire.evidence,
    ...(wire.causeMessage
      ? { cause: new Error(`${wire.causeName ?? 'Error'}: ${wire.causeMessage}`) }
      : {}),
  })
}
