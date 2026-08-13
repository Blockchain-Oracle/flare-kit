import { describe, expect, it } from 'vitest'
import { governanceFor, stakingFor } from '@flare-kit/contracts'
import { createAccountContext, supplyReadOnly, walletConnected } from '../src/account.js'
import { unavailable } from '../src/observation.js'
import {
  UNBUILT_POSITION_TYPES,
  assemblePortfolio,
  delegationPosition,
  stakePosition,
} from '../src/portfolio.js'
import { governancePosition } from '../src/governance.js'
import type { DelegationReads } from '../src/delegation-adapter.js'
import type { StakePosition } from '../src/pchain-rpc.js'
import {
  ALICE,
  COSTON2,
  XRPL_ALICE,
  XRPL_TESTNET,
  bothConnected,
  fAsset,
  nativeFlare,
  nativeXrp,
  xrplPosition,
  xrplSource,
} from './portfolio-fixtures.js'

// M2-R4: "readPortfolio returns observations across both identities: C2FLR and
// XRP native balances, the FAsset balance, and open operations from the
// registry. Position types not yet built are declared unbuilt, never shown as
// zero." — R-DATA-002.

describe('unbuilt position types', () => {
  it('declares every R-DATA-002 position type that does not exist yet', () => {
    // "An empty vault row implies a vault you do not have."
    const kinds = UNBUILT_POSITION_TYPES.map((type) => type.kind)
    expect(kinds).toContain('vault')
    expect(kinds).toContain('bridge-message')
    expect(kinds).toContain('stake')
    // M12 Task 6: governance is now BUILT (the live Coston2 round trip flipped
    // governanceVerified) — like delegation, it no longer declares itself unbuilt.
    expect(kinds).not.toContain('governance')
    // M10-R12: delegation is now BUILT — it no longer declares itself unbuilt.
    expect(kinds).not.toContain('delegation')
  })

  it('gives each one a reason, so unbuilt never reads as an empty holding', () => {
    for (const type of UNBUILT_POSITION_TYPES) {
      expect(type.label.length).toBeGreaterThan(0)
      expect(type.reason).toMatch(/not built|no .*capability|does not exist/i)
    }
  })

  it('carries no balance field at all, so nothing can render it as zero', () => {
    for (const type of UNBUILT_POSITION_TYPES) {
      expect('balance' in type).toBe(false)
    }
  })
})

describe('assemblePortfolio', () => {
  it('holds observations across both identities at once', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(), fAsset(), nativeXrp()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.positions).toHaveLength(3)
    expect(portfolio.positions.map((p) => p.family)).toContain('evm')
    expect(portfolio.positions.map((p) => p.family)).toContain('xrpl')
    expect(portfolio.assembledAt).toBe(2_000)
  })

  it('always declares the unbuilt types, even when holdings exist', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.unbuilt).toEqual(UNBUILT_POSITION_TYPES)
  })

  it('groups holdings by chain family', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(), fAsset(), nativeXrp()],
      pending: [],
      at: 2_000,
    })
    const byFamily = (family: string) =>
      portfolio.positions.filter((entry) => entry.family === family)
    expect(byFamily('evm')).toHaveLength(2)
    expect(byFamily('xrpl')).toHaveLength(1)
  })
})

describe('coverage', () => {
  it('is full when both identities are attached and both answered', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare(), nativeXrp()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.coverage.evm).toBe('covered')
    expect(portfolio.coverage.xrpl).toBe('covered')
    expect(portfolio.partialCoverage).toBe(false)
  })

  it('is partial when only one identity is attached', () => {
    // USER-01's "partial account coverage": the XRPL side is not empty, it is
    // unasked. Those are different claims.
    const portfolio = assemblePortfolio({
      context: createAccountContext({ evm: walletConnected('evm', ALICE, COSTON2) }),
      positions: [nativeFlare()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.coverage.xrpl).toBe('not-connected')
    expect(portfolio.partialCoverage).toBe(true)
  })

  it('is partial when an attached identity had no source answer', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [
        nativeFlare(),
        xrplPosition(
          unavailable(xrplSource, 2_000, 'The XRPL Testnet endpoint did not respond.'),
        ),
      ],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.coverage.xrpl).toBe('unavailable')
    expect(portfolio.partialCoverage).toBe(true)
  })
})

