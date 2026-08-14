/**
 * The authored reading order — the ONE place page sequence lives.
 *
 * Prev/next used to sit in every page's frontmatter, so inserting a page meant
 * hand-editing its two neighbours, and renaming a page left a stale label
 * behind in someone else's file. Adding a page is now one line here, and
 * `test/reading-order.test.ts` fails if a page on disk is missing from this
 * list or listed twice.
 *
 * The sidebar sorts by position in this list, so the sidebar and the pager can
 * no longer disagree — they read the same array.
 */
export const READING_ORDER: readonly string[] = [
  // Getting started
  '/docs',
  '/docs/quickstart',
  '/docs/theming',
  '/docs/mock-mode',

  // Components
  '/docs/components/mint-fxrp',
  '/docs/components/operation-timeline',
  '/docs/components/redeem-fxrp',
  '/docs/components/recovery-panel',
  '/docs/components/account-sheet',
  '/docs/components/connect-modal',
  '/docs/components/network-resolution-sheet',
  '/docs/components/portfolio-table',
  '/docs/components/activity-table',
  '/docs/components/source-drawer',
  '/docs/components/pending-tray',
  '/docs/components/attestation-catalogue',
  '/docs/components/attestation-request-builder',
  '/docs/components/attestation-timeline',
  '/docs/components/proof-detail',
  '/docs/components/proof-handoff',
  '/docs/components/feed-catalogue',
  '/docs/components/feed-detail',
  '/docs/components/feed-history-table',
  '/docs/components/scaling-proof-detail',
  '/docs/components/secure-random-panel',
  '/docs/components/incentive-composer',
  '/docs/components/incentive-effect-panel',
  '/docs/components/custom-feed-review',
  '/docs/components/swap-card',
  '/docs/components/token-selector',
  '/docs/components/add-liquidity-card',
  '/docs/components/position-card',
  '/docs/components/pool-catalogue',
  '/docs/components/vault-catalogue',
  '/docs/components/deposit-card',
  '/docs/components/withdraw-card',
  '/docs/components/route-catalogue',
  '/docs/components/bridge-card',
  '/docs/components/gasless-card',
  '/docs/components/x402-card',
  '/docs/components/delegation-card',
  '/docs/components/claim-card',
  '/docs/components/stake-card',
  '/docs/components/primitives',

  // Hooks
  '/docs/hooks/flare-provider',
  '/docs/hooks/use-direct-mint',
  '/docs/hooks/use-operation',
  '/docs/hooks/use-redeem',
  '/docs/hooks/use-accounts',
  '/docs/hooks/use-portfolio',
  '/docs/hooks/use-activity',
  '/docs/hooks/use-observed-read',
  '/docs/hooks/use-attestation-families',
  '/docs/hooks/use-attestation',
  '/docs/hooks/use-anchor-proof',
  '/docs/hooks/use-feeds',
  '/docs/hooks/use-feed-history',
  '/docs/hooks/use-custom-feeds',
  '/docs/hooks/use-secure-random',
  '/docs/hooks/use-incentive-offer',
  '/docs/hooks/use-bridge',
  '/docs/hooks/use-gasless',
  '/docs/hooks/use-x402',
  '/docs/hooks/use-delegation',
  '/docs/hooks/use-rewards',
  '/docs/hooks/use-staking',
  '/docs/hooks/operation-store',

  // Headless
  '/docs/headless/lifecycle',
  '/docs/headless/states',
  '/docs/headless/adapters',
  '/docs/headless/storage',
  '/docs/headless/mock',

  // Contracts
  '/docs/contracts/networks',
  '/docs/contracts/verified-flags',

  // Agent Kit
  '/docs/agent-kit/tools',
  '/docs/agent-kit/mcp-server',
  '/docs/agent-kit/cli',
  '/docs/agent-kit/skills',
]

export interface DocLink {
  readonly href: string
  readonly label: string
}

/**
 * A page's adjacent pages, each labelled with that page's OWN title.
 *
 * `titles` maps url -> title, built from the page source. A url the map does
 * not know falls back to its href: a visible, clickable link beats a link
 * labelled `undefined`.
 */
export function neighbours(
  url: string,
  titles: ReadonlyMap<string, string>,
  order: readonly string[] = READING_ORDER,
): { prev?: DocLink; next?: DocLink } {
  const index = order.indexOf(url)
  if (index === -1) return {}

  const linkAt = (position: number): DocLink | undefined => {
    const href = order[position]
    return href === undefined ? undefined : { href, label: titles.get(href) ?? href }
  }

  const prev = index > 0 ? linkAt(index - 1) : undefined
  const next = linkAt(index + 1)
  return { ...(prev && { prev }), ...(next && { next }) }
}
