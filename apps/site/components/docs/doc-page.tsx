import type { ReactNode } from 'react'
import { Breadcrumb, DocTitle, PrevNext } from './parts'
import { Toc, type TocItem } from './toc'

export interface DocPageData {
  breadcrumb: string[]
  title: string
  badges?: ReactNode
  lede: ReactNode
  importLine?: string
  content: ReactNode
  prev?: { href: string; label: string }
  next?: { href: string; label: string }
}

/**
 * The canonical page anatomy, in fixed order:
 * breadcrumb → title row → lede → import chip → body → prev/next, with the
 * table of contents in the right rail.
 *
 * Every documentation page uses this. A page that arranges its own header is a
 * page that will drift from the other fifty-odd.
 */
export function DocPage({ data, tocItems }: { data: DocPageData; tocItems: TocItem[] }) {
  return (
    <>
      <article className="doc">
        <Breadcrumb parts={data.breadcrumb} />
        <DocTitle title={data.title} badges={data.badges} />
        {data.lede && <p className="doc-lede lede">{data.lede}</p>}
        {data.importLine && (
          <p className="doc-import mono">
            <span>{data.importLine}</span>
          </p>
        )}
        <div className="doc-body">{data.content}</div>
        <PrevNext prev={data.prev} next={data.next} />
      </article>
      <Toc items={tocItems} />
    </>
  )
}
