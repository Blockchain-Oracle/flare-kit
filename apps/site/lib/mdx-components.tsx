import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'
import { Pre } from '../components/docs/code-block'
import * as Demos from '../components/docs/demos/registry'
import { InstallTabs } from '../components/docs/install-tabs'
import { PropsTable } from '../components/docs/parts'

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
    // Every fenced ``` block renders through the real code window: syntax
    // highlighting plus a copy control. Inline `code` is left untouched.
    pre: Pre,
    InstallTabs,
    PropsTable,
    // Live demos are registered here rather than imported per page, so an MDX
    // author writes <OperationTimelineDemo /> and cannot wire it to the wrong
    // component or a stale fixture. The registry has one line per demo.
    ...Demos,
    ...extra,
  }
}
