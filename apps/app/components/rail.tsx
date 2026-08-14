import { BrandLockup } from '@flarekit-dev/react-ui'
import Link from 'next/link'
import { Fragment } from 'react'
import { FAMILIES } from '../lib/families'

/**
 * The reserved seams sit below a divider (R-APP-001). The registry orders them
 * last, so the first unbuilt entry is where the rule goes — derived rather than
 * written down, because a hardcoded index would silently move to the wrong
 * place the day a family is added.
 */
const FIRST_SEAM = FAMILIES.findIndex((family) => family.status.kind === 'unbuilt')

/**
 * The persistent rail. Flat, no groups — eleven-plus families fit, and grouping
 * is a decision to take when it demonstrably hurts rather than in advance.
 *
 * An unbuilt family is LISTED and reachable. Hiding it would present the app's
 * shape as the protocol's shape, and the whole product is about not doing that.
 */
export function Rail({ currentId }: { currentId: string }) {
  return (
    <div className="app-rail">
      {/* The lockup is the shared component, not a second drawing of the mark.
          It sits outside the nav: it is the way home, not a capability. */}
      <Link href="/" className="app-rail-brand" aria-label="flare-kit home">
        <BrandLockup />
      </Link>
      <nav aria-label="Capabilities">
        <ul>
          {FAMILIES.map((family, index) => {
            const unbuilt = family.status.kind === 'unbuilt'
            const describedBy = unbuilt ? `rail-note-${family.id}` : undefined
            return (
              <Fragment key={family.id}>
                {index === FIRST_SEAM && <li role="separator" className="app-rail-divider" />}
                <li>
                  <Link
                    href={`/${family.id}`}
                    className="app-rail-link"
                    aria-current={family.id === currentId ? 'page' : undefined}
                    aria-describedby={describedBy}
                    data-unbuilt={unbuilt ? 'true' : undefined}
                  >
                    {family.label}
                  </Link>
                  {/* `fk-sr`, not `hidden`: the description must genuinely reach
                      assistive technology, and a hidden element is dropped from
                      the accessibility tree in some user agents. The kit already
                      owns this utility — "only ever announced, never drawn". */}
                  {unbuilt && (
                    <span id={describedBy} className="fk-sr">
                      Not built yet
                    </span>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
