'use client'

import { M6_LIQUIDITY_SECTIONS } from '@gallery/m6-liquidity-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * PositionCard's live preview. The states come wholesale from the gallery's
 * `m6-position` section — including the two that must never be confused with
 * each other: a real no-position and a read that could not be made. Nothing
 * here is re-authored, so the docs cannot drift from the surface.
 */
const POSITION_CASES = M6_LIQUIDITY_SECTIONS.find((section) => section.id === 'm6-position')!.cases

const CODE = `import { readPosition } from '@flarekit-dev/core'
import { PositionCard } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'
import { useState } from 'react'

const CHAIN = 114 // Coston2

export function readLiquidity(reader, owner) {
  return readPosition({ reader, chainId: CHAIN, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner })
}

export function Liquidity({ result, tokenA, tokenB }) {
  const [percent, setPercent] = useState(0)

  // The three outcomes stay three: a position, no position, and a read that
  // could not be made. The last one is never collapsed into the second.
  return (
    <PositionCard
      position={result.kind === 'position' ? result.position : null}
      unavailable={result.kind === 'unavailable' ? result.reason : undefined}
      tokenA={tokenA}
      tokenB={tokenB}
      networkLabel="Coston2"
      percent={percent}
      onPercentChange={setPercent}
    />
  )
}`

export function PositionCardDemo() {
  return <GalleryDemo cases={POSITION_CASES} code={CODE} label="gallery states" />
}
