import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { CopyPageButton } from '../../../components/docs/copy-page-button'
import { DocPage } from '../../../components/docs/doc-page'
import { getMDXComponents } from '../../../lib/mdx-components'
import { neighbours } from '../../../lib/reading-order'
import { source } from '../../../lib/source'

/**
 * Flatten an MDX heading title to plain text. A heading containing markup —
 * `## <code>foo</code>` — arrives as a React element, not a string, and would
 * render as a blank label in the right rail.
 */
function flattenTitle(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenTitle).join('')
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as ReactElement<{ children?: ReactNode }>).props
    return flattenTitle(props?.children)
  }
  return ''
}

/**
 * The frontmatter schema in source.config.ts does not flow into
 * `source.getPage().data` as typed fields — fumadocs surfaces them as unknown.
 * This is the runtime shape we know exists.
 */
interface DocFrontmatter {
  title: string
  description?: string
  importLine?: string
  breadcrumb?: string[]
  body: ComponentType<{ components: ReturnType<typeof getMDXComponents> }>
  toc: { url: string; title: unknown; depth: number }[]
}

type Props = { params: Promise<{ slug?: string[] }> }

/**
 * Raw MDX for the Copy page button. Leaf pages and section indexes differ, so
 * both shapes are tried.
 *
 * The read is confined to `content/docs`, but the slug is only known at request
 * time, so Turbopack's static analysis cannot prove that and would otherwise
 * trace the entire project into the server bundle. The ignore comment is the
 * documented escape hatch for a path that is scoped in fact but not statically.
 */
function readRawMarkdown(url: string): string {
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  const data = page.data as unknown as DocFrontmatter
  return { title: `${data.title} — flare-kit`, description: data.description }
}

export function generateStaticParams() {
  return source.generateParams()
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()

  const data = page.data as unknown as DocFrontmatter
  const MDX = data.body

  const tocItems = data.toc
    .filter((node) => node.depth <= 3)
    .map((node) => ({ id: node.url.replace(/^#/, ''), label: flattenTitle(node.title) }))

  // Each neighbour is labelled with its OWN title, so renaming a page can never
  // leave a stale label behind in the page beside it.
  const titles = new Map(
    source.getPages().map((entry) => [entry.url, (entry.data as unknown as DocFrontmatter).title]),
  )
  const { prev, next } = neighbours(page.url, titles)

  return (
    <DocPage
      data={{
        breadcrumb: data.breadcrumb ?? [],
        title: data.title,
        badges: <CopyPageButton markdown={readRawMarkdown(page.url)} />,
        lede: data.description ?? '',
        importLine: data.importLine,
        prev,
        next,
        content: <MDX components={getMDXComponents()} />,
      }}
      tocItems={tocItems}
    />
  )
}
