import Link from 'next/link'
import { BrandLockup } from './brand-mark'

const GITHUB = 'https://github.com/Blockchain-Oracle/flare-kit'
const NPM = 'https://www.npmjs.com/org/flare-kit'

const COLUMNS: {
  heading: string
  links: { href: string; label: string; external?: boolean }[]
}[] = [
  {
    heading: 'Docs',
    links: [
      { href: '/docs', label: 'Quickstart' },
      { href: '/docs', label: 'Components' },
      { href: '/docs', label: 'Hooks' },
      { href: '/docs', label: 'Contracts' },
    ],
  },
  {
    heading: 'Agent kit',
    links: [
      { href: '/docs', label: 'Agent tools' },
      { href: '/docs', label: 'MCP server' },
      { href: '/docs', label: 'CLI' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { href: GITHUB, label: 'GitHub', external: true },
      { href: NPM, label: 'npm org', external: true },
      { href: 'https://flare.network', label: 'Flare Networks', external: true },
      { href: 'https://dev.flare.network', label: 'Flare developer hub', external: true },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link className="brand" href="/" aria-label="flare-kit home">
              <BrandLockup />
            </Link>
            <p className="muted footer-blurb">
              The developer toolkit for Flare: one operation lifecycle across headless TypeScript,
              React hooks, embeddable widgets and agent tools. MIT licensed.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              {/* h3, not h4: the page outline runs h1 (hero) → h2 (section) →
                  here, and skipping a level is a heading-order violation. */}
              <h3>{column.heading}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.label}`}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Required by the naming decision on every published surface. */}
        <div className="footer-bottom mono">
          <span>Community-built. Not an official Flare Networks product.</span>
          <span>MIT</span>
        </div>
      </div>
    </footer>
  )
}
