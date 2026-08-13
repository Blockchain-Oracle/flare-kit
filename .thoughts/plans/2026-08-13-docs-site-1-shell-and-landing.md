# flare-kit.xyz, plan 1 of 3: shell and landing page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/site` as a Next.js App Router application that *consumes* the accepted `@flare-kit/react-ui` token contract, the site shell, and the landing page — ending with a real operation card driven by the actual mock kit.

**Architecture:** One Next.js app at `apps/site`, private, never published. The site is a **consumer of the kit**, not a re-implementation of it: the root layout imports `@flare-kit/react-ui/styles.css` and puts `class="fk"` on `<body>`, so every `--fk-*` token, the three self-hosted faces, and the `.fk-btn` / `.fk-panel` / `.fk-note` / `.fk-code` / `.fk-i-*` primitives cascade to the whole page. `app/globals.css` declares only what the kit deliberately will not — `html`/`body` background and margin, box-sizing, selection, focus and reduced-motion — plus site-only layout. Theme is runtime `data-theme` with a pre-paint script, never a build variant.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@flare-kit/react` + `@flare-kit/react-ui` + `@flare-kit/core` from the workspace, Vitest.

**Reference implementation:** `/Users/abu/dev/hackathon/story-cdr/apps/site` (cdr-kit) runs this exact stack in production. Where a task says *port from cdr-kit*, read the named file and re-cut it — do not copy it verbatim, because cdr-kit's tokens are unprefixed (`--paper`, `--ink`) and flare's are `--fk-*`. See the appendix for the full inventory.

## Global Constraints

- Package is `@flare-kit/site`, `"private": true`. `apps/*` deploys and never publishes, so publint and the dual ESM/CJS rules do not apply.
- Production source files stay under 300 lines. Split before writing, not after.
- Theme is runtime CSS variables under `data-theme`, not build-time variants.
- **Reuse, do not re-code.** If `@flare-kit/react-ui` exports a component or ships a `.fk-*` class for a pattern, the site uses it. The site never hand-writes a button, badge, panel, note or code window.
- Exact values render in JetBrains Mono with tabular numerals, always carrying their asset and full precision. A number in the body face is a bug.
- Never fake protocol reality. No invented balances, hashes, proof results or outcomes. `submitted` is never rendered as `succeeded`. An unknown outcome is never rendered as failed. Mock mode is explicit, labelled, and never a fallback triggered by a failure.
- Copy follows `.thoughts/design/2026-08-03-product-surface-map.md` "Copy And Vocabulary Rules": use `Submitted`, `Confirming`, `Waiting for <actor>`, `Action required`, `Partially completed`, `Recovered`, `Final`. Never `Done` for submission alone. When an outcome is unknown say `Outcome not confirmed yet`, never `Failed`.
- The motto is exactly: `Ship Flare operations that recover.` Do not rewrite it.
- Anti-slop, from `.thoughts/design/2026-08-03-designer-commission.md`: no marketing landing page masquerading as the application; no three equal feature cards; no fake code panes or unreadable miniature hashes used as texture; no generic spinners or success toasts.
- WCAG 2.2 AA, verified against computed styles on rendered pages, both themes. Status never by colour alone.
- Gate after every task: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` from the repository root.

---

### Task 1: Scaffold `apps/site` and wire it into the workspace

**Files:**
- Create: `apps/site/package.json`
- Create: `apps/site/tsconfig.json`
- Create: `apps/site/next.config.ts`
- Create: `apps/site/next-env.d.ts` (generated, do not hand-edit)
- Create: `apps/site/app/layout.tsx`
- Create: `apps/site/app/page.tsx`
- Modify: `turbo.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable `@flare-kit/site` package with `build`, `dev`, `typecheck`, `lint` scripts. Later tasks add files under `apps/site/app` and `apps/site/components`.

- [ ] **Step 1: Create the package manifest**

`apps/site/package.json`. Versions match cdr-kit's proven set (`apps/site/package.json` there) where they overlap:

```json
{
  "name": "@flare-kit/site",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit",
    "clean": "rm -rf .next .turbo"
  },
  "dependencies": {
    "@flare-kit/contracts": "workspace:^",
    "@flare-kit/core": "workspace:^",
    "@flare-kit/react": "workspace:^",
    "@flare-kit/react-ui": "workspace:^",
    "next": "^16.2.6",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "viem": "^2.40.0"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "typescript": "^5.9.3"
  }
}
```

`viem` is a direct dependency here, not a peer: this is an application, and it is the thing that satisfies the kit's peer requirement.

Plan 2 adds `fumadocs-core`, `fumadocs-mdx`, `zod` and `pagefind`, and chains the Pagefind index into `build`. Do not add them now — an empty index over a `/docs` route that does not exist yet would fail the gate.

- [ ] **Step 2: Create the TypeScript config**

`apps/site/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create the Next config**

`apps/site/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // The kit is consumed from workspace source until it is published, so its TSX
  // and CSS must go through this app's compiler. cdr-kit does not need this —
  // it consumes published tarballs via the `npm:` alias.
  // See .thoughts/decisions/2026-08-13-docs-site-framework.md (R-SITE-009).
  transpilePackages: ['@flare-kit/react-ui', '@flare-kit/react', '@flare-kit/core'],
}

export default config
```

Plan 2 wraps this export in `createMDX()` from `fumadocs-mdx/next`, exactly as `story-cdr/apps/site/next.config.ts` does.

- [ ] **Step 4: Create a minimal root layout and page**

`apps/site/app/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export const metadata = {
  title: 'flare-kit',
  description: 'Ship Flare operations that recover.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`apps/site/app/page.tsx`:

```tsx
export default function Home() {
  return <main>flare-kit</main>
}
```

- [ ] **Step 5: Add the site's build to the Turborepo graph**

In `turbo.json`, confirm the `build` task declares `"dependsOn": ["^build"]` so the kit packages build before the site. Add `.next/**` to the `build` task's `outputs` array if an `outputs` key exists. Do not add a new task.

- [ ] **Step 6: Install and build**

```bash
pnpm install
pnpm --filter @flare-kit/site build
```

Expected: a successful Next production build. `next-env.d.ts` is generated; leave it.

- [ ] **Step 7: Run the full gate**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all four green. Read the output, not the exit code — `pnpm lint` is `eslint .` directly, so piping it to `tail` reports `tail`'s status, not eslint's.

- [ ] **Step 8: Commit**

```bash
git add apps/site turbo.json pnpm-lock.yaml
git commit -m "Scaffold apps/site as the flare-kit.xyz application"
```

---

### Task 2: Inherit the kit's token contract at page level

**Files:**
- Create: `apps/site/app/globals.css`
- Create: `apps/site/test/kit-inheritance.test.ts`
- Create: `apps/site/vitest.config.ts`
- Modify: `apps/site/package.json` (add `test` script and Vitest devDependency)
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: Task 1's `apps/site/app/layout.tsx`.
- Produces: every `--fk-*` token, the three self-hosted faces, and every `.fk-*` primitive class, available to every later component.

**Why this task exists, and why it is not a port.** `@flare-kit/react-ui` scopes its tokens to `.fk` and declares nothing on `html`, `body` or `*` — a widget that resets its host's page is a bug. The obvious reading is that the site must therefore re-declare the tokens itself. It does not. `.fk` is a class, and the site is free to put it on `<body>`, at which point the whole contract cascades to the page. Verified in `packages/react-ui/src/styles.css`:

- tokens are all `--fk-` prefixed — `--fk-bg`, `--fk-text`, `--fk-primary`, `--fk-brand`, `--fk-font-display/-sans/-mono`, `--fk-r-*`, `--fk-sh-*`
- the three families are self-hosted `@font-face` over `src/fonts/*.woff2`, so no `next/font` and no Google fetch
- dark is `[data-theme='dark'] .fk`, so `data-theme` on `<html>` still drives it
- `primitives.css` already ships `.fk-btn`(`-primary`/`-ghost`/`-sm`/`-block`), `.fk-panel`, `.fk-row`, `.fk-note`, `.fk-code`, `.fk-skel` and 14 `.fk-i-*` icons

cdr-kit could not do this — its kit exposed no prefixed token API, so `story-cdr/apps/site/app/globals.css` re-declares the entire design system unprefixed across 566 lines. flare does not inherit that debt. **There is no duplication here, so there is nothing to drift, and no parity test.**

The one thing `.fk` does *not* set is `background` — it sets `color`, `font-family`, `font-size`, `line-height` and `letter-spacing` only. So the page background is the site's job.

- [ ] **Step 1: Write the failing guard test**

The seam worth guarding is no longer drift — it is someone quietly deleting the stylesheet import or the `fk` class, which would strip the whole page to system fonts and unstyled controls without failing a typecheck.

`apps/site/test/kit-inheritance.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The site does not declare tokens — it wears the kit's. Two lines make that
 * true, and neither is type-checked, so losing one degrades the entire page
 * silently to system fonts and unstyled controls. This is that guard.
 */
