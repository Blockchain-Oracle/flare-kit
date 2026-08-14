import Link from 'next/link'
import { FAMILIES } from '../lib/families'

/**
 * The persistent rail. Flat, no groups — eleven-plus families fit, and grouping
 * is a decision to take when it demonstrably hurts rather than in advance.
 *
 * An unbuilt family is LISTED and reachable. Hiding it would present the app's
 * shape as the protocol's shape, and the whole product is about not doing that.
 */
export function Rail({ currentId }: { currentId: string }) {
  return (
    <nav className="app-rail" aria-label="Capabilities">
      <ul>
        {FAMILIES.map((family) => {
          const unbuilt = family.status.kind === 'unbuilt'
          const describedBy = unbuilt ? `rail-note-${family.id}` : undefined
          return (
            <li key={family.id}>
              <Link
                href={`/${family.id}`}
                className="app-rail-link"
                aria-current={family.id === currentId ? 'page' : undefined}
                aria-describedby={describedBy}
                data-unbuilt={unbuilt ? 'true' : undefined}
              >
                {family.label}
              </Link>
              {unbuilt && (
                <span id={describedBy} hidden>
                  Not built yet
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
