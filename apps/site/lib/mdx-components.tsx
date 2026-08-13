import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'
import { OperationTimelineDemo } from '../components/docs/demos/operation-timeline-demo'
import { PropsTable } from '../components/docs/parts'
import { Preview } from '../components/docs/preview'

/**
 * Headings get their ids from fumadocs' rehype pass, so this only adds the
 * permalink affordance and keeps every element on the site's own classes —
 * `fumadocs-ui` is not used, so nothing arrives styled.
 */
function heading(Tag: 'h2' | 'h3' | 'h4') {
  return function Heading({ id, children }: { id?: string; children?: ReactNode }) {
    return (
      <Tag id={id}>
        {children}
        {id && (
          <a className="hash" href={`#${id}`} aria-label="Permalink to this section">
            #
          </a>
        )}
      </Tag>
    )
  }
}

export function getMDXComponents(extra?: MDXComponents): MDXComponents {
  return {
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    PropsTable,
    Preview,
    // Live demos are registered here rather than imported per page, so an MDX
    // author writes <OperationTimelineDemo /> and cannot wire it to the wrong
    // component or a stale fixture.
    OperationTimelineDemo,
    ...extra,
  }
}
