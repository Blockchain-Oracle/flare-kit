// packages/contracts/test/dex-liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { ERC20_ABI, UNIV2_ROUTER_ABI } from '../src/dex.js'

const names = (abi: readonly { name?: string }[]) => abi.map((f) => f.name)

describe('dex liquidity ABIs (M6-R1)', () => {
  it('the router ABI can add and remove liquidity', () => {
    expect(names(UNIV2_ROUTER_ABI)).toContain('addLiquidity')
    expect(names(UNIV2_ROUTER_ABI)).toContain('removeLiquidity')
    const add = UNIV2_ROUTER_ABI.find((f) => f.name === 'addLiquidity')!
    expect(add.inputs.map((i) => i.name)).toEqual([
      'tokenA', 'tokenB', 'amountADesired', 'amountBDesired',
      'amountAMin', 'amountBMin', 'feeBipsA', 'feeBipsB', 'to', 'deadline',
    ])
    expect(add.outputs.map((o) => o.name)).toEqual(['amountA', 'amountB', 'liquidity'])
  })

  it('the ERC-20 ABI can read an LP total supply for the share math', () => {
    expect(names(ERC20_ABI)).toContain('totalSupply')
  })
})
