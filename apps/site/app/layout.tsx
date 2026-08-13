import type { ReactNode } from 'react'

export const metadata = {
  title: 'flare-kit',
  description: 'Ship Flare operations that recover.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
