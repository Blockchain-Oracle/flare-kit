import type { Amount } from '@flare-kit/core'
import { formatExact } from '@flare-kit/core'
import type { ReactNode } from 'react'

/**
 * A key/value row. The value renders in the mono face with tabular numerals,
 * because every amount, address, hash, round number and deadline does — a
 * number in the body face is a bug.
 */

export interface DetailRowProps {
  label: ReactNode
  /** Pass an Amount and it renders at full stored precision, with its asset. */
  value: ReactNode | Amount
  sub?: ReactNode
  className?: string
}

function isAmount(value: unknown): value is Amount {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Amount).value === 'bigint' &&
    typeof (value as Amount).asset === 'string'
  )
}

export function DetailRow({ label, value, sub, className }: DetailRowProps) {
  return (
    <div className={`fk-row${className ? ` ${className}` : ''}`}>
      <span className="fk-row-k">{label}</span>
      <span className="fk-row-v">
        {isAmount(value) ? formatExact(value) : value}
        {sub ? <span className="fk-row-v-sub"> {sub}</span> : null}
      </span>
    </div>
  )
}

export interface DetailsProps {
  children: ReactNode
  className?: string
  'aria-label'?: string
}

export function Details({ children, className, ...rest }: DetailsProps) {
  return (
    <div className={`fk-details${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </div>
  )
}
