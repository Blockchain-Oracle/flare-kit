import { BUILT_IN_INSTRUCTIONS, smartAccountsFor } from '@flare-kit/contracts'
import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { readDeploymentSettings, readTransactionIdUsed } from '../src/smart-accounts/adapter.js'
import {
  buildInstructionCatalogue,
  composableInstructions,
  instructionRow,
} from '../src/smart-accounts/catalogue.js'
import { readPersonalAccount } from '../src/smart-accounts/personal-account.js'

/**
 * The adapter and the catalogue, driven over a fake client.
 *
 * The values are the ones the M13 Task-1 probe read live on Coston2
 * (`.thoughts/verification/2026-08-13-m13-probe.json`), so a test that passes here is
 * describing the real deployment rather than a convenient fiction.
 */

const DEPLOYMENT = smartAccountsFor('coston2')
const PERSONAL_ACCOUNT = '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb'
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const FTEST_XRP = '0x0b6A3645c240605887a5532109323A3E12273dc7'
const SOURCE_ID_TEST_XRP =
  '0x7465737458525000000000000000000000000000000000000000000000000000'

/** The probe's live Coston2 answers, keyed by function name. */
const LIVE: Record<string, unknown> = {
  getXrplProviderWallets: ['rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq'],
  getSourceId: SOURCE_ID_TEST_XRP,
  getPaymentProofValidityDurationSeconds: 86_400n,
  getDefaultInstructionFee: 1000n,
  getInstructionFee: 1000n,
  getVaults: [
    [4n, 2n, 3n, 1n],
    [
      '0xD91324A6e8884147F6425E9ddd60e11Aea060B5b',
      '0x9E63a5D282F2fBb7DcE822B98e363b2719D28319',
      '0x4066A1363a04ce3B23eEcB53dEfa65f94A24355E',
      '0xC90D6847747b85d1fa2E07859869fb9fB72c0361',
    ],
    [2, 2, 2, 1],
  ],
  getAgentVaults: [[1n], ['0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC']],
  getExecutorInfo: ['0x103b384064ae85577127097A7cCadfd6fb13f437', 100_000_000_000n],
  getPersonalAccount: PERSONAL_ACCOUNT,
  getNonce: 0n,
  getExecutor: '0x0000000000000000000000000000000000000000',
  isTransactionIdUsed: false,
  isPaused: false,
  balanceOf: 0n,
}

interface FakeOptions {
  /** Function names that should throw, as an unreachable RPC would. */
  readonly failing?: readonly string[]
  /** `undefined` = no code at the address (viem's own answer for an undeployed account). */
  readonly code?: `0x${string}` | undefined
  readonly codeThrows?: boolean
}

function fakeClient(options: FakeOptions = {}): PublicClient {
  const failing = new Set(options.failing ?? [])
  return {
    async readContract({ functionName }: { functionName: string }) {
      if (failing.has(functionName)) throw new Error(`RPC refused ${functionName}`)
      if (!(functionName in LIVE)) throw new Error(`unstubbed ${functionName}`)
      return LIVE[functionName]
    },
    async getCode() {
      if (options.codeThrows) throw new Error('RPC refused getCode')
      return options.code
    },
    async getBalance() {
      if (failing.has('getBalance')) throw new Error('RPC refused getBalance')
      return 0n
    },
  } as unknown as PublicClient
}

describe('the deployment settings are read fresh, never assumed', () => {
  it('reads every operator-mutable setting the live deployment carries', async () => {
    const settings = await readDeploymentSettings(fakeClient(), DEPLOYMENT)
    expect(settings).toBeDefined()
    expect(settings?.xrplProviderWallets).toEqual(['rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq'])
    expect(settings?.sourceId).toBe('testXRP')
    expect(settings?.proofValidityDurationSeconds).toBe(86_400n)
    expect(settings?.defaultInstructionFee).toBe(1000n)
    expect(settings?.vaults).toHaveLength(4)
    // Vault id 1 is the only Firelight one on this deployment — the type nibble matters.
    expect(settings?.vaults?.find((v) => v.vaultId === 1)?.vaultType).toBe('firelight')
    expect(settings?.vaults?.filter((v) => v.vaultType === 'upshift')).toHaveLength(3)
    expect(settings?.agentVaults).toEqual([
      { agentVaultId: 1, address: '0x55c815260cBE6c45Fe5bFe5FF32E3C7D746f14dC' },
    ])
  })

  it.each([
    'getXrplProviderWallets',
    'getSourceId',
    'getPaymentProofValidityDurationSeconds',
    'getDefaultInstructionFee',
    // An unreadable pause state cannot be assumed false — doing so lets the plan sign a
    // payment into a paused controller. Found by the M13 review gate.
    'isPaused',
  ])('returns undefined when the essential read %s fails', async (functionName) => {
    // No plan can honestly be built without these, so a partial settings object would only
    // give a composer enough rope to ask for a signature it cannot justify.
    expect(await readDeploymentSettings(fakeClient({ failing: [functionName] }), DEPLOYMENT)).toBeUndefined()
  })

  it('keeps a transfer plannable when only the vault registry is unreadable', async () => {
    const settings = await readDeploymentSettings(
      fakeClient({ failing: ['getVaults', 'getAgentVaults', 'getExecutorInfo'] }),
      DEPLOYMENT,
    )
    expect(settings).toBeDefined()
    // undefined, NOT [] — an empty list would claim the deployment registers no vaults.
    expect(settings?.vaults).toBeUndefined()
    expect(settings?.agentVaults).toBeUndefined()
    expect(settings?.defaultExecutor).toBeUndefined()
  })
})