describe('read-only mode', () => {
  it('is set when any attached identity holds no key', () => {
    const portfolio = assemblePortfolio({
      context: createAccountContext({
        evm: walletConnected('evm', ALICE, COSTON2),
        xrpl: supplyReadOnly('xrpl', XRPL_ALICE, XRPL_TESTNET),
      }),
      positions: [nativeFlare(), nativeXrp()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.readOnly).toBe(true)
  })

  it('is not set when every attached identity can sign', () => {
    const portfolio = assemblePortfolio({
      context: bothConnected(),
      positions: [nativeFlare()],
      pending: [],
      at: 2_000,
    })
    expect(portfolio.readOnly).toBe(false)
  })
})

// M10-R12: the delegation type is now built — a delegation read produces a real observed
// view, never a declared-unbuilt row. Honesty (M2 coverage): an ABSENT read is
// `unavailable`, never a confident zero-delegation.
describe('delegationPosition (M10-R12)', () => {
  const A = '0x00000000000000000000000000000000000000A1' as const
  const populated: DelegationReads = {
    nativeBalance: 47n,
    wrappedBalance: 12n,
    mode: 1,
    delegates: [{ address: A, bips: 10000 }],
    votePower: 12n,
    undelegatedVotePower: 0n,
  }

  it('an absent read is unavailable — never a confident zero-delegation', () => {
    expect(delegationPosition(undefined)).toEqual({ status: 'unavailable' })
  })

  it('a present read is observed, carrying the wrapped balance, delegatees, vote power and mode', () => {
    expect(delegationPosition(populated)).toEqual({
      status: 'observed',
      wrappedBalance: 12n,
      delegates: [{ address: A, bips: 10000 }],
      votePower: 12n,
      mode: 1,
    })
  })

  it('an observed account with no delegates and mode 0 is a REAL observed-empty, distinct from unavailable', () => {
    const empty: DelegationReads = {
      nativeBalance: 0n,
      wrappedBalance: 0n,
      mode: 0,
      delegates: [],
      votePower: 0n,
      undelegatedVotePower: 0n,
    }
    const view = delegationPosition(empty)
    expect(view.status).toBe('observed')
    if (view.status !== 'observed') throw new Error('expected observed')
    expect(view.delegates).toEqual([])
    expect(view.mode).toBe(0)
  })
})

// M11: the stake position mechanism is built (`stakePosition` produces the M10-style
// `observed | unavailable` view), but the portfolio keeps `stake` DECLARED-UNBUILT while
// `stakeVerified` is false. The flip surfaces the observed position only once a live run
// confirms the round trip (T6). Honesty (M2 coverage): an ABSENT read is `unavailable`,
// never a fabricated zero — and an observed EMPTY read is a real observed-empty holding.
describe('stakePosition (M11) — built mechanism, gated on stakeVerified', () => {
  it('stake stays declared-unbuilt while the deployment stakeVerified flag is false', () => {
    expect(stakingFor('coston2')!.stakeVerified).toBe(false)
    expect(UNBUILT_POSITION_TYPES.map((type) => type.kind)).toContain('stake')
  })

  it('an absent read is unavailable — never a fabricated zero', () => {
    expect(stakePosition(undefined)).toEqual({ status: 'unavailable' })
  })

  it('an observed account with no stakes is a REAL observed-empty, distinct from unavailable', () => {
    expect(stakePosition({ stakes: [], mirroredVotePower: 0n })).toEqual({
      status: 'observed',
      stakes: [],
      mirroredVotePower: 0n,
    })
  })

  it('carries a real position and an unavailable mirror (undefined) within an observed view', () => {
    const pos: StakePosition = { nodeId: 'NodeID-X', amount: 5n, startTime: 1n, endTime: 2n }
    expect(stakePosition({ stakes: [pos], mirroredVotePower: undefined })).toEqual({
      status: 'observed',
      stakes: [pos],
      mirroredVotePower: undefined,
    })
  })
})

// M12 Task 6: the governance position mechanism is built (`governancePosition` produces the
// M10-style `observed | unavailable` view), and the live Coston2 delegate/undelegate round trip
// flipped `governanceVerified` true — so the portfolio now SURFACES governance (it no longer
// declares itself unbuilt), exactly as delegation was surfaced in M10-R12. Honesty (M2 coverage):
// an ABSENT read is `unavailable`, never a fabricated zero — and an observed read with 0 votes
// and no delegate is a REAL observed-empty holding, distinct from unavailable.
describe('governancePosition (M12) — built mechanism, surfaced after the governanceVerified flip', () => {
  const A = '0x00000000000000000000000000000000000000A1' as const
  const ZERO = '0x0000000000000000000000000000000000000000' as const

  it('governance is now BUILT — the live Coston2 round trip flipped governanceVerified, so it no longer declares itself unbuilt', () => {
    expect(governanceFor('coston2').governanceVerified).toBe(true)
    expect(UNBUILT_POSITION_TYPES.map((type) => type.kind)).not.toContain('governance')
  })

  it('an absent read is unavailable — never a fabricated zero', () => {
    expect(governancePosition(undefined)).toEqual({ status: 'unavailable' })
  })

  it('an observed account with zero votes and no delegate is a REAL observed-empty, distinct from unavailable', () => {
    expect(governancePosition({ votes: 0n, delegate: ZERO })).toEqual({
      status: 'observed',
      votes: 0n,
      delegate: ZERO,
    })
  })

  it('a present read is observed, carrying the votes and the current delegate', () => {
    expect(governancePosition({ votes: 42n, delegate: A })).toEqual({
      status: 'observed',
      votes: 42n,
      delegate: A,
    })
  })
})
