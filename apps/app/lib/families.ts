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
}

const built = (id: string, label: string): Family => ({ id, label, status: { kind: 'built' } })

export const FAMILIES: readonly Family[] = [
  built('swap', 'Swap'),
  built('mint', 'Mint & redeem'),
  built('pool', 'Pools'),
  built('vaults', 'Vaults'),
  built('bridge', 'Bridge'),
  built('stake', 'Stake'),
  built('delegate', 'Delegate'),
  built('rewards', 'Rewards'),
  built('governance', 'Governance'),
  built('feeds', 'Feeds'),
  built('attestations', 'Attestations'),
  built('payments', 'Payments'),
  built('portfolio', 'Portfolio'),
  {
    id: 'chat',
    label: 'Chat',
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
    status: {
      kind: 'unbuilt',
      milestone: 'FCC — Flare Confidential Compute',
      will: 'Run and verify a confidential computation, and show what its attestation proves.',
    },
  },
  {
    id: 'operator',
    label: 'Operator release',
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
