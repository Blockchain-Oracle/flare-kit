/**
 * The one source of navigation truth: the rail, the routes and the reserved
 * seams all read this. Two lists would drift, and the drift would be a route
 * that navigates nowhere or a seam that quietly disappears.
 */
export type FamilyStatus =
  | { readonly kind: 'built' }
  /** Named, reachable, and honest. `will` states the capability; `milestone` says who owns it. */
  | { readonly kind: 'unbuilt'; readonly milestone: string; readonly will: string }

export interface Family {
  readonly id: string
  readonly label: string
  readonly status: FamilyStatus
  /**
   * The `@flarekit-dev/react-ui` components this family renders.
   *
   * Declared, not inferred, because `test/surface-coverage.test.ts` checks it
   * against the kit's own directory. A component with no family fails the
   * build, so a capability cannot be forgotten the way smart accounts and
   * activity were — both were shipped, live-verified, and simply absent from
   * this list.
   */
  readonly surfaces: readonly string[]
}

/**
 * Surfaces that belong to the shell rather than to any one capability: the
 * connect flow, the account sheet, the network-mismatch resolver, the
 * non-blocking operations tray, the shared operation spine, and the provenance
 * drawer. Being chrome is a decision recorded here, not a default for anything
 * that failed to find a family.
 */
export const CHROME_SURFACES: readonly string[] = [
  'ConnectModal',
  'AccountSheet',
  'NetworkResolutionSheet',
  'PendingTray',
  'OperationTimeline',
  'SourceDrawer',
]

const built = (id: string, label: string, surfaces: readonly string[]): Family => ({
  id,
  label,
  status: { kind: 'built' },
  surfaces,
})

export const FAMILIES: readonly Family[] = [
  built('swap', 'Swap', ['SwapCard', 'SwapLeg', 'TokenSelector']),
  built('mint', 'Mint & redeem', ['MintFXRP', 'RedeemFXRP', 'RecoveryPanel']),
  built('pool', 'Pools', ['PoolCatalogue', 'AddLiquidityCard', 'PositionCard']),
  built('vaults', 'Vaults', ['VaultCatalogue', 'DepositCard', 'WithdrawCard']),
  built('bridge', 'Bridge', ['RouteCatalogue', 'BridgeCard']),
  built('stake', 'Stake', ['StakeCard']),
  built('delegate', 'Delegate', ['DelegationCard']),
  built('rewards', 'Rewards', ['ClaimCard']),
  built('governance', 'Governance', ['GovernanceCard', 'ProposalCatalogue', 'ProposalDetail']),
  // M13, live-verified on Coston2 and absent from this list until the surface
  // audit found it. Its components arrive when this branch merges `main`.
  built('smart-accounts', 'Smart accounts', [
    'SmartAccountCard',
    'SmartAccountNetwork',
    'InstructionCatalogue',
    'InstructionComposer',
    'InstructionChain',
    // M14, the direct-minting memo flow. Same family: a memo instruction and a
    // proof instruction are two ways to drive one personal account, not two
    // capabilities. RecoveryComposer belongs here too — the recovery opcodes
    // act on the account, not on some separate recovery surface.
    'MemoInstructionComposer',
    'MemoChain',
    'RecoveryComposer',
  ]),
  built('feeds', 'Feeds', [
    'FeedCatalogue',
    'FeedCatalogueRow',
    'FeedDetail',
    'FeedHistoryTable',
    'CustomFeedReview',
    'SecureRandomPanel',
    'IncentiveComposer',
    'IncentiveEffectPanel',
  ]),
  built('attestations', 'Attestations', [
    'AttestationCatalogue',
    'AttestationRequestBuilder',
    'AttestationTimeline',
    'ProofDetail',
    'ProofHandoff',
    'ProofResponseFields',
    'ScalingProofDetail',
  ]),
  built('payments', 'Payments', ['GaslessCard', 'X402Card']),
  built('portfolio', 'Portfolio', ['PortfolioTable']),
  // Its own family, not a portfolio tab: activity is the durable record of every
  // operation, and M2 built it as a first-class capability.
  built('activity', 'Activity', ['ActivityTable']),
  {
    id: 'chat',
    label: 'Chat',
    /** Nothing yet: an unbuilt family renders no kit surface. */
    surfaces: [],
    status: {
      kind: 'unbuilt',
      milestone: 'M14 — agent tools, MCP server and CLI',
      will:
        'Compose any of these operations from a conversation, rendering the same components ' +
        'this app renders. It will never sign: your wallet does.',
    },
  },
  {
    id: 'confidential',
    label: 'Confidential compute',
    /** Nothing yet: an unbuilt family renders no kit surface. */
    surfaces: [],
    status: {
      kind: 'unbuilt',
      milestone: 'FCC — Flare Confidential Compute',
      will: 'Run and verify a confidential computation, and show what its attestation proves.',
    },
  },
  {
    id: 'operator',
    label: 'Operator release',
    /** Nothing yet: an unbuilt family renders no kit surface. */
    surfaces: [],
    status: {
      kind: 'unbuilt',
      milestone: 'Operator support — release and claim',
      will: 'Release and claim on behalf of an operator, with the same evidence trail.',
    },
  },
]

export function familyById(id: string): Family | undefined {
  return FAMILIES.find((family) => family.id === id)
}

/** Abu chose the sidebar mockup with Swap active; the app opens where he saw it open. */
export const LANDING_FAMILY_ID = 'swap'
