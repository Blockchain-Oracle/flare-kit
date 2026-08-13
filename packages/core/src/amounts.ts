import { FlareKitError } from './errors.js'

/**
 * An exact token amount. R-OP-001 prohibits floating-point token arithmetic, so
 * the value is always base units as a bigint, and the scale and asset travel
 * with it. DESIGN.md then renders it at full stored precision: `250.000000 XRP`,
 * never `250`.
 */
export interface Amount {
  readonly value: bigint
  readonly decimals: number
  readonly asset: string
}

export function amount(value: bigint, decimals: number, asset: string): Amount {
  return Object.freeze({ value, decimals, asset })
}

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/

/**
 * Parses an exact decimal string. Precision beyond the asset's scale is an
 * error rather than a silent rounding, because rounding a user's amount down is
 * how a mint quietly under-pays and lands in the recovery matrix.
 */
export function parseAmount(text: string, decimals: number, asset: string): Amount {
  if (!DECIMAL_STRING.test(text)) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: `"${text}" is not an exact decimal amount of ${asset}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.')
  if (fraction.length > decimals) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: `${asset} holds ${decimals} decimals; "${text}" carries ${fraction.length} digits of precision that cannot be represented.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  const base = BigInt(whole + fraction.padEnd(decimals, '0'))
  return amount(negative ? -base : base, decimals, asset)
}

export interface FormatOptions {
  /** Set false to render the digits alone for composed layouts. */
  asset?: boolean
}

/** Renders every stored digit. A trimmed amount is a bug, not a nicety. */
export function formatExact(value: Amount, options: FormatOptions = {}): string {
  const negative = value.value < 0n
  const absolute = negative ? -value.value : value.value
  const scale = 10n ** BigInt(value.decimals)
  const whole = (absolute / scale).toString()
  const digits =
    value.decimals === 0
      ? whole
      : `${whole}.${(absolute % scale).toString().padStart(value.decimals, '0')}`
  const signed = negative ? `-${digits}` : digits
  return options.asset === false ? signed : `${signed} ${value.asset}`
}

function assertSameUnit(a: Amount, b: Amount): void {
  if (a.asset !== b.asset) {
    throw new FlareKitError('AMOUNT_UNIT_MISMATCH', {
      domain: 'internal',
      message: `Cannot combine ${a.asset} with ${b.asset}: they are different assets.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  if (a.decimals !== b.decimals) {
    throw new FlareKitError('AMOUNT_UNIT_MISMATCH', {
      domain: 'internal',
      message: `Cannot combine two ${a.asset} amounts held at different decimals (${a.decimals} and ${b.decimals}).`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
}

export function addAmounts(a: Amount, b: Amount): Amount {
  assertSameUnit(a, b)
  return amount(a.value + b.value, a.decimals, a.asset)
}

export function subAmounts(a: Amount, b: Amount): Amount {
  assertSameUnit(a, b)
  return amount(a.value - b.value, a.decimals, a.asset)
}
