# Decision: README skeleton and the npm-rendered surface

Date: 2026-08-13
Status: accepted by Abu in session on 2026-08-13
Amends: `R-DIST-007` in
[Package, Docs and Distribution Surfaces](../specs/2026-08-03-kit-distribution-surfaces.md)
Authority: Abu authorised proceeding on the recommendation below after the
research was presented.

## Decision

Each published package ships a README on one shared skeleton. Three of the four
are short and link out to `flare-kit.xyz`; `@flare-kit/contracts` is long and
self-contained because a registry package has no docs-site page to link to.

```
# @flare-kit/<name>
<one factual sentence>

> Community-built. Not an official Flare Networks product.

## Install          ← the install line NAMES the required peers
## Usage            ← ONE complete runnable snippet, imports included
## Documentation    ← absolute link to flare-kit.xyz
## License
```

Two badges only, both linked: npm version and license.

### R-DIST-007 is amended

It read: "Each package ships its own README with a consistent skeleton:
install, what it is, the peer dependencies, and links."

**"the peer dependencies" is struck as a named section.** The peers are
documented *by appearing in the install command*. Everything else stands.

## Why

33 published READMEs were read from the npm registry and from published
tarballs — what npm actually renders, not what sits in the repo.

**Nobody writes a peer-dependency section.** Zero of the 33 has one. Grepping
the whole corpus case-insensitively for `peer` returns exactly one hit: a
single sentence at line 116 of `@testing-library/react`. The convention is
universal and explicit in wagmi, which declares four peers and documents them
like this:

```bash
pnpm add wagmi viem @tanstack/react-query
```

The rule that follows: name the peers a consumer would not already have, omit
`react`, `react-dom` and `typescript`, and omit optional peers entirely.
`@flare-kit/contracts` marks `viem` optional, so its install line is bare.

**Length tracks whether a package has a docs site, not what tier it is.**
`@wagmi/core` and `wagmi` are both 13 lines and the same shape, so the
headless-versus-React split we assumed does not exist. The longest README in
the corpus is `@safe-global/safe-deployments` at 237 lines — an address and ABI
registry with no docs site, documenting its exported types inline. That is
`@flare-kit/contracts`, and it is why that one package diverges.

**Duplication rots.** TanStack maintains a root README separate from the
`react-query` one, and `@tanstack/query-core` ended up shipping none at all —
its npm page is blank. `thirdweb`'s tarball also contains no README despite the
repo having one. Thin per-package stubs plus one docs site is the shape that
survives.

## What npm does not render — verified in the live DOM

These were checked by loading npmjs.com and querying the rendered document, not
inferred from documentation.

npm renders through GitHub's markdown pipeline but with **fewer extensions and
a stricter sanitizer than github.com**. Verified by reading npm's own
server-rendered HTML (`fetch('/package/<name>', {headers:{'x-spiferack':'1'}})`
returns `readme.data`) and by measuring the live DOM.

