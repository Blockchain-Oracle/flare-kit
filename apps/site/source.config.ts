import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config'
import { z } from 'zod'

/**
 * fumadocs' content layer only — `fumadocs-ui` is deliberately not used.
 * DESIGN.md outranks every component library, so a framework with opinions
 * about appearance is a cost. See
 * .thoughts/decisions/2026-08-13-docs-site-framework.md.
 *
 * The extra fields are the component-doc anatomy: a breadcrumb, and the import
 * line shown as a chip under the title.
 *
 * Page order is NOT frontmatter. It is authored once in lib/reading-order.ts,
 * which both the sidebar and the pager read, so the two cannot disagree and
 * adding a page costs one line instead of edits to its two neighbours.
 */
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      importLine: z.string().optional(),
      breadcrumb: z.array(z.string()).optional(),
    }),
  },
})

/**
 * fumadocs-mdx applies Shiki (`rehypeCode`) to every fence by default, against a
 * CSS-variable theme this site never defines — so code rendered flat and grey.
 * Turn it off: fences compile to plain `<pre><code>`, and the `pre` MDX override
 * runs them through the kit's own tokenizer (`lib/highlight.tsx`), so a fence and
 * the live-preview Code tab share one palette — the `.tok-*` colours DESIGN.md
 * fixes.
 */
export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: false,
  },
})
