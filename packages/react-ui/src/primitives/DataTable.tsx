import type { ReactNode } from 'react'

/**
 * The one table. Portfolio and activity are the same object at two altitudes —
 * rows of a thing, each with identifiers and a source — so they share a shell
 * rather than each growing their own.
 *
 * It is a real `<table>`. A grid of divs with ARIA roles bolted on is what
 * breaks row-and-column navigation in every screen reader that supports it,
 * and both surfaces are genuinely tabular data.
 */

export interface Column {
  readonly key: string
  readonly label: ReactNode
  /** Amounts and identifiers align right and render mono. */
  readonly numeric?: boolean
}

export interface DataTableProps {
  caption: string
  columns: readonly Column[]
  children: ReactNode
  className?: string
}

export function DataTable({ caption, columns, children, className }: DataTableProps) {
  return (
    <div className="fk-table-scroll">
      <table className={`fk-table${className ? ` ${className}` : ''}`}>
        {/* Visible to screen readers, not on screen: the surface already has a
            heading, and repeating it would be read twice. */}
        <caption className="fk-sr">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" data-numeric={column.numeric ?? false}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export interface EmptyRowProps {
  columns: number
  children: ReactNode
}

/**
 * One row explaining why there is nothing, rather than an empty tbody. An
 * empty table says "none"; this says which of the several reasons applies.
 */
export function EmptyRow({ columns, children }: EmptyRowProps) {
  return (
    <tr className="fk-table-empty">
      <td colSpan={columns}>{children}</td>
    </tr>
  )
}

export interface SkeletonRowsProps {
  columns: number
  label: string
}

const SKELETON_ROWS = 3

/**
 * Loading. Deliberately not zeroes or dashes in the value cells — a placeholder
 * that looks like a number is read as one.
 */
export function SkeletonRows({ columns, label }: SkeletonRowsProps) {
  return (
    <>
      <tr className="fk-sr-row">
        <td colSpan={columns}>
          <span className="fk-sr" role="status">
            {label}
          </span>
        </td>
      </tr>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <tr key={row} className="fk-table-skeleton" aria-hidden="true">
          {Array.from({ length: columns }, (_, cell) => (
            <td key={cell}>
              <span className="fk-skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
