import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { source } from '../../lib/source'

export const revalidate = false

const SITE = 'https://flare-kit.xyz'

/**
 * Every documentation page's source, concatenated, so an agent can read the
 * whole surface in one request instead of crawling it page by page.
 *
 * Frontmatter is stripped: it is routing and layout metadata, not documentation,
 * and leaving it in teaches a reader the wrong thing about the page.
 *
 * turbopackIgnore, as in the docs route: the read is confined to content/docs
 * but the filename comes from the page tree, so static analysis cannot see it.
 */
function readSource(url: string): string {
  const rel = url.replace(/^\/docs\/?/, '') || 'index'
  const root = join(process.cwd(), 'content/docs')
  for (const path of [join(root, `${rel}.mdx`), join(root, rel, 'index.mdx')]) {
    try {
      return readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    } catch {
      // try the next candidate
    }
  }
  return ''
}

const stripFrontmatter = (raw: string) => raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()

export function GET() {
  const parts = [
    '# flare-kit',
    '',
    '> The developer toolkit for Flare: one operation lifecycle across headless',
    '> TypeScript, React hooks, embeddable widgets and agent tools. Community-built,',
    '> not an official Flare Networks product.',
    '',
  ]

  for (const page of source.getPages()) {
    const data = page.data as unknown as { title?: string; description?: string }
    const body = stripFrontmatter(readSource(page.url))
    if (!body) continue
    parts.push(
      '---',
      '',
      `# ${data.title ?? page.url}`,
      '',
      `Source: ${SITE}${page.url}`,
      '',
      body,
      '',
    )
  }

  return new Response(`${parts.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
