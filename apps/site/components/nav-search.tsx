'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Docs search over the Pagefind index.
 *
 * Pagefind runs as a post-build step and emits a static index to
 * `public/pagefind/`. There is no server: the browser fetches
 * `/pagefind/pagefind.js` and queries the index directly.
 *
 * In `next dev` that index does not exist unless a build has been run, so the
 * missing-index case is reported as itself. Rendering it as "no results" would
 * tell the reader their query failed when in fact search was never available.
 */

interface PagefindSub {
  url: string
  meta?: { title?: string }
  excerpt: string
}
interface PagefindResult {
  data: () => Promise<PagefindSub>
}
interface PagefindAPI {
  search: (query: string) => Promise<{ results: PagefindResult[] }>
  options?: (opts: Record<string, unknown>) => Promise<void>
}
interface Hit {
  url: string
  title: string
  excerpt: string
}

declare global {
  interface Window {
    pagefind?: PagefindAPI
  }
}

/**
 * Hide the specifier from Turbopack. `/pagefind/pagefind.js` is a post-build
 * asset under `public/`, not a module in `node_modules`, so a literal dynamic
 * import would fail resolution at build time.
 */
const dynamicImport = (specifier: string): Promise<unknown> =>
  (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>)(specifier)

async function loadPagefind(): Promise<PagefindAPI | null> {
  if (window.pagefind) return window.pagefind
  try {
    const mod = (await dynamicImport('/pagefind/pagefind.js')) as PagefindAPI
    window.pagefind = mod
    return mod
  } catch {
    return null
  }
}

const DEBOUNCE_MS = 160
const MAX_HITS = 8

export function NavSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [indexMissing, setIndexMissing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const api = useRef<PagefindAPI | null>(null)

  // ⌘K / Ctrl-K to open, Escape to close.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    if (api.current || indexMissing) return
    void loadPagefind().then((pf) => {
      if (pf) api.current = pf
      else setIndexMissing(true)
    })
  }, [open, indexMissing])

  const run = useCallback(async (term: string) => {
    const pf = api.current ?? (await loadPagefind())
    if (!pf) {
      setIndexMissing(true)
      setSearching(false)
      return
    }
    api.current = pf
    const { results } = await pf.search(term)
    const resolved = await Promise.all(results.slice(0, MAX_HITS).map((r) => r.data()))
    setHits(
      resolved.map((entry) => ({
        url: entry.url.replace(/\.html$/, '').replace(/\/index$/, '') || '/docs',
        title: entry.meta?.title ?? entry.url,
        excerpt: entry.excerpt,
      })),
    )
    setSearching(false)
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => void run(term), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, run])

  return (
    <>
      <button
        type="button"
        className="nav-search-btn"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <span className="fk-i fk-i-eye" aria-hidden="true" />
        <span className="nav-search-label">Search</span>
        <kbd className="mono" aria-hidden="true">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="search-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="search"
              className="search-input"
              placeholder="Search the documentation"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search query"
            />

            <div className="search-results" aria-live="polite">
              {indexMissing && (
                <p className="search-note">
                  The search index has not been built. Run <code>pnpm build</code> — Pagefind
                  indexes the built pages, so search is unavailable in a bare dev server.
                </p>
              )}
              {!indexMissing && searching && <p className="search-note">Searching…</p>}
              {!indexMissing && !searching && query.trim() && hits.length === 0 && (
                <p className="search-note">No pages match “{query.trim()}”.</p>
              )}
              {hits.map((hit) => (
                <Link key={hit.url} href={hit.url} className="search-hit" onClick={() => setOpen(false)}>
                  <span className="search-hit-title">{hit.title}</span>
                  <span
                    className="search-hit-excerpt"
                    // Pagefind returns its own <mark> markup around matches.
                    dangerouslySetInnerHTML={{ __html: hit.excerpt }}
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
