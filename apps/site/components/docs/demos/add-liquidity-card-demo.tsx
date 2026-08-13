'use client'

import { M6_LIQUIDITY_SECTIONS } from '@gallery/m6-liquidity-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * AddLiquidityCard's live preview. The states come wholesale from the gallery's
 * `m6-add-liquidity` section — records built by walking the real add-liquidity
 * state machine with fixture pool readings, not re-authored fixtures. The chip
 * says "gallery states" rather than "mock kit" because no kit is involved here:
 * these cards are prop-driven, and claiming a mock kit would be a claim about
 * the preview that is not true.
 */
const ADD_CASES = M6_LIQUIDITY_SECTIONS.find((section) => section.id === 'm6-add-liquidity')!.cases

const CODE = `import {
  applyAddQuote,
  createAddLiquidity,
  quoteAddLiquidity,
  readAllowance,
  startQuoting,
} from '@flare-kit/core'
import { AddLiquidityCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const CHAIN = 114 // Coston2

export async function quoteSupply(reader, owner, now = Date.now()) {
  const intent = {
    tokenAKey: 'FXRP',
    tokenBKey: 'USDT0',
    amountADesired: 1_000000n,
    slippageBips: 50,
    recipient: owner,
    deadline: Math.floor(now / 1000) + 1200,
  }
  const [result, allowanceA, allowanceB] = await Promise.all([
    quoteAddLiquidity({ reader, chainId: CHAIN, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: intent.amountADesired, slippageBips: 50, now }),
    readAllowance(reader, CHAIN, 'FXRP', owner),
    readAllowance(reader, CHAIN, 'USDT0', owner),
  ])
  const quoting = startQuoting(createAddLiquidity({ chainId: CHAIN, intent, now }), now).record
  return { operation: applyAddQuote(quoting, { result, allowanceA, allowanceB, now }).record, result }
}

export function Supply({ operation, result, tokenA, tokenB, balanceA, balanceB }) {
  return (
    <AddLiquidityCard
      operation={operation}
      quoteResult={result}
      tokenA={tokenA}
      tokenB={tokenB}
      balanceA={balanceA}
      balanceB={balanceB}
      networkLabel="Coston2"
      onSubmit={() => console.log('supply', operation.plan)}
    />
  )
}`

export function AddLiquidityCardDemo() {
  return <GalleryDemo cases={ADD_CASES} code={CODE} label="gallery states" />
}