const LAYOUT = readFileSync('app/layout.tsx', 'utf8')

describe('the site inherits the kit token contract', () => {
  it('imports the kit stylesheet in the root layout', () => {
    expect(LAYOUT).toMatch(/import ['"]@flare-kit\/react-ui\/styles\.css['"]/)
  })

  it('puts the .fk scope on body, so tokens and primitives cascade', () => {
    expect(LAYOUT).toMatch(/<body[^>]*className=(["'])(?:[^"']*\s)?fk(?:\s[^"']*)?\1/)
  })

  it('declares no --fk-* token of its own, which would fork the contract', () => {
    const globals = readFileSync('app/globals.css', 'utf8')
    const declared = globals.match(/^\s*--fk-[a-z0-9-]+\s*:/gm) ?? []
    expect(declared, `globals.css must consume tokens, not declare them`).toEqual([])
  })
})
```

- [ ] **Step 2: Add Vitest to the site**

Add to `apps/site/package.json` scripts: `"test": "vitest run"`. Add to devDependencies: `"vitest": "^4.1.10"`.

`apps/site/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @flare-kit/site test
```

Expected: FAIL on all three — the layout imports nothing and `app/globals.css` does not exist.

- [ ] **Step 4: Write globals.css**

Only what the kit will not declare, plus site-only layout. Every value is a kit token; nothing here defines one.

```css
/* The site wears @flare-kit/react-ui's contract via `.fk` on <body>.
   This file adds only what an embeddable kit must never touch on its host:
   the page box, the page background, and document-level affordances. */

*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }

html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
  background: var(--fk-bg);
}

