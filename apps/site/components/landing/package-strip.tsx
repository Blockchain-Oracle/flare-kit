/**
 * The four packages that actually publish. Not marketing feature cards — a
 * factual manifest in the mono face, one row per package. Anything unbuilt
 * (agent tools, CLI, MCP) is deliberately absent; the landing never lists a
 * package that does not exist.
 */
const PACKAGES: { name: string; blurb: string }[] = [
  {
    name: '@flare-kit/core',
    blurb: 'The durable operation lifecycle: intent, quote, plan, execution, evidence, recovery. Headless.',
  },
  {
    name: '@flare-kit/react',
    blurb: 'Provider and hooks over the lifecycle. A live kit or the mock, unchanged.',
  },
  {
    name: '@flare-kit/react-ui',
    blurb: 'Styled, embeddable widgets — hand-written CSS on the DESIGN.md tokens.',
  },
  {
    name: '@flare-kit/contracts',
    blurb: 'Typed ABIs and the one address registry for Flare networks.',
  },
]

export function PackageStrip() {
  return (
    <section className="section-tight">
      <div className="container">
        <p className="eyebrow">The packages</p>
        <ul className="pkg-strip">
          {PACKAGES.map((pkg) => (
            <li key={pkg.name} className="pkg">
              <span className="pkg-name mono">{pkg.name}</span>
              <span className="pkg-blurb">{pkg.blurb}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
