// packages/core/test/mock-vault.test.ts
import { describe, expect, it } from 'vitest'
import { quoteDeposit, quoteWithdraw, readVaultPosition } from '../src/vault-quote.js'
import { buildDepositPlan, buildWithdrawPlan } from '../src/vault.js'
import { createWithdraw, applyWithdrawQuote } from '../src/vault.js'
import { withdrawalPhase } from '../src/vault-adapter.js'
import type { ClaimRef } from '../src/vault-adapter.js'
import { MOCK_VAULT_OBSERVED, createMockVaultAdapter, createMockVaultClient } from '../src/mock-vault.js'

const OWNER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const NOW = 1_786_400_000

describe('mock-vault (M7-R6) — drives the REAL quote/plan off observed Phase A behaviour', () => {
  it('Upshift deposit reproduces the observed shares (1 FXRP → 991577 vFXRP)', async () => {
    const a = createMockVaultAdapter('upshift-fxrp')
    const r = await quoteDeposit(a, MOCK_VAULT_OBSERVED.upshift.deposit.assetsIn, 50, NOW)
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.expectedShares.value).toBe(MOCK_VAULT_OBSERVED.upshift.deposit.shares) // 991577, exact
    expect(r.quote.minShares.value).toBe((991_577n * 9_950n) / 10_000n) // slippage floor
  })

  it('Upshift instant withdraw reproduces the observed net (495788 vFXRP → 497500 FXRP)', async () => {
    const a = createMockVaultAdapter('upshift-fxrp')
    const r = await quoteWithdraw(a, MOCK_VAULT_OBSERVED.upshift.instant.shares, 'instant', 50, NOW)
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.expectedAssets.value).toBe(MOCK_VAULT_OBSERVED.upshift.instant.net) // 497500, exact
  })

  it('applies the live-verified fee model exactly: net = gross − floor(gross·bips/1e4)', async () => {
    const a = createMockVaultAdapter('upshift-fxrp')
    for (const [route, bips] of [['instant', 50] as const, ['delayed', 25] as const]) {
      const r = await quoteWithdraw(a, 400_000n, route, 0, NOW)
      if (r.kind !== 'quote') throw new Error('expected quote')
      const gross = r.quote.grossAssets.value
      expect(r.quote.expectedAssets.value).toBe(gross - (gross * BigInt(bips)) / 10_000n)
      expect(r.quote.feeAssets.value).toBe((gross * BigInt(bips)) / 10_000n)
    }
  })

  it('Firelight is 1:1 with no withdrawal fee', async () => {
    const a = createMockVaultAdapter('firelight-fxrp')
    const dep = await quoteDeposit(a, 3_000n, 50, NOW)
    if (dep.kind !== 'quote') throw new Error('expected quote')
    expect(dep.quote.expectedShares.value).toBe(3_000n) // 1:1
    const wd = await quoteWithdraw(a, 3_000n, 'delayed', 0, NOW)
    if (wd.kind !== 'quote') throw new Error('expected quote')
    expect(wd.quote.expectedAssets.value).toBe(3_000n) // no fee
    expect(wd.quote.feeAssets.value).toBe(0n)
  })

  it("Firelight's real global cap: a deposit over the observed headroom is cap_exceeded, never a revert", async () => {
    const a = createMockVaultAdapter('firelight-fxrp')
    const over = await buildDepositPlan(
      a,
      { vaultKey: 'firelight-fxrp', assetsIn: 1_000_000n, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 },
      OWNER,
      NOW,
    )
    expect(over).toEqual({ kind: 'error', error: { kind: 'cap_exceeded', max: MOCK_VAULT_OBSERVED.firelight.headroom } })

    const within = await buildDepositPlan(
      a,
      { vaultKey: 'firelight-fxrp', assetsIn: 3_000n, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 },
      OWNER,
      NOW,
    )
    expect(within.kind).toBe('plan')
  })

  it('a deposit needs an approve step only when the asset allowance is short', async () => {
    const short = await buildDepositPlan(
      createMockVaultAdapter('upshift-fxrp', { assetAllowance: 0n }),
      { vaultKey: 'upshift-fxrp', assetsIn: 1_000_000n, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 },
      OWNER,
      NOW,
    )
    if (short.kind !== 'plan') throw new Error('expected plan')
    expect(short.plan.approve).toBeDefined()

    const preApproved = await buildDepositPlan(
      createMockVaultAdapter('upshift-fxrp', { assetAllowance: 1n << 200n }),
      { vaultKey: 'upshift-fxrp', assetsIn: 1_000_000n, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 },
      OWNER,
      NOW,
    )
    if (preApproved.kind !== 'plan') throw new Error('expected plan')
    expect(preApproved.plan.approve).toBeUndefined()
  })

  it('Upshift withdraw pulls the LP, so it needs a share approval when short', async () => {
    const r = await buildWithdrawPlan(
      createMockVaultAdapter('upshift-fxrp', { shareBalance: 1_000_000n, shareAllowance: 0n }),
      { vaultKey: 'upshift-fxrp', shares: 495_789n, route: 'delayed', slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 },
      OWNER,
      NOW,
    )
    if (r.kind !== 'plan') throw new Error('expected plan')
    expect(r.plan.approveShare).toBeDefined()
    expect(r.plan.request.functionName).toBe('requestRedeem')
  })

  it('a real share balance is a position; a zero balance is an honest no_position', async () => {
    const pos = await readVaultPosition(createMockVaultAdapter('upshift-fxrp', { shareBalance: 991_577n }), OWNER)
    expect(pos.kind).toBe('position')
    const none = await readVaultPosition(createMockVaultAdapter('upshift-fxrp', { shareBalance: 0n }), OWNER)
    expect(none.kind).toBe('no_position')
  })

  it('reconciles a delayed request through waiting → claimable off the observed clock', async () => {
    const ref: ClaimRef = { protocol: 'firelight', period: 333n, claimableAt: MOCK_VAULT_OBSERVED.firelight.currentPeriodEnd }
    const waitingAdapter = createMockVaultAdapter('firelight-fxrp', { currentPeriod: 333n, withdrawalAmount: 3_000n })
    const waiting = await waitingAdapter.reads.claimable(OWNER, ref, ref.claimableAt - 10)
    expect(withdrawalPhase(waiting, ref.claimableAt - 10)).toBe('waiting')

    const claimableAdapter = createMockVaultAdapter('firelight-fxrp', { currentPeriod: 334n, withdrawalAmount: 3_000n, claimed: false })
    const claimable = await claimableAdapter.reads.claimable(OWNER, ref, ref.claimableAt + 10)
    expect(withdrawalPhase(claimable, ref.claimableAt + 10)).toBe('claimable')
    expect(claimable).toMatchObject({ kind: 'pending', assets: 3_000n, claimed: false })
  })

  it('drives the durable withdraw lifecycle onto the canonical states (no new state invented)', async () => {
    const a = createMockVaultAdapter('upshift-fxrp', { shareBalance: 495_789n, shareAllowance: 1n << 200n })
    let op = createWithdraw({ chainId: 114, intent: { vaultKey: 'upshift-fxrp', shares: 495_789n, route: 'delayed', slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }, now: NOW })
    op = { ...op, state: 'quoting' }
    const q = await quoteWithdraw(a, 495_789n, 'delayed', 50, NOW)
    const plan = await buildWithdrawPlan(a, op.intent, OWNER, NOW)
    if (q.kind !== 'quote' || plan.kind !== 'plan') throw new Error('setup')
    const t = applyWithdrawQuote(op, { quote: q.quote, plan, now: NOW })
    expect(t.stateChanged).toBe(true)
    expect(t.rejection).toBeUndefined()
    expect(t.record.state).toBe('ready') // pre-approved LP → no approval step, ready to request
  })

  it('REFUSES the unobserved — an unknown vault key, and an unexpected read', async () => {
    expect(() => createMockVaultAdapter('nonexistent-vault')).toThrow(/never observed|not observed|unknown/i)
    // A read the mock never captured must throw loudly, never return a plausible zero.
    const client = createMockVaultClient('upshift-fxrp')
    await expect(
      client.readContract({ address: '0x0', abi: [], functionName: 'someUnobservedRead', args: [] }),
    ).rejects.toThrow(/unexpected|unobserved/i)
  })

  it('refuses an exit route the vault never offered (Firelight has no instant)', async () => {
    const a = createMockVaultAdapter('firelight-fxrp')
    const r = await quoteWithdraw(a, 3_000n, 'instant', 50, NOW)
    expect(r.kind).toBe('unavailable')
  })

  // The honesty gates the review gate surfaced — each drives a first-class state
  // through a mock override, so paused/cap/waiting are tested, not just reachable.
  it('a FULL Firelight vault deposits as cap_exceeded, never a fabricated pause', async () => {
    const a = createMockVaultAdapter('firelight-fxrp', { depositLimit: 15_000_000n, totalAssets: 15_000_000n })
    const r = await buildDepositPlan(a, { vaultKey: 'firelight-fxrp', assetsIn: 1_000n, slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }, OWNER, NOW)
    expect(r).toEqual({ kind: 'error', error: { kind: 'cap_exceeded', max: 0n } })
  })

  it('a WAITING Upshift delayed request never self-reconciles to a false success', async () => {
    const ref: ClaimRef = { protocol: 'upshift', year: 2026, month: 8, day: 12, claimableAt: NOW + 3600 }
    const a = createMockVaultAdapter('upshift-fxrp', { burnable: 0n })
    const p = await a.reads.claimable(OWNER, ref, NOW) // now < claimableAt → waiting, never claimed
    expect(p).toMatchObject({ claimed: false })
    expect(withdrawalPhase(p, NOW)).toBe('waiting')
  })

  it('a paused Upshift vault refuses the withdraw as paused (first-class state)', async () => {
    const a = createMockVaultAdapter('upshift-fxrp', { shareBalance: 400_000n, shareAllowance: 1n << 200n, withdrawPaused: true })
    const r = await buildWithdrawPlan(a, { vaultKey: 'upshift-fxrp', shares: 400_000n, route: 'delayed', slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }, OWNER, NOW)
    expect(r).toEqual({ kind: 'error', error: { kind: 'paused' } })
  })

  it('an Upshift withdrawal over maxWithdrawalAmount is cap_exceeded', async () => {
    const shares = 20_000_000_000n
    const a = createMockVaultAdapter('upshift-fxrp', { shareBalance: shares, shareAllowance: 1n << 200n, maxWithdrawal: 1_000n })
    const r = await buildWithdrawPlan(a, { vaultKey: 'upshift-fxrp', shares, route: 'delayed', slippageBips: 50, recipient: OWNER, deadline: NOW + 1200 }, OWNER, NOW)
    if (r.kind !== 'error') throw new Error('expected cap gate')
    expect(r.error.kind).toBe('cap_exceeded')
  })
})