describe('the personal account', () => {
  it('reads the blank-slate account the probe found, with deployed strictly false', async () => {
    const account = await readPersonalAccount(fakeClient(), DEPLOYMENT, XRPL_OWNER, FTEST_XRP)
    expect(account?.address).toBe(PERSONAL_ACCOUNT)
    expect(account?.deployed).toBe(false)
    expect(account?.nonce).toBe(0n)
    expect(account?.pinnedExecutor).toBe('0x0000000000000000000000000000000000000000')
  })

  it('treats an empty-code answer as not deployed', async () => {
    // viem can answer either `undefined` or `'0x'` for an address with no code. Dropping
    // the `'0x'` check renders an undeployed account as deployed.
    const account = await readPersonalAccount(
      fakeClient({ code: '0x' }),
      DEPLOYMENT,
      XRPL_OWNER,
      FTEST_XRP,
    )
    expect(account?.deployed).toBe(false)
  })

  it('reports deployed for an account that has code', async () => {
    const account = await readPersonalAccount(
      fakeClient({ code: '0x6080' }),
      DEPLOYMENT,
      XRPL_OWNER,
      FTEST_XRP,
    )
    expect(account?.deployed).toBe(true)
  })

  it('never renders a FAILED code read as "not deployed"', async () => {
    // viem answers `undefined` for an address with no code — the same value a thrown read
    // would produce through a naive wrapper. "We could not look" is a third answer.
    const account = await readPersonalAccount(
      fakeClient({ codeThrows: true }),
      DEPLOYMENT,
      XRPL_OWNER,
      FTEST_XRP,
    )
    expect(account?.deployed).toBeUndefined()
    expect(account?.address).toBe(PERSONAL_ACCOUNT)
  })

  it('never renders an unread balance or nonce as zero', async () => {
    const account = await readPersonalAccount(
      fakeClient({ failing: ['getNonce', 'balanceOf', 'getBalance'] }),
      DEPLOYMENT,
      XRPL_OWNER,
      FTEST_XRP,
    )
    expect(account?.nonce).toBeUndefined()
    expect(account?.fassetBalance).toBeUndefined()
    expect(account?.nativeBalance).toBeUndefined()
  })

  it('is undefined only when the address itself cannot be derived', async () => {
    expect(
      await readPersonalAccount(
        fakeClient({ failing: ['getPersonalAccount'] }),
        DEPLOYMENT,
        XRPL_OWNER,
      ),
    ).toBeUndefined()
  })

  it('never answers "this payment is unused" from a failed replay read', async () => {
    expect(await readTransactionIdUsed(fakeClient(), DEPLOYMENT, `0x${'11'.repeat(32)}`)).toBe(false)
    expect(
      await readTransactionIdUsed(
        fakeClient({ failing: ['isTransactionIdUsed'] }),
        DEPLOYMENT,
        `0x${'11'.repeat(32)}`,
      ),
    ).toBeUndefined()
  })
})