/* body carries `.fk`, which brings font-family, size, line-height and color.
   Background is the one page-level property `.fk` deliberately leaves alone. */
body { background: var(--fk-bg); min-height: 100dvh; }

a { color: inherit; text-decoration: none; }
img, svg { display: block; }
::selection { background: var(--fk-primary-soft); color: var(--fk-text); }

:focus-visible { outline: 2px solid var(--fk-primary); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}

/* ---------- Site-only layout ---------- */
.container { width: 100%; max-width: 1180px; margin-inline: auto; padding-inline: 28px; }
.section { padding-block: clamp(56px, 9vw, 116px); }

/* ---------- Site-only type ---------- */
.display {
  font-family: var(--fk-font-display);
  font-weight: 800;
  font-size: clamp(2.7rem, 6.2vw, 5.1rem);
  line-height: 0.97;
  letter-spacing: -0.035em;
}
.lede { font-size: clamp(1.06rem, 1.6vw, 1.32rem); color: var(--fk-text-muted); line-height: 1.5; }
.eyebrow {
  font-family: var(--fk-font-mono);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fk-text-faint);
}
.muted { color: var(--fk-text-muted); }
.mono { font-family: var(--fk-font-mono); font-variant-numeric: tabular-nums; }
```

Section order and the `.container`/`.section`/`.eyebrow`/`.lede` naming are ported from `story-cdr/apps/site/app/globals.css` lines 99–133, re-tokenised.

- [ ] **Step 5: Wire the layout**

`apps/site/app/layout.tsx` — the stylesheet import order matters: the kit's contract first, then the page rules that consume it.

```tsx
import type { ReactNode } from 'react'
import '@flare-kit/react-ui/styles.css'
import './globals.css'

