'use client'

import { useEffect, useState } from 'react'

export interface TocItem {
  id: string
  label: string
}

/** Right rail, with scrollspy over the headings the page exposes. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? '')

  useEffect(() => {
    if (items.length === 0 || typeof IntersectionObserver === 'undefined') return
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node))
    if (targets.length === 0) return

    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.id) setActive(entry.target.id)
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    )
    for (const target of targets) spy.observe(target)
    return () => spy.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <nav className="toc" aria-label="On this page">
      <p className="toc-head eyebrow">On this page</p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={active === item.id ? 'active' : undefined}
          aria-current={active === item.id ? 'location' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
