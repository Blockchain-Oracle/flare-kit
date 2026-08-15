# Decision: the documentation site's framework

Date: 2026-08-13
Status: accepted by Abu in session on 2026-08-13
Closes: "choice of documentation framework and hosting provider", listed out of
scope in [Package, Docs and Distribution Surfaces](../specs/2026-08-03-kit-distribution-surfaces.md) §I

## Decision

`flare-kit.xyz` is one Next.js App Router application at `apps/site`.

| Part | Choice |
| --- | --- |
| Framework | Next.js, App Router |
| Content | `fumadocs-mdx` — MDX parsing, page tree and frontmatter schemas |
| UI | none from a library. Every pixel comes from `DESIGN.md` |
| Search | Pagefind, indexing the built HTML |

`fumadocs-ui` is **not** used. Only the content layer.

## Why this needed its own decision

No design artifact authorises it. [Visual-design
ownership](2026-08-03-visual-design-ownership.md) says so directly: "No design
artifact authorizes production architecture, framework selection,
implementation, deployment." The accepted specimens are design evidence.

This matters because we have done the opposite before. `@flare-kit/mcp` reached
a design specimen by analogy to cdr-kit with no decision behind it, and
[the agent-surfaces decision](2026-08-03-agent-facing-surfaces.md) had to
correct it. cdr-kit runs this same stack, and that is corroboration, not the
reason.

## Why

Two accepted requirements pick the stack on their own:

- **R-SITE-004** wants a live preview of a real component, with a code tab,
  running against the mock. The components are React. So the site is React.
- **R-SITE-007** wants a build-time static search index needing no server.
  Pagefind does exactly that, over output HTML, with no build-time coupling.

`DESIGN.md` outranks every default and component library, so a framework with
opinions about appearance is a cost, not a feature. Fumadocs' content layer
gives us the page tree, frontmatter validation and MDX without shipping a look.

## Rejected

- **Astro + Starlight.** Best static output and search included, but Starlight
  is a theme. We would spend the build overriding it, and live React previews
  get awkward.
- **Next.js with plain MDX, no fumadocs.** Full control, but we hand-build the
  page tree, the TOC and frontmatter validation. That is work fumadocs already
  does correctly.

## Deferred, and declared rather than hidden

- **R-SITE-008, versioned docs.** Not built for v1. One unpublished version
  exists, so a version selector would be furniture. It ships when there are two
  versions to choose between.
- **R-SITE-009, the site depends on published packages.** It cannot until the
  packages are published. The site starts on `workspace:*` and moves to the
  `npm:@flare-kit/<name>@^x` alias after the first release. cdr-kit's site uses
  that alias today; it is the mechanism, we just cannot use it yet.

Neither is done. Both stay open requirements.

## Hosting

Not decided here. The build is a standard Next build with a static search
index, so it does not constrain the host.
