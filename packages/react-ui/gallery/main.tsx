import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Gallery } from './Gallery.js'
import { auditA11y } from './a11y-audit.js'
import '../src/styles.css'
import './gallery.css'

// The mount, and nothing else. Components live in Gallery.tsx so this module
// has no component export to invalidate — which is what lets Fast Refresh work
// instead of full-reloading and re-rooting the same container on every edit.
// M4-R12. Exposed on the page rather than kept in a script, so the audit can be
// re-run by anyone with the gallery open — `__auditA11y()` in the console — and
// so it measures the same rendered pixels a person is looking at.
;(window as unknown as { __auditA11y: typeof auditA11y }).__auditA11y = auditA11y

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
)