describe('the catalogue is discovered from deployment state', () => {
  it('marks the three legacy collateral-reservation commands superseded', async () => {
    const settings = await readDeploymentSettings(fakeClient(), DEPLOYMENT)
    const catalogue = buildInstructionCatalogue(settings)
    for (const id of [0x00, 0x10, 0x20]) {
      expect(instructionRow(catalogue, id)?.availability.kind, `0x${id.toString(16)}`).toBe(
        'superseded',
      )
    }
    expect(composableInstructions(catalogue).map((r) => r.instruction.id)).not.toContain(0x00)
  })

  it('offers the instructions this deployment can actually serve', async () => {
    const settings = await readDeploymentSettings(fakeClient(), DEPLOYMENT)
    const catalogue = buildInstructionCatalogue(settings)
    // Coston2 registers one Firelight vault and three Upshift ones, so every non-legacy
    // instruction is serveable and each names the ids it may target.
    const composable = composableInstructions(catalogue)
      .map((r) => r.instruction.id)
      .sort((a, b) => a - b)
    expect(composable).toEqual([
      0x01, 0x02, 0x11, 0x12, 0x13, 0x21, 0x22, 0x23,
    ])
    expect(instructionRow(catalogue, 0x11)?.eligibleVaultIds).toEqual([1])
    expect(instructionRow(catalogue, 0x21)?.eligibleVaultIds).toEqual([4, 2, 3])
    // A transfer targets no vault at all.
    expect(instructionRow(catalogue, 0x01)?.eligibleVaultIds).toBeUndefined()
    expect(instructionRow(catalogue, 0x01)?.feeDrops).toBe(1000n)
  })

  it('says UNKNOWN, not unavailable, when the vault registry could not be read', async () => {
    // The difference is the whole point: `unavailable` claims the deployment registers no
    // such vault. Here we simply could not look.
    const settings = await readDeploymentSettings(fakeClient({ failing: ['getVaults'] }), DEPLOYMENT)
    const catalogue = buildInstructionCatalogue(settings)
    expect(instructionRow(catalogue, 0x11)?.availability.kind).toBe('unknown')
    // A transfer needs no vault, so it stays composable.
    expect(instructionRow(catalogue, 0x01)?.availability.kind).toBe('available')
  })

  it('says UNAVAILABLE with a reason when the deployment registers no vault of the type', async () => {
    const noFirelight: Record<string, unknown> = {
      ...LIVE,
      getVaults: [[2n], ['0x9E63a5D282F2fBb7DcE822B98e363b2719D28319'], [2]],
    }
    const client = {
      async readContract({ functionName }: { functionName: string }) {
        return noFirelight[functionName]
      },
      async getCode() {
        return undefined
      },
      async getBalance() {
        return 0n
      },
    } as unknown as PublicClient

    const catalogue = buildInstructionCatalogue(await readDeploymentSettings(client, DEPLOYMENT))
    const firelightDeposit = instructionRow(catalogue, 0x11)
    expect(firelightDeposit?.availability.kind).toBe('unavailable')
    expect(
      firelightDeposit?.availability.kind === 'unavailable' && firelightDeposit.availability.reason,
    ).toMatch(/no firelight vault/)
    expect(instructionRow(catalogue, 0x21)?.availability.kind).toBe('available')
  })

  it('never substitutes the default fee for an unread per-instruction fee', async () => {
    // Found by the M13 review gate. The default and the per-id fee are DIFFERENT numbers on
    // a live deployment: the 2026-08-13 probe read Flare mainnet's default at 500000 drops
    // while ids 0x00/0x02/0x10/0x20 charge 950000. Quoting the default for an unread
    // fee would have a user sign a payment 450000 drops short, the controller would refuse
    // the proof forever, and the XRP would already be at the operator.
    const settings = await readDeploymentSettings(
      fakeClient({ failing: ['getInstructionFee'] }),
      DEPLOYMENT,
    )
    expect(settings).toBeDefined()
    expect(settings?.defaultInstructionFee).toBe(1000n)
    for (const instruction of BUILT_IN_INSTRUCTIONS) {
      expect(settings?.instructionFees[instruction.id], `0x${instruction.id.toString(16)}`).toBeUndefined()
    }
    const catalogue = buildInstructionCatalogue(settings)
    expect(instructionRow(catalogue, 0x01)?.feeDrops).toBeUndefined()
  })

  it('lists the whole vocabulary as unknown when the deployment cannot be read at all', () => {
    // Hiding the rows would imply the protocol has no such instruction, rather than that
    // we could not look.
    const catalogue = buildInstructionCatalogue(undefined)
    expect(catalogue).toHaveLength(11)
    expect(catalogue.every((row) => row.availability.kind === 'unknown')).toBe(true)
    expect(composableInstructions(catalogue)).toHaveLength(0)
    // And the fee column is unread, not zero — a renderer must not print "0 drops".
    expect(catalogue.every((row) => row.feeDrops === undefined)).toBe(true)
  })
})
