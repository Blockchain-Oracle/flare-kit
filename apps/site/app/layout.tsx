import type { ReactNode } from 'react'
// The kit's contract first, then the page rules that consume it.
import '@flare-kit/react-ui/styles.css'
import './globals.css'
import './shell.css'
import { SiteFooter } from '../components/footer'
import { SiteNav } from '../components/nav'
import { ThemeScript } from './theme-script'

export const metadata = {
  title: 'flare-kit',
  description: 'Ship Flare operations that recover.',
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
