import type { ReactNode } from 'react'
import '@flarekit-dev/react-ui/styles.css'
import './globals.css'

export const metadata = {
  title: 'flare-kit',
  description:
    'The developer toolkit for Flare: one operation lifecycle across headless TypeScript, React hooks, embeddable widgets and agent tools.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="fk">{children}</body>
    </html>
  )
}