| | Result |
| --- | --- |
| **Mermaid** | **Does not render.** Emits `<div class="highlight highlight-source-mermaid"><pre>`; npm loads no mermaid.js at all. GitHub turns the identical markup into a diagram client-side — npm ships none of that client. |
| **GitHub alerts** | **Do not render.** `> [!NOTE]` renders as a blockquote with the literal `[!NOTE]` visible. GitHub's own API *does* render them; npm does not. |
| **Task lists** | **Do not render.** `- [x]` stays literal text, no checkbox. |
| **Heading anchors** | **Generated but dead.** npm emits `id="user-content-getting-started"` with `href="#getting-started"` and ships none of GitHub's prefix-stripping JS. Clicking a permalink leaves `scrollY` at 0. An in-README table of contents does not navigate. |
| **`<picture>` + `prefers-color-scheme`** | **Never works.** Inside an `<a>` the `<img>` is hoisted out, leaving a zero-width `<picture>`; outside one, npm's auto-generated `<a>` makes the `<img>` a grandchild so `<source>` matching does not apply. Measured on the `nx` page in dark mode: `source[srcset]` is the dark asset, `img.currentSrc` is the **light** one. npm emits GitHub's `<themed-picture>` wrapper but never defines the element. |
| **Relative links and `<img src>`** | **Work.** Rewritten against the package's directory in the repo via `repository` — svelte's `../../assets/banner.png` correctly resolves to the repo root. |
| **`srcset`** | **Left verbatim — broken.** Must be absolute `https://`. |
| Author `style`, inline `<svg>`, `<video>` | **Stripped.** `<details>`, `<table>`, `<p align>`, `<kbd>`, footnotes and `:emoji:` all survive. |
| Badges | shields.io works, proxied through `camo.githubusercontent.com` with a 5-minute cache. |
| Size | **233,471 characters** on the website (hard cut, mid-word, no notice). The registry packument truncates its own `readme` copy at **65,536 characters** — a different, lower limit that `npm view` sees. |

Consequences, now binding:

1. **Mermaid appears only in the repository README**, where GitHub renders it
   natively and it stays diffable. Anything that must appear on an npm package
   page is a pre-rendered SVG committed to `brand/`.
2. **One theme-neutral logo.** Light/dark asset pairs are correct for GitHub
   and for `flare-kit.xyz`, and structurally impossible on npm. The mark must
   read on both grounds unaided.
3. **No in-README table of contents, no alerts, no task lists.** All three
   render as broken literals or dead links.
4. `srcset` is always absolute. Ordinary relative links are fine, but package
   READMEs use absolute `https://` anyway so the same text works when it is
   lifted onto the docs site.

## Also fixed in the same change

Found while verifying the research against our own manifests:

- **All five `package.json` files lacked `repository`, `homepage`, `bugs`,
  `author` and `keywords`.** Without `repository`, npm cannot rewrite links at
  all and the sidebar carries no source or homepage link. Added.
- **`@flare-kit/react` and `@flare-kit/react-ui` did not declare `viem` as a
  peer**, though both depend on `@flare-kit/core`, which requires it. Peers are
  not transitive under pnpm. wagmi solves this by re-declaring `viem` at the
  React layer on top of `@wagmi/core`; we now do the same, so the install line
  can honestly name it.
- **`@flare-kit/react-ui` declares `@flare-kit/react` as `workspace:^` in
  `peerDependencies` — this turned out to be fine.** Rather than assume,
  `pnpm pack` was run and the published manifest read back:
  `"peerDependencies": {"react": "...", "@flare-kit/react": "^0.1.0"}`. pnpm
  rewrites the `workspace:` protocol in the peer block, not only in
  `dependencies`. R-REPO-002 holds; no change needed.

## Risk accepted

The READMEs link to `https://flare-kit.xyz`, which does not resolve yet. The
alternative was holding every README until the documentation site ships, which
contradicts the 2026-08-13 decision to stop sequencing documentation last. A
real future URL is preferred to a placeholder that would have to be found and
replaced later. Recorded so it is not rediscovered as a bug.

## Sources

- 33 published READMEs read from the npm registry and published tarballs,
  2026-08-13: wagmi, `@wagmi/core`, `@wagmi/connectors`, viem,
  `@tanstack/react-query`, `@tanstack/query-core`, `@rainbow-me/rainbowkit`,
  connectkit, `@radix-ui/react-dialog`, `@radix-ui/themes`, `@ark-ui/react`,
  react-day-picker, tsup, vitest, `@changesets/cli`, thirdweb,
  `@privy-io/react-auth`, `@reown/appkit`, `@coinbase/onchainkit`,
  `@safe-global/safe-deployments`, `@mui/material`, react-toastify, recharts,
  `@testing-library/react` and others.
- npm rendering behaviour verified by direct DOM inspection on npmjs.com.
