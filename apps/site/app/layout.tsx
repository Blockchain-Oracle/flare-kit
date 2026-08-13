import type { ReactNode } from 'react'
// The kit's contract first, then the page rules that consume it.
import '@flare-kit/react-ui/styles.css'
import './globals.css'

export const metadata = {
  title: 'flare-kit',
  description: 'Ship Flare operations that recover.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* `.fk` opts this page into the kit's token contract: tokens, the three
          self-hosted faces, and every .fk-* primitive class. */}
      <body className="fk">{children}</body>
    </html>
  )
}
