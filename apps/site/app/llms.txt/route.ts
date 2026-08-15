import { source } from '../../lib/source'

// The page tree only changes at build time.
export const revalidate = false

const SITE = 'https://flare-kit.xyz'

/**
 * An index of every documentation page, for agents that crawl a site to work
 * out its surface area before reading any of it. Mirrors the sidebar.
 */
export function GET() {
  const lines = [
    '# flare-kit',
    '',
    '> The developer toolkit for Flare: one operation lifecycle across headless',
    '> TypeScript, React hooks, embeddable widgets and agent tools. Community-built,',
    '> not an official Flare Networks product.',
    '',
    '## Documentation',
    '',
  ]

  for (const page of source.getPages()) {
    const data = page.data as unknown as { title?: string; description?: string }
    const title = data.title ?? page.url
    const description = data.description ? `: ${data.description}` : ''
    lines.push(`- [${title}](${SITE}${page.url})${description}`)
  }

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