export const metadata = {
  title: 'flare-kit',
  description: 'Ship Flare operations that recover.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="fk">{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @flare-kit/site test
```

Expected: PASS, all three.

- [ ] **Step 7: Prove the inheritance in a browser, not just in a test**

```bash
pnpm --filter @flare-kit/site dev
```

The test proves the two lines are present. It does not prove the cascade works. In the browser console, read the computed values — a passing test with a broken `exports` map would still leave you on system fonts:

```js
getComputedStyle(document.body).fontFamily          // expect 'Hanken Grotesk', …
getComputedStyle(document.body).backgroundColor     // expect the --fk-bg paper, not white
getComputedStyle(document.body).getPropertyValue('--fk-primary')  // expect #3959da
document.fonts.check('16px "Bricolage Grotesque"')  // expect true
```

Record the four outputs; Task 7's evidence file wants them.

- [ ] **Step 8: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Wear the kit's token contract at page level rather than forking it"
```

---

### Task 3: Theme toggle with a pre-paint script

**Files:**
- Create: `apps/site/components/theme-toggle.tsx`
- Create: `apps/site/app/theme-script.tsx`
- Modify: `apps/site/app/globals.css`
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: Task 2's tokens.
- Produces: `<ThemeToggle />`, and `data-theme="light" | "dark"` on `<html>` set before first paint.

Ported from `story-cdr/apps/site/components/theme-toggle.tsx` (37 lines) and its layout's `THEME_INIT`.

- [ ] **Step 1: Write the pre-paint script**

`apps/site/app/theme-script.tsx`. DESIGN.md requires the theme be applied before paint, otherwise a dark-mode visitor sees a white flash.

```tsx
/**
 * Runs before first paint. Reads the stored choice, falls back to the system
 * preference, and stamps data-theme on <html>. Inline and blocking on purpose:
 * deferring it produces a flash of the wrong theme.
 */
const SCRIPT = `(function(){try{
var s=localStorage.getItem('fk-theme');
var d=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.documentElement.setAttribute('data-theme',d);
}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
```

- [ ] **Step 2: Write the toggle**

cdr-kit's version holds no React state at all — it reads `data-theme` off the document and flips it, and CSS swaps which glyph is visible. That is deliberate: a `useState` seeded from `localStorage` is a hydration mismatch waiting to happen, because the server cannot know the stored theme. Keep that property.

`apps/site/components/theme-toggle.tsx`:

```tsx
'use client'

const STORAGE_KEY = 'fk-theme'

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode or quota — the toggle still works for this session */
  }
}

/**
 * The theme is stamped on <html> before paint by ThemeScript; this button only
 * flips it. No React state, so there is nothing for the server to guess wrong
 * and no hydration mismatch. CSS decides which glyph shows.
 */
export function ThemeToggle() {
  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}
```

The accessible name is the stable `Toggle theme`, not a state readout. The current theme is not status information the icon has to carry — it is legible from the entire page. This is an affordance, not a state chip, so the "never by shape alone" rule is not engaged.

- [ ] **Step 3: Style it, in globals.css**

```css
.theme-toggle {
  display: inline-grid; place-items: center;
  width: 34px; height: 34px;
  border: 1px solid var(--fk-border); border-radius: var(--fk-r-md);
  background: transparent; color: var(--fk-text-muted); cursor: pointer;
}
.theme-toggle:hover { color: var(--fk-text); border-color: var(--fk-border-control); }
.theme-toggle svg { width: 16px; height: 16px; grid-area: 1 / 1; }
.theme-toggle .sun { display: none; }
[data-theme='dark'] .theme-toggle .sun { display: block; }
[data-theme='dark'] .theme-toggle .moon { display: none; }
```

- [ ] **Step 4: Mount the script in the layout**

Render `<ThemeScript />` inside `<head>`, and add `suppressHydrationWarning` to `<html>` because the script mutates it before React hydrates.

- [ ] **Step 5: Verify in a browser**

```bash
pnpm --filter @flare-kit/site dev
```

Toggle the theme, reload. Expected: the chosen theme survives reload with no flash of the other theme. Confirm the swap actually reaches kit tokens:

```js
document.documentElement.getAttribute('data-theme')
getComputedStyle(document.body).getPropertyValue('--fk-bg')  // must differ between themes
```

Screenshot both themes.

- [ ] **Step 6: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Add the runtime theme toggle with a pre-paint script"
```

---

### Task 4: The site shell — nav and footer

**Files:**
- Create: `apps/site/components/nav.tsx`
- Create: `apps/site/components/footer.tsx`
- Create: `apps/site/components/brand-mark.tsx`
- Create: `apps/site/app/shell.css`
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: `<ThemeToggle />` from Task 3; `brand/flare-kit-mark.svg`.
- Produces: `<SiteNav />` and `<SiteFooter />`, both used by every page including the docs routes in plan 2.

Ported from `story-cdr/apps/site/components/nav.tsx` (187 lines) and `footer.tsx` (84). Take the structure — brand left, links centre, actions right, a burger drawer under 900px, a three-column footer over a mono bottom bar. Drop cdr-kit's "More" dropdown: flare's nav has four links and does not need it, and an unused dropdown is exactly the unrequested configuration the review gate looks for.

- [ ] **Step 1: Build the brandmark**

`apps/site/components/brand-mark.tsx` — the mark from `brand/flare-kit-mark.svg` plus the wordmark. The specimen at `.thoughts/design/fable5-direction-return/index.html` sets it in `var(--mono)` at 700, so use `var(--fk-font-mono)`.

- [ ] **Step 2: Build the nav**

`apps/site/components/nav.tsx`, a client component (the drawer holds state). Structure:

- brand left, linking to `/`
- links: `Docs`, `Components`, `Hooks`, `Agent Kit` — all to `/docs` for now; plan 2 gives them real targets
- right: a search slot (an inert placeholder in this task — plan 2 wires Pagefind into it), npm and GitHub icon links, `<ThemeToggle />`, and one primary action `Get started` → `/docs`
- under 900px the links collapse into a burger-opened drawer with `role="dialog"`, `aria-modal`, `aria-expanded` and `aria-controls`, and body scroll locked while open

The primary action uses the kit's own class, not a new one:

```tsx
<Link className="fk-btn fk-btn-primary fk-btn-sm" href="/docs">Get started</Link>
```

Close the drawer on route change, exactly as cdr-kit does — `usePathname()` in a `useEffect` — otherwise it stays open behind the new page.

- [ ] **Step 3: Build the footer**

`apps/site/components/footer.tsx`. Three link columns over a mono bottom bar. The bottom bar carries this exact sentence, which is a requirement of the naming decision and appears on every published surface:

> Community-built. Not an official Flare Networks product.

- [ ] **Step 4: Mount both in the layout, and style them**

Write `apps/site/app/shell.css` using only `--fk-*` tokens. Import it in `layout.tsx` after `globals.css`. Render `<SiteNav />` above `<main>{children}</main>` and `<SiteFooter />` below.

- [ ] **Step 5: Verify in a browser, both themes**

Screenshot the shell in light and dark at 1280px and 375px. Confirm no horizontal overflow at 375px, the drawer traps nothing it should not, and the `Get started` button picked up the kit's primary styling rather than rendering as a bare link — that is the visible proof Task 2's inheritance reaches components.

- [ ] **Step 6: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Add the site shell: nav and footer"
```

---

### Task 5: The landing hero

**Files:**
- Create: `apps/site/components/landing/hero.tsx`
- Create: `apps/site/app/landing.css`
- Modify: `apps/site/app/page.tsx`

**Interfaces:**
- Consumes: the shell from Task 4; `CopyButton` from `@flare-kit/react-ui`.
- Produces: `<Hero />`, consumed by `app/page.tsx`.

- [ ] **Step 1: Build the hero**

Copy is fixed by accepted design evidence. Use these strings exactly:

- Display heading: `Ship Flare operations that recover.` — with `recover` carrying `--fk-brand`, one of the three sanctioned uses of the brand colour. Note `--fk-brand` is 4.34:1 on paper and the token file says it never carries text; use `--fk-brand-text` (`#c51b4b`) for the word itself and keep `--fk-brand` for non-text marks.
- Sub-line: `The typed toolkit for Flare. One operation lifecycle across headless TypeScript, React hooks, embeddable widgets and agent tools. Proofs, long waits and partial outcomes are handled for you.`
- Install line: `npm create flare-kit-app` with a copy button.
- Secondary action: `Read the docs` → `/docs`.

The install line is cdr-kit's `CopyLine` pattern (`components/primitives/copy-line.tsx`, 13 lines) — a mono `$ command` field with an inline copy button. **Do not port cdr-kit's `CopyButton`**: `@flare-kit/react-ui` already exports one. Compose:

```tsx
import { CopyButton } from '@flare-kit/react-ui'

<div className="copyline">
  <span className="mono"><span className="pfx">$</span> npm create flare-kit-app</span>
  <CopyButton value="npm create flare-kit-app" />
</div>
```

Read `CopyButton`'s props in `packages/react-ui/src/primitives/CopyButton.tsx` before wiring it; do not assume the prop name.

Do not add feature cards. DESIGN.md's anti-references bar "a Stripe-clone marketing page with three equal feature cards", and the commission's first anti-slop risk is "a marketing landing page masquerading as the application".

- [ ] **Step 2: Style it**

`apps/site/app/landing.css`, tokens only. Display face `var(--fk-font-display)`; sub-line `var(--fk-font-sans)`; install line `var(--fk-font-mono)`. `.copyline` styling ports from `story-cdr/apps/site/app/globals.css` "Copy field" section (line 284), re-tokenised.

- [ ] **Step 3: Verify in a browser, both themes**

Screenshot at 1280px and 375px. Confirm the heading does not clip, the install line stays on one line or wraps cleanly, and the copy button actually copies.

- [ ] **Step 4: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Add the landing hero on the accepted motto"
```

---

### Task 6: The landing operation card, driven by the real mock

**Files:**
- Create: `apps/site/components/landing/live-operation.tsx`
- Create: `apps/site/test/live-operation.test.tsx`
- Modify: `apps/site/app/page.tsx`
- Modify: `apps/site/vitest.config.ts`

**Interfaces:**
- Consumes: `createMockKit` from `@flare-kit/core`; `FlareProvider` from `@flare-kit/react`; `OperationTimeline` from `@flare-kit/react-ui`.
- Produces: `<LiveOperation />`.

**Why this task matters:** this is the difference between a marketing page and the product. The card runs the real mock state machine, so what a visitor reads is genuine output, not a picture of output.

The real API, verified against `packages/core/src/mock.ts` and `packages/react-ui/gallery/m1-sections.tsx:50-78`:

- `createMockKit({ seed, scenario })` — `scenario` is `MockScenario`, e.g. `'happy'`, `'executor-late'`, `'large-delayed'`
- `kit.start({ amountXrp, recipient, xrplAccount })` → an `OperationRecord`
- `kit.trace(record)` → `OperationRecord[]`, the real state sequence
- `<OperationTimeline operation={record} />` — `operation` is **required**; `stepEvidence`, `onAction`, `theme` and `className` are optional

- [ ] **Step 1: Write the failing test**

`apps/site/test/live-operation.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveOperation } from '../components/landing/live-operation'

