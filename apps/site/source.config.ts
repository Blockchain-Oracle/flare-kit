import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config'
import { z } from 'zod'

/**
 * fumadocs' content layer only — `fumadocs-ui` is deliberately not used.
 * DESIGN.md outranks every component library, so a framework with opinions
 * about appearance is a cost. See
 * .thoughts/decisions/2026-08-13-docs-site-framework.md.
 *
 * The extra fields are the component-doc anatomy: a breadcrumb, the import
 * line shown as a chip under the title, and explicit prev/next so page order
 * is authored rather than inferred from the file tree.
 */
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      importLine: z.string().optional(),
      breadcrumb: z.array(z.string()).optional(),
      prev: z.object({ href: z.string(), label: z.string() }).optional(),
      next: z.object({ href: z.string(), label: z.string() }).optional(),
    }),
  },
})

export default defineConfig()
