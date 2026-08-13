import { Panel } from './primitives/Panel.js'

export interface PoolCatalogueProps {
  readonly networkLabel?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

/**
 * The pool catalogue (M6-R10 / LIQ-04) as a declared-unbuilt surface: with one
 * live Coston2 pool a discovery catalogue would render a single row, so it is
 * shown present, disabled and reasoned rather than faked or silently omitted —
 * DESIGN.md's precedent for a surface that cannot honestly act.
 */
export function PoolCatalogue(props: PoolCatalogueProps) {
  return (
    <Panel
      title="Pool catalogue"
      subtitle={props.networkLabel}
      className={`fk fk-liq ${props.className ?? ''}`}
      data-theme={props.theme}
    >
      <div className="fk-unbuilt" aria-disabled="true">
        <p className="fk-unbuilt-title">Not built yet</p>
        <p className="fk-unbuilt-reason">
          One live Coston2 pool today; a multi-pool, multi-venue catalogue is a later milestone once
          mainnet or additional pools qualify.
        </p>
      </div>
    </Panel>
  )
}
