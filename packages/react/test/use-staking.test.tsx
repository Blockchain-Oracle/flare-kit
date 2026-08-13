import {
  type PChainStakeExecutor,
  type StakeIntent,
  type StakeLimits,
  type StakeOperation,
  type StakePlan,
  type ValidatorInfo,
  type OperationStep,
  applyTransition,
  createOperation,
  planStake,
  stakingFor,
} from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type StakeEvmClient, useStaking } from '../src/use-staking.js'

type Hex0x = `0x${string}`

const DEPLOYMENT = stakingFor('coston2')!
const VERIFIED = { ...DEPLOYMENT, stakeVerified: true }
const ACCOUNT: Hex0x = '0x00000000000000000000000000000000000000C3'
const RPC_BASE = 'https://coston2-api.flare.network/ext/bc/P'

const NODE = 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ'
const PADDR = 'P-costwo17uuvatq6l6a2emzqjfrz6tqa6zzdy5g2s9v8md'
const START = 1_700_000_000n
const END = 1_702_592_000n // START + 30 days (well within the 14–365-day bounds)
const AMOUNT = 60_000n * 10n ** 18n // 60,000 FLR — inside [50k, 200M]

const INTENT: StakeIntent = { nodeId: NODE, amount: AMOUNT, startTime: START, endTime: END, rewardAddress: ACCOUNT }

// The live-read bounds (from PChainStakeMirrorVerifier) the fake client returns, expressed
// here as the wire values readStakeLimits maps: amounts are Gwei (×1e9 → wei), durations seconds.
const MIN_AMOUNT_GWEI = 50_000_000_000_000n // 50,000 FLR in Gwei
const MAX_AMOUNT_GWEI = 200_000_000_000_000_000n // 200,000,000 FLR in Gwei
const MIN_DURATION = 1_209_600n // 14 days
const MAX_DURATION = 31_536_000n // 365 days

const LIMITS: StakeLimits = {
  minAmount: MIN_AMOUNT_GWEI * 1_000_000_000n,
  maxAmount: MAX_AMOUNT_GWEI * 1_000_000_000n,
  minDuration: MIN_DURATION,
  maxDuration: MAX_DURATION,
}
const VALIDATORS: ValidatorInfo[] = [
  { nodeId: NODE, startTime: START, endTime: END + 1_000n, weight: 5_000_000n * 10n ** 18n },
]

/** AMOUNT (wei) expressed as the nFLR string weight a P-chain delegator record carries. */
const AMOUNT_NFLR = String(AMOUNT / 1_000_000_000n)

/** A `platform.getCurrentValidators` result. `delegators` optionally carries our stake. */
function validatorsResult(delegators: unknown[] = []) {
  return {
    validators: [
      {
        nodeID: NODE,
        startTime: String(START),
        endTime: String(END + 1_000n),
        weight: '5000000000000000',
        delegators: delegators.length ? delegators : null,
      },
    ],
  }
}

/** Our own delegator record — reward owner PADDR, matching the intent's node/window. */
function ourDelegator() {
  return {
    nodeID: NODE,
    startTime: String(START),
    endTime: String(END),
    weight: AMOUNT_NFLR,
    rewardOwner: { addresses: [PADDR] },
  }
}

/**
 * A stubbed `PublicClient` (viem) for the EVM reads, dispatching on `functionName`. Carries
 * `chain.id` so `submit` can stamp the operation's network honestly (never a hardcode).
 */
function fakeClient(): StakeEvmClient {
  return {
    chain: { id: 114 },
    async readContract({ functionName }: { functionName: string }) {
      switch (functionName) {
        case 'minStakeAmountGwei':
          return MIN_AMOUNT_GWEI
        case 'maxStakeAmountGwei':
          return MAX_AMOUNT_GWEI
        case 'minStakeDurationSeconds':
          return MIN_DURATION
        case 'maxStakeDurationSeconds':
          return MAX_DURATION
        case 'getStateOfRewards':
          return [0n, 0n] // genuine on-chain (0,0) → honest-empty, non-expiring
        case 'balanceOf':
          return 0n // mirrored vote power — a real observed zero
        default:
          throw new Error(`unexpected read ${functionName}`)
      }
    },
  } as unknown as StakeEvmClient
}

/** A stubbed P-chain `fetch` returning `getCurrentValidators`; or one that always throws.
 *  Mirrors pchain-rpc.test.ts's `{ ok, text() }` shape — `rpcCall` reads `.text()` then parses. */
