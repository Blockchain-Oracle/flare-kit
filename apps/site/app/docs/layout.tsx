import type { ReactNode } from 'react'
import { DocsSidebar, type SidebarGroup } from '../../components/docs/sidebar'
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
  next?: { href: string }
}

/**
 * Authored reading order within a section, not alphabetical: walk the
 * frontmatter `next` chain from the docs root and record each page's position.
 * A page off the chain sorts last, keeping the sidebar in the same order a
 * reader would page through.
 */
function readingOrder(pages: ReturnType<typeof source.getPages>): Map<string, number> {
  const byUrl = new Map(pages.map((page) => [page.url, page]))
  const order = new Map<string, number>()
  let cursor = byUrl.get('/docs')
  let index = 0
  while (cursor && !order.has(cursor.url)) {
    order.set(cursor.url, index)
    index += 1
    const next = (cursor.data as unknown as PageData).next?.href
    cursor = next ? byUrl.get(next) : undefined
  }
  return order
}

function buildGroups(): SidebarGroup[] {
  const pages = source.getPages()
  const order = readingOrder(pages)
  const positionOf = (url: string) => order.get(url) ?? Number.MAX_SAFE_INTEGER
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
