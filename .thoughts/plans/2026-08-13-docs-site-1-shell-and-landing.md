# flare-kit.xyz, plan 1 of 3: shell and landing page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/site` as a Next.js App Router application with the accepted DESIGN.md token contract, the site shell, and the landing page — ending with a real operation card driven by the actual mock kit.

**Architecture:** One Next.js app at `apps/site`, private, never published. Page-level design tokens live in `app/globals.css` and are held identical to `@flare-kit/react-ui`'s `.fk` tokens by a drift test, because the kit deliberately scopes its tokens to `.fk` and declares nothing on `html`, `body` or `*`. Theme is runtime `data-theme` with a pre-paint script, never a build variant.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@flare-kit/react` + `@flare-kit/react-ui` + `@flare-kit/core` from the workspace, Vitest.

## Global Constraints

- Package is `@flare-kit/site`, `"private": true`. `apps/*` deploys and never publishes, so publint and the dual ESM/CJS rules do not apply.
- Production source files stay under 300 lines. Split before writing, not after.
- Theme is runtime CSS variables under `data-theme`, not build-time variants.
- Every custom property is prefixed `--fk-`.
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

`apps/site/package.json`:

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
  // The kit is consumed from source in the workspace until it is published.
  // See .thoughts/decisions/2026-08-13-docs-site-framework.md (R-SITE-009).
  transpilePackages: ['@flare-kit/react-ui', '@flare-kit/react', '@flare-kit/core'],
}

export default config
```

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

Run from the repository root:

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

### Task 2: Port the DESIGN.md token contract, and pin it against drift

**Files:**
- Create: `apps/site/app/globals.css`
- Create: `apps/site/test/token-parity.test.ts`
- Create: `apps/site/vitest.config.ts`
- Modify: `apps/site/package.json` (add `test` script and Vitest devDependency)
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: Task 1's `apps/site/app/layout.tsx`.
- Produces: page-level `--fk-*` custom properties on `:root` and under `[data-theme='dark']`, available to every later component.

**Why this task exists:** `@flare-kit/react-ui` scopes all its tokens to `.fk` and deliberately declares nothing on `html`, `body` or `*` — a widget that resets its host's page is a bug. So the site cannot inherit page-level tokens from the kit and must declare its own. That duplication is real, so a test pins the two together.

- [ ] **Step 1: Write the failing parity test**

`apps/site/test/token-parity.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The kit scopes its tokens to `.fk` so it never touches a host page. The site
 * is the host page, so it declares the same tokens at `:root`. That is real
 * duplication, and this test is what stops the two drifting.
 */