describe('LiveOperation', () => {
  it('labels itself as the mock, so no visitor reads it as a live chain result', () => {
    render(<LiveOperation />)
    expect(screen.getByText(/mock kit/i)).toBeInTheDocument()
  })

  it('renders a state the mock actually produced, not an invented one', () => {
    render(<LiveOperation />)
    expect(screen.queryByText(/^succeeded$/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Add the browser environment to Vitest**

Change `apps/site/vitest.config.ts` `environment` to `'jsdom'`, set `include: ['test/**/*.test.{ts,tsx}']`, add the React plugin, and add devDependencies `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^7.0.0`, `jsdom@^30.0.1`, `@vitejs/plugin-react@^6.0.5`. Add a setup file importing `@testing-library/jest-dom/vitest`. Mirror `packages/react-ui/test/setup.ts`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @flare-kit/site test
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the card**

`apps/site/components/landing/live-operation.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { createMockKit } from '@flare-kit/core'
import { OperationTimeline } from '@flare-kit/react-ui'

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

/**
 * The real mock state machine, not a picture of one. The record rendered here
 * is one the mock actually produced, so every step, actor and evidence chip is
 * genuine output. The `mock kit` label is required: a mock surface is always
 * labelled, and is never a fallback triggered by a failure.
 */
export function LiveOperation() {
  const record = useMemo(() => {
    const kit = createMockKit({ seed: 'landing', scenario: 'happy' })
    const trace = kit.trace(
      kit.start({ amountXrp: '25.000000', recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }),
    )
    const found = trace.find((r) => r.state === 'awaiting_external')
    if (!found) throw new Error(`No awaiting_external record: ${trace.map((r) => r.state).join(', ')}`)
    return found
  }, [])

  return (
    <div className="live-operation">
      <p className="eyebrow">mock kit</p>
      <OperationTimeline operation={record} />
    </div>
  )
}
```

Note the loud `throw` rather than a `?? trace[0]` fallback — the gallery's own comment records why: a silent fallback once rendered a *succeeded* operation under a "ready" label. A landing page that lies about which state it is showing is worse than no landing page.

`awaiting_external` is the honest state to lead with: it is the one this product exists to handle well, and it demonstrates the wait vocabulary rather than a success screenshot. Confirm it appears in the trace before committing to it; if not, pick another state the trace actually contains and say which in the commit message.

No `FlareProvider` is needed here — `OperationTimeline` renders a record it is handed and reads no context. Do not add a provider the component does not consume.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @flare-kit/site test
```

Expected: PASS, both cases.

- [ ] **Step 6: Verify in a browser, both themes**

Screenshot the landing page with the card. Confirm the `mock kit` label is visible, every exact value renders in the mono face, and no step reads `Done` or `Succeeded` while the operation is still in flight.

- [ ] **Step 7: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Drive the landing operation card from the real mock kit"
```

---

### Task 7: Accessibility pass and evidence

**Files:**
- Create: `apps/site/test/a11y.test.tsx`
- Create: `.thoughts/verification/2026-08-13-site-shell.md`

**Interfaces:**
- Consumes: every component from Tasks 3 to 6.
- Produces: recorded evidence that the shell and landing page meet the bar.

- [ ] **Step 1: Write the axe test**

`apps/site/test/a11y.test.tsx`, following the pattern already used in `packages/react-ui/gallery/a11y-audit.ts`:

```tsx
import { render } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { Hero } from '../components/landing/hero'
import { LiveOperation } from '../components/landing/live-operation'

describe('landing accessibility', () => {
  it.each([
    ['Hero', <Hero key="h" />],
    ['LiveOperation', <LiveOperation key="l" />],
  ])('%s has no axe violations', async (_name, node) => {
    const { container } = render(node)
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
```

Add `axe-core@^4.12.0` to devDependencies.

- [ ] **Step 2: Run it**

```bash
pnpm --filter @flare-kit/site test
```

Fix any violation rather than suppressing it.

- [ ] **Step 3: Verify contrast against computed styles, both themes**

In the browser, read `getComputedStyle` for the display heading, the sub-line, muted text, the `recover` brand word and the primary button, in light and dark. A screenshot is not evidence of contrast — a flat button still looks like a button. Record the measured ratios.

- [ ] **Step 4: Write the evidence record**

`.thoughts/verification/2026-08-13-site-shell.md`: the date, the commands run and their output, Task 2 Step 7's four computed-style readings, the measured contrast ratios, and the screenshots' paths. Save screenshots under `.thoughts/verification/site-screens/`.

- [ ] **Step 5: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site .thoughts/verification
git commit -m "Verify the site shell and landing page against the accessibility bar"
```

---

## What this plan does not do

Plan 2 covers the docs engine: `fumadocs-mdx`, the `/docs` routes, sidebar, table of contents, the `<Preview>` component that mounts real components against the mock, Pagefind search, `llms.txt` and `llms-full.txt`, and the planned-capability pages. It inherits from cdr-kit heavily — see the appendix.

Two things plan 1 deliberately leaves for it, so they land where the thing they index exists:

- **The Pagefind build step.** cdr-kit's, verbatim, is worth keeping — note it indexes `.next/server/app`, not a static export:
  ```
  "build": "next build && pnpm run build:pagefind",
  "build:pagefind": "pagefind --site .next/server/app --output-path public/pagefind --glob \"docs/**/*.html\""
  ```
- **The `createMDX()` wrapper** around `next.config.ts`'s export.

Plan 3 covers content: the roughly 58 component and hook pages, written against the fixed section order in R3.

---

## Appendix: what comes from cdr-kit

`/Users/abu/dev/hackathon/story-cdr/apps/site` runs this exact stack. It is Abu's own prior toolkit and the accepted design north star, so the site is a re-cut of it, not a fresh invention.

**Used in this plan.** Layout shape and stylesheet-import order (`app/layout.tsx`); the pre-paint `THEME_INIT` script; the stateless theme toggle (`components/theme-toggle.tsx`); nav and footer structure (`components/nav.tsx`, `footer.tsx`); the `.container` / `.section` / `.eyebrow` / `.lede` / copy-field sections of `app/globals.css`; the `CopyLine` composition.

**Deliberately not used.** cdr-kit's 566-line `globals.css` token block — flare inherits `--fk-*` from the kit instead of re-declaring a system (see Task 2). cdr-kit's `lib/fonts.ts` and `next/font/google` — flare's kit self-hosts all three faces. cdr-kit's `primitives/` button, badge and code-window — `@flare-kit/react-ui` already exports and styles those. cdr-kit's nav "More" dropdown — four links do not need one.

**Waiting for plan 2.** `source.config.ts` (the `importLine` / `breadcrumb` / `prev` / `next` frontmatter schema); `lib/source.ts`; `lib/mdx-components.tsx`; `lib/highlight.tsx`; `components/docs/` — `demo.tsx` is the Preview/Code tab component R-SITE-004 asks for, alongside `sidebar.tsx`, `toc.tsx`, `doc-page.tsx` (whose `DocPageData` interface *is* the documented page anatomy), `parts.tsx`, `code-panel.tsx`, `copy-page-button.tsx`; and both `app/llms.txt/route.ts` and `app/llms-full.txt/route.ts`.
