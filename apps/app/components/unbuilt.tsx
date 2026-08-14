import type { Family } from '../lib/families'

/**
 * A reserved seam, stated. It names the capability, says it is not built, and
 * names the milestone that owns it — and it renders NO preview, because a
 * fabricated preview of an unbuilt capability is the same lie as a fabricated
 * balance.
 */
export function Unbuilt({ family }: { family: Family }) {
  if (family.status.kind !== 'unbuilt') return null
  return (
    <section className="app-unbuilt">
      <h1>{family.label}</h1>
      <p className="app-unbuilt-state">Not built yet.</p>
      <p>{family.status.will}</p>
      {/* fk-mono is the kit's mono class; `.mono` is a site-only helper. */}
      <p className="fk-mono app-unbuilt-owner">{family.status.milestone}</p>
    </section>
  )
}
