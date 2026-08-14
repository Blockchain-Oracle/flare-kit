/**
 * The mark from brand/flare-kit-mark.svg — three descending bars and a node,
 * the operation spine narrowing to a settled outcome.
 *
 * Drawn in `currentColor` so the caller decides. The brandmark is one of the
 * three sanctioned uses of --fk-brand; the crimson never carries text.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="currentColor"
      role="img"
      aria-label="flare-kit"
    >
      <rect x="4" y="8" width="40" height="7" rx="3.5" />
      <rect x="4" y="20.5" width="28" height="7" rx="3.5" />
      <rect x="4" y="33" width="16" height="7" rx="3.5" />
      <circle cx="37.5" cy="36.5" r="6.5" />
    </svg>
  )
}

/**
 * Mark plus wordmark, the shell's home link content.
 *
 * A fragment, not a wrapper: each shell positions the lockup in its own frame
 * — the site links it from a nav bar, the app from the head of its rail — and
 * a container here would fight both. The glyph and word carry `fk-` classes
 * because they are the kit's, and travel with the component.
 */
export function BrandLockup() {
  return (
    <>
      <span className="fk-brand-glyph" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="fk-brand-word">
        flare<b>-</b>kit
      </span>
    </>
  )
}
