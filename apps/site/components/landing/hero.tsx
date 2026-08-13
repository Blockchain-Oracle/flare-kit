import Link from 'next/link'
import { InstallLine } from './install-line'

/**
 * The landing hero.
 *
 * Copy here is fixed by accepted design evidence — the motto is exactly
 * "Ship Flare operations that recover." and is not rewritten.
 *
 * No feature cards. DESIGN.md's anti-references bar a marketing page with three
 * equal feature cards, and the commission's first anti-slop risk is a landing
 * page masquerading as the application.
 */
export function Hero() {
  return (
    <section className="hero section">
      <div className="container hero-inner">
        <p className="eyebrow">Community-built toolkit for Flare</p>

        <h1 className="display hero-title">
          Ship Flare operations that{' '}
          {/* --fk-brand-text, not --fk-brand: the crimson never carries text. */}
          <span className="hero-accent">recover</span>.
        </h1>

        <p className="lede hero-lede">
          The typed toolkit for Flare. One operation lifecycle across headless TypeScript, React
          hooks, embeddable widgets and agent tools. Proofs, long waits and partial outcomes are
          handled for you.
        </p>

        <div className="hero-actions">
          <InstallLine command="npm create flare-kit-app" />
          <Link className="fk-btn fk-btn-ghost" href="/docs">
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  )
}
