import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { type VaultConfig, vaultByKey } from '@flarekit-dev/contracts'
import { applyTransition } from '../src/operation.js'
import { makeVaultAdapter } from '../src/vault-adapter.js'
import {
  type DepositIntent,
  type WithdrawIntent,
  buildClaimPlan,
  buildDepositPlan,
  buildWithdrawPlan,
  createWithdraw,
  reconcileWithdraw,
} from '../src/vault.js'

const OWNER = '0x00000000000000000000000000000000000000A1'
const NOW = 1_786_400_000
const firelightCfg = vaultByKey('coston2', 'firelight-fxrp')!
const upshiftCfg = vaultByKey('coston2', 'upshift-fxrp')!
// A verified copy, so the withdraw happy path is testable before the Task-5 flip.
const upshiftVerified: VaultConfig = { ...upshiftCfg, withdrawVerified: true }

function fakeClient(handlers: Record<string, (args: readonly unknown[]) => unknown>): PublicClient {
  return {
    async readContract({ functionName, args = [] }: { functionName: string; args?: readonly unknown[] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
  } as unknown as PublicClient
}

const depositIntent = (over: Partial<DepositIntent> = {}): DepositIntent => ({
  vaultKey: 'firelight-fxrp',
  assetsIn: 1_000_000n,
  slippageBips: 50,
  recipient: OWNER,
  deadline: NOW + 3_600,
  ...over,
})

// Firelight availability reads maxDeposit + the custom global depositLimit + totalAssets.
const open = (over: Record<string, () => unknown> = {}) =>
  fakeClient({ maxDeposit: () => 1n << 200n, depositLimit: () => 1n << 200n, totalAssets: () => 0n, ...over })

describe('buildDepositPlan', () => {
  it('adds an approve only when the asset allowance is short', async () => {
    const short = makeVaultAdapter(open({ balanceOf: () => 5_000_000n, allowance: () => 0n }), firelightCfg)
    const r = await buildDepositPlan(short, depositIntent(), OWNER, NOW)
    expect(r.kind).toBe('plan')
    if (r.kind !== 'plan') return
    expect(r.plan.approve).toBeDefined()
    expect(r.plan.deposit.functionName).toBe('deposit')

    const enough = makeVaultAdapter(open({ balanceOf: () => 5_000_000n, allowance: () => 9_000_000n }), firelightCfg)
    const r2 = await buildDepositPlan(enough, depositIntent(), OWNER, NOW)
    if (r2.kind !== 'plan') return
    expect(r2.plan.approve).toBeUndefined()
  })

  it('caps on the GLOBAL depositLimit that maxDeposit hides (verified live 2026-08-11)', async () => {
    // maxDeposit says "unlimited" but only 5939 units of global headroom remain.
    const nearFull = makeVaultAdapter(
      open({ maxDeposit: () => 1n << 255n, depositLimit: () => 15_000_000n, totalAssets: () => 14_994_061n, balanceOf: () => 9_000_000n, allowance: () => 0n }),
      firelightCfg,
    )
    const r = await buildDepositPlan(nearFull, depositIntent({ assetsIn: 1_000_000n }), OWNER, NOW)
    expect(r.kind === 'error' && r.error.kind).toBe('cap_exceeded')
    if (r.kind === 'error' && r.error.kind === 'cap_exceeded') expect(r.error.max).toBe(5_939n)
    // a deposit within the headroom is fine
    const small = await buildDepositPlan(nearFull, depositIntent({ assetsIn: 3_000n }), OWNER, NOW)
    expect(small.kind).toBe('plan')
  })

  it('gates paused, cap and insufficient balance before any signature', async () => {
    const paused = makeVaultAdapter(fakeClient({ maxDeposit: () => 0n, depositLimit: () => 0n, totalAssets: () => 0n }), firelightCfg)
    expect((await buildDepositPlan(paused, depositIntent(), OWNER, NOW)).kind).toBe('error')

    const capped = makeVaultAdapter(open({ maxDeposit: () => 500_000n, balanceOf: () => 9_000_000n }), firelightCfg)
    const cap = await buildDepositPlan(capped, depositIntent(), OWNER, NOW)
    expect(cap.kind === 'error' && cap.error.kind).toBe('cap_exceeded')

    const broke = makeVaultAdapter(open({ balanceOf: () => 10n }), firelightCfg)
    const short = await buildDepositPlan(broke, depositIntent(), OWNER, NOW)
    expect(short.kind === 'error' && short.error.kind).toBe('insufficient_balance')

    const late = makeVaultAdapter(fakeClient({}), firelightCfg)
    const exp = await buildDepositPlan(late, depositIntent({ deadline: NOW - 1 }), OWNER, NOW)
    expect(exp.kind === 'error' && exp.error.kind).toBe('expired')
  })
})

describe('buildWithdrawPlan verified-gating (M7-R10)', () => {
  const intent: WithdrawIntent = {
    vaultKey: 'upshift-fxrp',
    shares: 1_000_000n,
    route: 'delayed',
    slippageBips: 50,
    recipient: OWNER,
    deadline: NOW + 3_600,
  }

  it('REFUSES an unverified vault without reading or approving anything', async () => {
    // firelightCfg.withdrawVerified is false until the Task-5 live run
    const unverified = makeVaultAdapter(
      fakeClient({}), // any read would throw "unexpected read" — proving we never read
      firelightCfg,
    )
    const r = await buildWithdrawPlan(unverified, { ...intent, vaultKey: 'firelight-fxrp' }, OWNER, NOW)
    expect(r.kind === 'error' && r.error.kind).toBe('not_verified')
  })

  it('on a verified vault, adds the LP approve only when short and dispatches the route', async () => {
    const short = makeVaultAdapter(
      fakeClient({
        withdrawalsPaused: () => false,
        maxWithdrawalAmount: () => 10_000_000_000n,
        balanceOf: () => 5_000_000n,
        allowance: () => 0n,
        previewRedemption: () => [1_000_000n, 990_000n],
      }),
      upshiftVerified,
    )
    const r = await buildWithdrawPlan(short, intent, OWNER, NOW)
    expect(r.kind).toBe('plan')
    if (r.kind !== 'plan') return
    expect(r.plan.approveShare).toBeDefined()
    expect(r.plan.request.functionName).toBe('requestRedeem')

    const paused = makeVaultAdapter(
      fakeClient({ withdrawalsPaused: () => true, maxWithdrawalAmount: () => 10_000_000_000n }),
      upshiftVerified,
    )
    const p = await buildWithdrawPlan(paused, intent, OWNER, NOW)
    expect(p.kind === 'error' && p.error.kind).toBe('paused')
  })
})

describe('buildClaimPlan', () => {
  it('builds the vault-specific claim call from the ref', () => {
    const a = makeVaultAdapter(fakeClient({}), upshiftVerified)
    const plan = buildClaimPlan(a, { protocol: 'upshift', year: 2026, month: 8, day: 12, claimableAt: NOW }, OWNER)
    expect(plan.claim.functionName).toBe('claim')
    expect(plan.claim.args).toEqual([2026, 8, 12, OWNER])
  })
})

describe('reconcileWithdraw maps the wait onto canonical states', () => {
  const intent: WithdrawIntent = {
    vaultKey: 'upshift-fxrp',
    shares: 1_000_000n,
    route: 'delayed',
    slippageBips: 50,
    recipient: OWNER,
    deadline: NOW + 3_600,
  }
  const ref = { protocol: 'upshift', year: 2026, month: 8, day: 13, claimableAt: NOW + 86_400 } as const

  function submitted() {
    let op = createWithdraw({ chainId: 114, intent, now: NOW })
    for (const to of ['quoting', 'ready', 'executing', 'submitted'] as const) {
      op = applyTransition(op, { to, at: NOW }).record
    }
    return op
  }

  it('waiting → awaiting_external with the claimable time', () => {
    const r = reconcileWithdraw(submitted(), { kind: 'pending', claimableAt: NOW + 86_400, assets: 1_000_000n, claimed: false, ref }, NOW)
    expect(r.record.state).toBe('awaiting_external')
    expect(r.record.awaiting?.actor).toBe('flare')
  })

  it('claimable → action_required with a safe claim action (never a new-value move)', () => {
    const r = reconcileWithdraw(submitted(), { kind: 'pending', claimableAt: NOW, assets: 1_000_000n, claimed: false, ref }, NOW)
    expect(r.record.state).toBe('action_required')
    expect(r.record.recovery?.[0]?.id).toBe('claim')
    expect(r.record.recovery?.[0]?.movesNewValue).toBe(false)
  })

  it('claimed → succeeded (only the claim, not the request, is success)', () => {
    const r = reconcileWithdraw(submitted(), { kind: 'pending', claimableAt: NOW, assets: 0n, claimed: true, ref }, NOW)
    expect(r.record.state).toBe('succeeded')
  })
})