function stubFetch(result: unknown) {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    async text() {
      return JSON.stringify({ jsonrpc: '2.0', id: 1, result })
    },
  }))
}
function stubFetchThrows() {
  vi.stubGlobal('fetch', async () => {
    throw new Error('lagged Coston2 P-chain RPC')
  })
}

function fakeExecutor(): PChainStakeExecutor {
  return {
    getPAddress: vi.fn().mockResolvedValue(PADDR),
    transferToP: vi.fn().mockResolvedValue({ txId: 'ptx' }),
    delegate: vi.fn().mockResolvedValue({ txId: 'dtx' }),
    transferToC: vi.fn().mockResolvedValue({ txId: 'ctx' }),
    claimStakingReward: vi.fn().mockResolvedValue({ txHash: '0xabc' }),
  }
}

/**
 * Build an op walked the FULL legal path (draft→quoting→ready→executing→submitted), attaching
 * the spine at the first legal hop — `applyTransition` silently DROPS a patch on an illegal
 * jump, so a straight-to-executing shortcut would strand the fixture at `draft` with no steps.
 */
function submittedWith(capability: string, id: string, steps: OperationStep[]): StakeOperation {
  const base = createOperation<StakeIntent, unknown, StakePlan>({ capability, network: 114, intent: INTENT, now: Number(START), id })
  const quoting = applyTransition(base, { to: 'quoting', at: Number(START), patch: { steps } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: Number(START) }).record
  const executing = applyTransition(ready, { to: 'executing', at: Number(START) }).record
  return applyTransition(executing, { to: 'submitted', at: Number(START) }).record as StakeOperation
}

function submittedStakeOp(): StakeOperation {
  return submittedWith('staking', 'stake1', [
    { id: 'export', type: 'transfer_to_p', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'delegate', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'record', type: 'await_stake', actor: 'flare', state: 'pending', attempts: 0 },
  ])
}

function submittedReturnOp(): StakeOperation {
  return submittedWith('staking-return', 'return1', [
    { id: 'return', type: 'transfer_to_c', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'record', type: 'await_return', actor: 'flare', state: 'pending', attempts: 0 },
  ])
}

afterEach(() => vi.unstubAllGlobals())

