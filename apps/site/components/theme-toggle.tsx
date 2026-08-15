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
 * flips it. Deliberately holds no React state: a useState seeded from
 * localStorage cannot be known on the server, so it hydrates mismatched. CSS
 * decides which glyph shows.
 *
 * The accessible name is the stable "Toggle theme", not a state readout. The
 * current theme is not status information this control has to carry — it is
 * legible from the entire page — so this is an affordance, not a state chip.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <svg
        className="moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg
        className="sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