function tokens(css: string, selector: string): Map<string, string> {
  const block = css.slice(css.indexOf(selector) + selector.length)
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'))
  const found = new Map<string, string>()
  for (const line of body.split('\n')) {
    const match = /^\s*(--fk-[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line)
    if (match) found.set(match[1], match[2].trim())
  }
  return found
}

const KIT = readFileSync('../../packages/react-ui/src/styles.css', 'utf8')
const SITE = readFileSync('app/globals.css', 'utf8')

describe('token parity with @flare-kit/react-ui', () => {
  it('declares every light token the kit declares, with the same value', () => {
    const kit = tokens(KIT, '\n.fk {')
    const site = tokens(SITE, '\n:root {')
    expect(kit.size).toBeGreaterThan(20)
    for (const [name, value] of kit) {
      expect(site.get(name), `${name} missing or different at :root`).toBe(value)
    }
  })

  it('declares every dark token the kit declares, with the same value', () => {
    const kit = tokens(KIT, "\n[data-theme='dark'] .fk {")
    const site = tokens(SITE, "\n[data-theme='dark'] {")
    expect(kit.size).toBeGreaterThan(10)
    for (const [name, value] of kit) {
      expect(site.get(name), `${name} missing or different in dark`).toBe(value)
    }
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

Expected: FAIL — `app/globals.css` does not exist.

- [ ] **Step 4: Write globals.css**

Read `packages/react-ui/src/styles.css`. Copy the `--fk-*` declarations from its `.fk { … }` block into a `:root { … }` block, and from its `[data-theme='dark'] .fk, .fk[data-theme='dark'] { … }` block into `[data-theme='dark'] { … }`. Copy the values verbatim — the test compares strings.

Then add the page-level rules the kit deliberately does not ship, using only those tokens:

```css
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--fk-bg);
  color: var(--fk-text);
  font-family: 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.55;
}
h1, h2, h3, h4 { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; }
code, kbd, samp, pre, .mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
a { color: var(--fk-primary); }
:focus-visible { outline: 2px solid var(--fk-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

- [ ] **Step 5: Import it in the layout**

Add `import './globals.css'` as the first line of `apps/site/app/layout.tsx`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @flare-kit/site test
```

Expected: PASS, both cases.

- [ ] **Step 7: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site
git commit -m "Port the DESIGN.md token contract to the site, pinned against drift"
```

---

### Task 3: Theme toggle with a pre-paint script

**Files:**
- Create: `apps/site/components/theme-toggle.tsx`
- Create: `apps/site/app/theme-script.tsx`
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: Task 2's tokens.
- Produces: `<ThemeToggle />`, and `data-theme="light" | "dark"` on `<html>` set before first paint.

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

`apps/site/components/theme-toggle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('fk-theme', next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}
```

The label is a word, not an icon alone — status and control state never rely on shape or colour alone.

- [ ] **Step 3: Mount the script in the layout**

In `apps/site/app/layout.tsx`, render `<ThemeScript />` inside `<head>`, and add `suppressHydrationWarning` to the `<html>` element because the script mutates it before React hydrates.

- [ ] **Step 4: Verify in a browser**

```bash
pnpm --filter @flare-kit/site dev
```

Open the site, toggle the theme, reload. Expected: the chosen theme survives reload with no flash of the other theme. Screenshot both themes.

- [ ] **Step 5: Run the full gate, then commit**

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
- Create: `apps/site/app/shell.css`
- Modify: `apps/site/app/layout.tsx`

**Interfaces:**
- Consumes: `<ThemeToggle />` from Task 3.
- Produces: `<SiteNav />` and `<SiteFooter />`, both used by every page including the docs routes in plan 2.

- [ ] **Step 1: Build the nav**

`apps/site/components/nav.tsx`. Match the accepted specimen at `.thoughts/design/fable5-direction-return/index.html`: brandmark left, links, then the search slot, theme toggle and one primary action right. The search input is a placeholder in this task; plan 2 wires Pagefind to it.

The brandmark uses `brand/flare-kit-mark.svg` and sets the wordmark in JetBrains Mono 700, matching the specimen's `.brandmark { font-family: var(--mono); font-weight: 700 }`.

Links: `Docs`, `Components`, `Hooks`, `Agent Kit` — all to `/docs` for now; plan 2 gives them real targets.

- [ ] **Step 2: Build the footer**

`apps/site/components/footer.tsx`. Carries the brandmark and this exact sentence, which is a requirement of the naming decision and appears on every published surface:

> Community-built. Not an official Flare Networks product.

- [ ] **Step 3: Mount both in the layout, and style them**

Write `apps/site/app/shell.css` using only `--fk-*` tokens. Import it in `layout.tsx` after `globals.css`. Render `<SiteNav />` above `{children}` and `<SiteFooter />` below.

- [ ] **Step 4: Verify in a browser, both themes**

Screenshot the shell in light and dark. Confirm the nav has no horizontal overflow at 375px width.

- [ ] **Step 5: Run the full gate, then commit**

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
- Consumes: the shell from Task 4.
- Produces: `<Hero />`, consumed by `app/page.tsx`.

- [ ] **Step 1: Build the hero**

Copy is fixed by accepted design evidence. Use these strings exactly:

- Display heading: `Ship Flare operations that recover.` — with `recover` carrying `--fk-brand`, which is one of the three sanctioned uses of the brand colour.
- Sub-line: `The typed toolkit for Flare. One operation lifecycle across headless TypeScript, React hooks, embeddable widgets and agent tools. Proofs, long waits and partial outcomes are handled for you.`
- Install line: `npm create flare-kit-app` with a copy button.
- Secondary action: `Read the docs` → `/docs`.

Do not add feature cards. DESIGN.md's anti-references bar "a Stripe-clone marketing page with three equal feature cards", and the commission's first anti-slop risk is "a marketing landing page masquerading as the application".

- [ ] **Step 2: Style it**

`apps/site/app/landing.css`, tokens only. The display face is Bricolage Grotesque; the sub-line is Hanken Grotesk; the install line is JetBrains Mono.

- [ ] **Step 3: Verify in a browser, both themes**

Screenshot at 1280px and 375px. Confirm the heading does not clip and the install line stays on one line or wraps cleanly.

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

  it('never renders a submitted operation as succeeded', () => {
    render(<LiveOperation />)
    expect(screen.queryByText(/^succeeded$/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Add the browser environment to Vitest**

Change `apps/site/vitest.config.ts` `environment` to `'jsdom'`, add `include: ['test/**/*.test.{ts,tsx}']`, and add devDependencies `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^7.0.0`, `jsdom@^30.0.1`, `@vitejs/plugin-react@^6.0.5`. Add a setup file importing `@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @flare-kit/site test
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the card**

`apps/site/components/landing/live-operation.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import { OperationTimeline } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

/**
 * The real mock state machine, not a picture of one. A visitor reads genuine
 * output. The `mock kit` label is required by R-MOCK-004: a mock surface is
 * always labelled, and is never a fallback triggered by a failure.
 */
export function LiveOperation() {
  const [kit] = useState(() => createMockKit())

  return (
    <FlareProvider kit={kit}>
      <div className="fk">
        <p className="mono">mock kit</p>
        <OperationTimeline />
      </div>
    </FlareProvider>
  )
}
```

Read `packages/react-ui/gallery/m1-sections.tsx` for the props `OperationTimeline` actually takes, and pass a mock operation the same way the gallery does. Do not invent a fixture shape.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @flare-kit/site test
```

Expected: PASS, both cases.

- [ ] **Step 6: Verify in a browser, both themes**

Screenshot the landing page with the card. Confirm the `mock kit` label is visible, every exact value renders in the mono face, and no step reads `Done` or `Succeeded` while it is still `submitted`.

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

describe('landing accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<Hero />)
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

In the browser, read `getComputedStyle` for the display heading, sub-line, muted text and the primary button, in light and dark. A screenshot is not evidence of contrast — a flat button still looks like a button. Record the measured ratios.

- [ ] **Step 4: Write the evidence record**

`.thoughts/verification/2026-08-13-site-shell.md`: the date, the commands run and their output, the measured contrast ratios, and the screenshots' paths. Save screenshots under `.thoughts/verification/site-screens/`.

- [ ] **Step 5: Run the full gate, then commit**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git add apps/site .thoughts/verification
git commit -m "Verify the site shell and landing page against the accessibility bar"
```

---

## What this plan does not do

Plan 2 covers the docs engine: `fumadocs-mdx`, the `/docs` routes, sidebar, table of contents, the `<Preview>` component that mounts real components against the mock, Pagefind search, `llms.txt` and `llms-full.txt`, and the planned-capability pages.

Plan 3 covers content: the roughly 58 component and hook pages, written against the fixed section order in R3.
