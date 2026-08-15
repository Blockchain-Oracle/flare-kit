'use client'

import { BrandLockup } from '@flarekit-dev/react-ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GithubIcon, NpmIcon } from './icons'
import { NavSearch } from './nav-search'
import { ThemeToggle } from './theme-toggle'

const GITHUB = 'https://github.com/Blockchain-Oracle/flare-kit'
const NPM = 'https://www.npmjs.com/org/flare-kit'

/** Plan 2 gives these real targets once the docs routes exist. */
const LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs', label: 'Components' },
  { href: '/docs', label: 'Hooks' },
  { href: '/docs', label: 'Agent Kit' },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation, or the drawer stays open behind the new page.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Lock the page behind the drawer while it is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="flare-kit home">
          <BrandLockup />
        </Link>

        <nav className="nav-links" aria-label="Main">
          {LINKS.map((link) => (
            <Link key={link.label} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="nav-right">
          <NavSearch />
          <a
            className="nav-icon"
            href={NPM}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="flare-kit on npm"
            title="npm"
          >
            <NpmIcon />
          </a>
          <a
            className="nav-icon"
            href={GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="flare-kit on GitHub"
            title="GitHub"
          >
            <GithubIcon />
          </a>
          <ThemeToggle />
          <Link className="fk-btn fk-btn-primary fk-btn-sm nav-cta" href="/docs">
            Get started
          </Link>
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="nav-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            <span className={open ? 'burger open' : 'burger'} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </div>

      <div
        id="nav-drawer"
        className={open ? 'nav-drawer open' : 'nav-drawer'}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        hidden={!open}
      >
        <nav className="nav-drawer-links" aria-label="Main">
          {LINKS.map((link) => (
            <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="nav-drawer-foot">
          <a href={NPM} target="_blank" rel="noopener noreferrer">
            <NpmIcon /> <span>npm</span>
          </a>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer">
            <GithubIcon /> <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  )
}
