import Link from 'next/link'
import { InstallLine } from './install-line'

/**
 * Closing call to action. Action copy, not a slogan — the identity headline is
 * the hero's job, and no motto is invented here.
 */
export function CtaBand() {
  return (
    <section className="cta-band">
      <div className="container cta-inner">
        <h2 className="h-sec">Ship your first Flare operation.</h2>
        <p className="lede cta-lede">
          Scaffold an app against the mock, then point it at Coston2 when you are ready.
        </p>
        <div className="cta-actions">
          <InstallLine command="npm create flare-kit-app" />
          <Link className="fk-btn fk-btn-ghost" href="/docs">
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  )
}
