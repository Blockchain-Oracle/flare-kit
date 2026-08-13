'use client'

import { M8_BRIDGE_SECTIONS } from '@gallery/m8-bridge-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * RouteCatalogue's live preview. The states come wholesale from the gallery's
 * `m8-routes` section — both live-verified routes with their real quoted fee, a
 * route whose delivery has not been proven (config shown, bridge action reasoned
 * off), and a fee that could not be read at all. Nothing is re-authored here, so
 * the docs cannot show a catalogue state the surface never actually reached.
 */
const ROUTE_CASES = M8_BRIDGE_SECTIONS.find((section) => section.id === 'm8-routes')!.cases

const CODE = `import { type Amount, routesFor } from '@flare-kit/core'
import { RouteCatalogue, type RouteRow } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

export function Routes({ fees }: { fees: Record<string, Amount | null> }) {
  // One row per configured route. A fee you have not read yet is null, which
  // renders as an em dash — never as a confident zero.
  const rows: RouteRow[] = routesFor('coston2').map((route) => ({
    route,
    reads: { fee: fees[route.key] ?? null },
  }))

  return (
    <RouteCatalogue
      rows={rows}
      now={Math.floor(Date.now() / 1000)}
      networkLabel="Coston2"
    />
  )
}`

export function RouteCatalogueDemo() {
  return <GalleryDemo cases={ROUTE_CASES} code={CODE} label="observed fixtures" />
}
