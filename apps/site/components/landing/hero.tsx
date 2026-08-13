import Link from 'next/link'
import { HeroDemo } from './hero-demo'
import { InstallLine } from './install-line'

/**
 * The landing hero.
 *
 * Identity comes from the brand banner (`brand/flare-kit-banner.svg`):
 * *the developer toolkit for Flare*. The headline leads with that, not with a
 * slogan. Structure mirrors the cdr-kit reference: a short lede, an install
 * line, an honest proof row, and the signature component running live in the
 * right column — so the front door shows the toolkit working, not a picture.
 *
 * No feature cards. DESIGN.md's anti-references bar a marketing page with three
 * equal feature cards.
 */
export function Hero() {
  return (
    <section className="hero section">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Community-built toolkit for Flare</p>

          <h1 className="display hero-title">
            The {/* one accented word — brand-text, never the crimson fill */}
            <span className="hero-accent">typed</span> toolkit for Flare.
          </h1>

          <p className="lede hero-lede">
            One API for every Flare operation — mint, swap, attest, stake — from a script to a
            React widget to an agent, with the proofs and long waits handled for you.
          </p>

          <div className="hero-actions">
            <InstallLine command="npm create flare-kit-app" />
            <Link className="fk-btn fk-btn-ghost" href="/docs">
              Read the docs
            </Link>
          </div>

          {/* Every claim here is true today; no invented protocol reality. */}
          <ul className="hero-proof mono">
            <li>TypeScript-first</li>
            <li>Coston2 + XRPL Testnet</li>
            <li>MIT licensed</li>
          </ul>
        </div>

        <HeroDemo />
      </div>
    </section>
  )
}
