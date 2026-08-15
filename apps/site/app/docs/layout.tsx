import type { ReactNode } from 'react'
import { DocsSidebar, type SidebarGroup } from '../../components/docs/sidebar'
import { READING_ORDER } from '../../lib/reading-order'
import { source } from '../../lib/source'
import './docs.css'

/**
 * Section order is authored, not alphabetical. Anything unlisted lands last.
 * Order and labels are fixed by docs-site R2: Getting started, Components,
 * Hooks, Headless, Contracts, Agent Kit. A section only appears once it has a
 * page, so listing Headless/Agent Kit here before their pages exist is harmless.
 */
const SECTION_ORDER = ['', 'components', 'hooks', 'headless', 'contracts', 'agent-kit']

const SECTION_LABELS: Record<string, string> = {
  '': 'Getting started',
  components: 'Components',
  hooks: 'Hooks',
  headless: 'Headless',
  contracts: 'Contracts',
  'agent-kit': 'Agent Kit',
}

interface PageData {
  title?: string
}

/**
 * Position within a section comes from the authored reading order, so the
 * sidebar lists pages in the same sequence a reader pages through them. A page
 * missing from the order sorts last — `test/reading-order.test.ts` makes that
 * a build-time failure rather than a silent one.
 */
function buildGroups(): SidebarGroup[] {
  const pages = source.getPages()
  const positionOf = (url: string) => {
    const index = READING_ORDER.indexOf(url)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  const bySection = new Map<string, { href: string; label: string }[]>()

  for (const page of pages) {
    const rest = page.url.replace(/^\/docs\/?/, '')
    const section = rest.includes('/') ? rest.split('/')[0]! : ''
    const data = page.data as unknown as PageData
    const links = bySection.get(section) ?? []
    links.push({ href: page.url, label: data.title ?? page.url })
    bySection.set(section, links)
  }

  const rank = (section: string) => {
    const index = SECTION_ORDER.indexOf(section)
    return index === -1 ? SECTION_ORDER.length : index
  }

  return [...bySection.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([section, links]) => ({
      heading: SECTION_LABELS[section] ?? section,
      links: [...links].sort((a, b) => positionOf(a.href) - positionOf(b.href)),
    }))
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <DocsSidebar groups={buildGroups()} />
      {children}
    </div>
  )
}
