import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { vaultByKey } from '@flarekit-dev/contracts'
import { type PendingWithdrawal, firelightClaimRef, makeVaultAdapter, withdrawalPhase } from '../src/vault-adapter.js'

const OWNER = '0x00000000000000000000000000000000000000A1'
const RECV = '0x00000000000000000000000000000000000000B2'
const firelightCfg = vaultByKey('coston2', 'firelight-fxrp')!
const upshiftCfg = vaultByKey('coston2', 'upshift-fxrp')!

/** A fake PublicClient dispatching reads by function name. */
function fakeClient(handlers: Record<string, (args: readonly unknown[]) => unknown>): PublicClient {
  return {
    async readContract({ functionName, args = [] }: { functionName: string; args?: readonly unknown[] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
  } as unknown as PublicClient
}

describe('Firelight adapter', () => {
  const client = fakeClient({
    convertToAssets: ([shares]) => shares, // 1:1
    previewRedeem: ([shares]) => shares,
    balanceOf: () => 5_000_000n,
    allowance: () => 0n,
    maxDeposit: () => (1n << 255n),
    currentPeriod: () => 333n,
    isWithdrawClaimed: () => false,
    withdrawalsOf: () => 1_000_000n,
  })
  const a = makeVaultAdapter(client, firelightCfg)

  it('previewWithdraw has no fee (assetsAfterFee == assets)', async () => {
    expect(await a.reads.previewWithdraw(1_000_000n, 'delayed')).toEqual({
      assets: 1_000_000n,
      assetsAfterFee: 1_000_000n,
    })
  })

  it('self-share needs no LP approval', async () => {
    expect(a.writes.needsShareApproval).toBe(false)
    expect(await a.reads.shareAllowance(OWNER)).toBe((1n << 256n) - 1n)
    expect(() => a.writes.approveShare(1n)).toThrow(/self-share/)
  })

  it('builds the standard ERC-4626 deposit and the period-based redeem/claim', () => {
    expect(a.writes.deposit(1_000_000n, RECV)).toMatchObject({
      protocol: 'firelight',
      functionName: 'deposit',
      args: [1_000_000n, RECV],
    })
    expect(a.writes.requestWithdraw(2n, RECV, OWNER, 'delayed')).toMatchObject({
      functionName: 'redeem',
      args: [2n, RECV, OWNER],
    })
    expect(a.writes.claim({ protocol: 'firelight', period: 333n, claimableAt: 0 }, RECV)).toMatchObject({
      functionName: 'claimWithdraw',
      args: [333n],
    })
  })

  it('claimable waits while the period is current, then flips to claimable', async () => {
    const ref = { protocol: 'firelight', period: 333n, claimableAt: 1_000 } as const
    // currentPeriod (333) <= ref.period → still waiting (Firelight ignores `now`, it uses currentPeriod)
    const waiting = await a.reads.claimable(OWNER, ref, 999)
    expect(waiting).toMatchObject({ kind: 'pending', claimed: false })
    expect(withdrawalPhase(waiting, 999)).toBe('waiting')
    expect(withdrawalPhase(waiting, 1_000)).toBe('claimable')

    // once the period has advanced past the request period, it is claimable
    const later = makeVaultAdapter(
      fakeClient({ currentPeriod: () => 334n, isWithdrawClaimed: () => false, withdrawalsOf: () => 1_000_000n }),
      firelightCfg,
    )
    const claimable = await later.reads.claimable(OWNER, ref, 1_000)
    expect(claimable).toMatchObject({ kind: 'pending', claimed: false, assets: 1_000_000n })
  })
})

describe('Upshift adapter', () => {
  const client = fakeClient({
    previewRedemption: ([, isInstant]) => (isInstant ? [1_000_000n, 950_000n] : [1_000_000n, 990_000n]),
    previewDeposit: ([, amount]) => [amount, amount],
    balanceOf: () => 4_000_000n,
    allowance: () => 0n,
    withdrawalsPaused: () => false,
    maxWithdrawalAmount: () => 10_000_000_000n,
    getBurnableAmountByReceiver: () => 0n,
  })
  const a = makeVaultAdapter(client, upshiftCfg)

  it('previewWithdraw returns the contract-computed net-of-fee amount per route', async () => {
    expect(await a.reads.previewWithdraw(1_000_000n, 'instant')).toEqual({ assets: 1_000_000n, assetsAfterFee: 950_000n })
    expect(await a.reads.previewWithdraw(1_000_000n, 'delayed')).toEqual({ assets: 1_000_000n, assetsAfterFee: 990_000n })
  })

  it('deposit is NON-standard: asset address is the first arg', () => {
    expect(a.writes.deposit(1_000_000n, RECV)).toMatchObject({
      protocol: 'upshift',
      functionName: 'deposit',
      args: [upshiftCfg.asset.address, 1_000_000n, RECV],
    })
  })

  it('dispatches the two withdraw routes to distinct calls', () => {
    expect(a.writes.requestWithdraw(3n, RECV, OWNER, 'instant')).toMatchObject({
      functionName: 'instantRedeem',
      args: [3n, RECV],
    })
    expect(a.writes.requestWithdraw(3n, RECV, OWNER, 'delayed')).toMatchObject({
      functionName: 'requestRedeem',
      args: [3n, RECV],
    })
    expect(a.writes.claim({ protocol: 'upshift', year: 2026, month: 8, day: 12, claimableAt: 0 }, RECV)).toMatchObject({
      functionName: 'claim',
      args: [2026, 8, 12, RECV],
    })
  })

  it('pulls the separate LP token, so it needs a share approval', () => {
    expect(a.writes.needsShareApproval).toBe(true)
    expect(a.writes.approveShare(1n)).toMatchObject({
      protocol: 'erc20',
      address: upshiftCfg.share.kind === 'lp' ? upshiftCfg.share.address : undefined,
      functionName: 'approve',
    })
  })
})

describe('Upshift claimable — a waiting request is never a false success (M7 honesty)', () => {
  const ref = { protocol: 'upshift', year: 2026, month: 8, day: 12, claimableAt: 1_000 } as const

  it('before the epoch, a zero burnable is WAITING, never claimed', async () => {
    const a = makeVaultAdapter(fakeClient({ getBurnableAmountByReceiver: () => 0n }), upshiftCfg)
    const p = await a.reads.claimable(OWNER, ref, ref.claimableAt - 10) // now < epoch
    expect(p).toMatchObject({ kind: 'pending', claimed: false, assets: null })
    expect(withdrawalPhase(p, ref.claimableAt - 10)).toBe('waiting')
  })

  it('at/after the epoch with a positive burnable, it is claimable', async () => {
    const a = makeVaultAdapter(fakeClient({ getBurnableAmountByReceiver: () => 497_500n }), upshiftCfg)
    const p = await a.reads.claimable(OWNER, ref, ref.claimableAt + 10)
    expect(p).toMatchObject({ kind: 'pending', claimed: false, assets: 497_500n })
    expect(withdrawalPhase(p, ref.claimableAt + 10)).toBe('claimable')
  })

  it('after the epoch with a zero burnable, the request has been claimed', async () => {
    const a = makeVaultAdapter(fakeClient({ getBurnableAmountByReceiver: () => 0n }), upshiftCfg)
    const p = await a.reads.claimable(OWNER, ref, ref.claimableAt + 10)
    expect(withdrawalPhase(p, ref.claimableAt + 10)).toBe('claimed')
  })
})

describe('Firelight availability + claimable — no fabricated state (M7 honesty)', () => {
  const ref = { protocol: 'firelight', period: 333n, claimableAt: 1_000 } as const

  it('a FULL vault (zero headroom) is a cap, not a fabricated pause', async () => {
    const full = makeVaultAdapter(
      fakeClient({ maxDeposit: () => 1n << 255n, depositLimit: () => 15_000_000n, totalAssets: () => 15_000_000n }),
      firelightCfg,
    )
    const av = await full.reads.availability(OWNER)
    expect(av.depositPaused).toBe(false) // never a pause the chain did not signal
    expect(av.maxDeposit).toBe(0n) // flows through cap_exceeded instead
  })

  it('a zero recorded amount while NOT claimed is unknown, never a false success', async () => {
    const a = makeVaultAdapter(
      fakeClient({ currentPeriod: () => 334n, isWithdrawClaimed: () => false, withdrawalsOf: () => 0n }),
      firelightCfg,
    )
    const p = await a.reads.claimable(OWNER, ref, 0)
    expect(p).toMatchObject({ kind: 'pending', claimed: false, assets: null })
    expect(withdrawalPhase(p, ref.claimableAt + 10)).toBe('claimable') // still claimable, not "Withdrawn"
  })
})

describe('withdrawalPhase', () => {
  it('maps none/claimed/waiting/claimable', () => {
    expect(withdrawalPhase({ kind: 'none' }, 0)).toBe('none')
    const base = { kind: 'pending', claimableAt: 100, assets: 1n, ref: { protocol: 'firelight', period: 1n, claimableAt: 100 } } as const
    expect(withdrawalPhase({ ...base, claimed: true } as PendingWithdrawal, 200)).toBe('claimed')
    expect(withdrawalPhase({ ...base, claimed: false } as PendingWithdrawal, 50)).toBe('waiting')
    expect(withdrawalPhase({ ...base, claimed: false } as PendingWithdrawal, 100)).toBe('claimable')
  })

  it('firelightClaimRef records the UNLOCK period (P+1), not the request period', () => {
    // Live-verified 2026-08-12: a request in period 333 files the withdrawal under 334;
    // recording 333 strands the claim (withdrawalsOf(333)=0, claimWithdraw(333) reverts).
    const ref = firelightClaimRef(333n, 1_786_579_551)
    expect(ref).toEqual({ protocol: 'firelight', period: 334n, claimableAt: 1_786_579_551 })
    // and the reconcile phase then correctly holds at `waiting` until the unlock time
    const pending = { kind: 'pending', claimableAt: ref.claimableAt, assets: null, claimed: false, ref } as const
    expect(withdrawalPhase(pending as PendingWithdrawal, 1_786_500_000)).toBe('waiting')
    expect(withdrawalPhase(pending as PendingWithdrawal, 1_786_579_551)).toBe('claimable')
  })
})
