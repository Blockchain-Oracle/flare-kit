'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface SidebarLink {
  href: string
  label: string
}

export interface SidebarGroup {
  heading: string
  links: SidebarLink[]
}

/**
 * The docs sidebar, built from the fumadocs page tree on the server and passed
 * down as plain data — the tree's own node types are not serialisable across
 * the boundary, and the sidebar only needs headings and links.
 */
export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname()

  return (
    <nav className="docs-sidebar" aria-label="Documentation">
      {groups.map((group) => (
        <div key={group.heading} className="docs-sidebar-group">
          <p className="docs-sidebar-heading eyebrow">{group.heading}</p>
          <ul>
            {group.links.map((link) => {
              const current = pathname === link.href
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={current ? 'active' : undefined}
                    aria-current={current ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
