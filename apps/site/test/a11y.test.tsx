import { render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from '../components/footer'
import { Hero } from '../components/landing/hero'
import { HeroDemo } from '../components/landing/hero-demo'
import { ThemeToggle } from '../components/theme-toggle'

/**
 * The nav is excluded here: it calls usePathname(), which needs the App Router
 * context that jsdom has no way to supply. It is covered in the browser pass
 * recorded in .thoughts/verification/2026-08-13-site-shell.md.
 */
const SURFACES: [string, ReactElement][] = [
  ['Hero', <Hero key="hero" />],
  ['HeroDemo', <HeroDemo key="demo" />],
  ['SiteFooter', <SiteFooter key="footer" />],
  ['ThemeToggle', <ThemeToggle key="toggle" />],
]

describe('landing accessibility', () => {
  it.each(SURFACES)('%s has no axe violations', async (_name, node) => {
    const { container } = render(node)
    const results = await axe.run(container)
    const summary = results.violations.map((v) => `${v.id}: ${v.description}`)
    expect(summary).toEqual([])
  })
})
