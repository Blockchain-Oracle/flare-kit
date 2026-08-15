import Link from 'next/link'
import type { ReactNode } from 'react'

/** Mono breadcrumb above the title. */
export function Breadcrumb({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null
  return (
    <nav className="crumbs mono" aria-label="Breadcrumb">
      {parts.map((part, index) => (
        <span key={part} className={index === parts.length - 1 ? 'cur' : undefined}>
          {part}
          {index < parts.length - 1 && (
            <span className="sep" aria-hidden="true">
              /
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Title row: h1 plus whatever the page hangs beside it. */
export function DocTitle({ title, badges }: { title: string; badges?: ReactNode }) {
  return (
    <div className="doc-titlerow">
      <h1 className="doc-title">{title}</h1>
      {badges}
    </div>
  )
}

/** Section heading carrying its own permalink. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      {children}
      <a className="hash" href={`#${id}`} aria-label={`Permalink to this section`}>
        #
      </a>
    </h2>
  )
}

export function PrevNext({
  prev,
  next,
}: {
  prev?: { href: string; label: string }
  next?: { href: string; label: string }
}) {
  if (!prev && !next) return null
  return (
    <nav className="doc-foot-nav" aria-label="Pagination">
      {prev ? (
        <Link href={prev.href}>
          <span className="dir mono">← Previous</span>
          <span className="nm">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="next">
          <span className="dir mono">Next →</span>
          <span className="nm">{next.label}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

export interface PropRow {
  name: string
  type: string
  defaultValue?: string
  required?: boolean
  description: ReactNode
}

/** The props table every component page ends with. */
export function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <div className="props-wrap">
      <table className="props">
        <thead>
          <tr>
            <th>Prop</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <span className="pn mono">{row.name}</span>
                {row.required && <span className="req">required</span>}
              </td>
              <td>
                <span className="pt mono">{row.type}</span>
              </td>
              <td>
                <span className="pt mono">{row.defaultValue ?? '—'}</span>
              </td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
