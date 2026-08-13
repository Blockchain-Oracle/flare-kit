import type { ReactNode } from 'react'
import { DocsSidebar, type SidebarGroup } from '../../components/docs/sidebar'
import { source } from '../../lib/source'
import './docs.css'

/** Section order is authored, not alphabetical. Anything unlisted lands last. */
const SECTION_ORDER = ['', 'components', 'hooks', 'agent-kit', 'contracts']

const SECTION_LABELS: Record<string, string> = {
  '': 'Getting started',
  components: 'Components',
  hooks: 'Hooks',
  'agent-kit': 'Agent Kit',
  contracts: 'Contracts',
}

function buildGroups(): SidebarGroup[] {
  const bySection = new Map<string, { href: string; label: string }[]>()

  for (const page of source.getPages()) {
    const rest = page.url.replace(/^\/docs\/?/, '')
    const section = rest.includes('/') ? rest.split('/')[0]! : ''
    const data = page.data as unknown as { title?: string }
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
      links,
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