describe('useStaking — read/plan are keyless (no executor) (M11)', () => {
  it('reads the live limits + validators without an executor and plans off them', async () => {
    stubFetch(validatorsResult())
    const { result } = renderHook(() =>
      useStaking({ deployment: VERIFIED, account: ACCOUNT, publicClient: fakeClient(), rpcBase: RPC_BASE, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.limits).toBeDefined())
    await waitFor(() => expect(result.current.validators).toBeDefined())
    expect(result.current.limits?.minAmount).toBe(LIMITS.minAmount)
    // Keyless planning: a valid intent yields a real plan with its irreversible value-lock stated.
    const plan = result.current.buildPlan(INTENT)
    expect(plan?.ok).toBe(true)
    if (!plan?.ok) throw new Error('expected a plan')
    expect(plan.plan.valueLock.amount).toBe(AMOUNT)
    expect(plan.plan.valueLock.irreversible).toBe(true)
  })

  it('is undefined before the reads land, then honestly refuses an unverified deployment', async () => {
    stubFetch(validatorsResult())
    const { result } = renderHook(() =>
      useStaking({ deployment: DEPLOYMENT, account: ACCOUNT, publicClient: fakeClient(), rpcBase: RPC_BASE, pollMs: 5 }),
    )
    // Before any read has landed the builder is undefined — never plans off fabricated reads.
    expect(result.current.buildPlan(INTENT)).toBeUndefined()
    await waitFor(() => expect(result.current.validators).toBeDefined())
    // stakeVerified is false on the carried deployment → the verified gate refuses a signable plan.
    expect(result.current.buildPlan(INTENT)).toEqual({ ok: false, error: { code: 'unverified' } })
  })
})

describe('useStaking — signing requires the injected executor (M11)', () => {
  it('submit returns undefined with no executor — the hook never signs on its own', async () => {
    stubFetch(validatorsResult())
    const { result } = renderHook(() =>
      useStaking({ deployment: VERIFIED, account: ACCOUNT, publicClient: fakeClient(), rpcBase: RPC_BASE, pollMs: 5 }),
    )
    const built = planStake({ intent: INTENT, deployment: VERIFIED, limits: LIMITS, validators: VALIDATORS })
    if (!built.ok) throw new Error('fixture plan should be ok')
    expect(await result.current.submit(built.plan)).toBeUndefined()
  })

  it('with an executor, submit signs the two P-chain legs and adopts a SUBMITTED op — never succeeded', async () => {
    stubFetch(validatorsResult())
    const executor = fakeExecutor()
    const { result } = renderHook(() =>
      useStaking({ deployment: VERIFIED, account: ACCOUNT, executor, publicClient: fakeClient(), rpcBase: RPC_BASE, pollMs: 5 }),
    )
    const built = planStake({ intent: INTENT, deployment: VERIFIED, limits: LIMITS, validators: VALIDATORS })
    if (!built.ok) throw new Error('fixture plan should be ok')
    const op = await result.current.submit(built.plan)
    expect(op?.state).toBe('submitted')
    expect(op?.state).not.toBe('succeeded')
    expect(executor.transferToP).toHaveBeenCalledWith(AMOUNT)
    expect(executor.delegate).toHaveBeenCalledWith(INTENT)
  })
})

describe('useStaking — the durable stake poll: succeeded ONLY from the read-back position (M11)', () => {
  it('advances a submitted stake to succeeded once readStakesOf reflects the matching position', async () => {
    stubFetch(validatorsResult([ourDelegator()]))
    const { result } = renderHook(() =>
      useStaking({
        deployment: VERIFIED,
        account: ACCOUNT,
        executor: fakeExecutor(),
        publicClient: fakeClient(),
        rpcBase: RPC_BASE,
        operation: submittedStakeOp(),
        pollMs: 5,
      }),
    )
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
    // The position surfaced to the panel is the real observed one, never a fabricated zero.
    expect(result.current.position.status).toBe('observed')
  })

  it('a submitted stake with no on-chain position stays awaiting_external(flare) — never succeeded', async () => {
    stubFetch(validatorsResult()) // nobody's delegator → readStakesOf returns []
    const { result } = renderHook(() =>
      useStaking({
        deployment: VERIFIED,
        account: ACCOUNT,
        executor: fakeExecutor(),
        publicClient: fakeClient(),
        rpcBase: RPC_BASE,
        operation: submittedStakeOp(),
        pollMs: 5,
      }),
    )
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))
    expect(result.current.operation?.awaiting?.actor).toBe('flare')
    expect(result.current.operation?.state).not.toBe('succeeded')
  })
})

describe('useStaking — the delayed P→C return leg (M11)', () => {
  it('surfaces action_required once the ≥14-day lock clock has elapsed and the stake is still present', async () => {
    // END is in the past relative to the wall clock → the lock has matured; the user must sign.
    stubFetch(validatorsResult([ourDelegator()]))
    const { result } = renderHook(() =>
      useStaking({
        deployment: VERIFIED,
        account: ACCOUNT,
        executor: fakeExecutor(),
        publicClient: fakeClient(),
        rpcBase: RPC_BASE,
        operation: submittedReturnOp(),
        pollMs: 5,
      }),
    )
    await waitFor(() => expect(result.current.operation?.state).toBe('action_required'))
    expect(result.current.operation?.awaiting?.actor).toBe('you')
    expect(result.current.operation?.recovery?.some((r) => r.id === 'return-stake')).toBe(true)
  })

  it('a THROWN return-leg read maps to `unavailable` — it does NOT fabricate succeeded (I2)', async () => {
    // The load-bearing honesty: a transport fault on readStakesOf is do-not-reconcile, never a
    // confirmed-absent "the stake left the P-chain". The return op must not jump to succeeded.
    stubFetchThrows()
    const { result } = renderHook(() =>
      useStaking({
        deployment: VERIFIED,
        account: ACCOUNT,
        executor: fakeExecutor(),
        publicClient: fakeClient(),
        rpcBase: RPC_BASE,
        operation: submittedReturnOp(),
        pollMs: 5,
      }),
    )
    // The thrown read is recorded as a failed READING…
    await waitFor(() => expect(result.current.error).toBeDefined())
    // …and the operation is left exactly where it was — never succeeded on silence.
    expect(result.current.operation?.state).not.toBe('succeeded')
    expect(result.current.operation?.state).toBe('submitted')
  })
})
