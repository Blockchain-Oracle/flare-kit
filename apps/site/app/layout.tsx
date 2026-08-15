import type { ReactNode } from 'react'
// The kit's contract first, then the page rules that consume it.
import '@flarekit-dev/react-ui/styles.css'
import './globals.css'
import './shell.css'
import './landing.css'
import { SiteFooter } from '../components/footer'
import { SiteNav } from '../components/nav'
import { ThemeScript } from './theme-script'

/**
 * The description every page and every social card carries, so it states the
 * identity rather than a slogan. "Ship Flare operations that recover." was
 * never approved as a motto — it was one specimen's hero line — and a motto
 * remains an open choice. See .thoughts/specs/2026-08-13-docs-site.md.
 */
export const metadata = {
  title: 'flare-kit',
  description:
    'The developer toolkit for Flare: one operation lifecycle across headless TypeScript, React hooks, embeddable widgets and agent tools.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeScript stamps data-theme on this element
    // before React hydrates, so the server markup will not match.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      {/* `.fk` opts this page into the kit's token contract: tokens, the three
          self-hosted faces, and every .fk-* primitive class. */}
      <body className="fk">
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
