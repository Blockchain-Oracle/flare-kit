/**
 * Why the kit is shaped the way it is. Deliberately not a three-equal-card grid
 * (DESIGN.md anti-reference, docs-site R13): an asymmetric split — the framing on
 * the left, a numbered list of real principles on the right. Every line is a rule
 * the kit actually enforces, not a marketing claim.
 */
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'One lifecycle for every operation',
    body: 'Mint, swap, attest and stake share one durable record, one spine and one recovery matrix — not a screen each that drifts apart.',
  },
  {
    title: 'It never fakes an outcome',
    body: 'A submitted operation is never shown as succeeded, and an unknown result is never shown as failed. A partial outcome stays partial.',
  },
  {
    title: 'Long waits are legible',
    body: 'A multi-chain wait is never a spinner. Every wait names its stage, the actor being waited on, the expected end and your safe action.',
  },
  {
    title: 'Network is configuration',
    body: 'Testnet first, mainnet-capable. Every address comes from one registry, so moving networks is a change of construction, not a rewrite.',
  },
]

export function Principles() {
  return (
    <section className="section-tight">
      <div className="container principles">
        <div className="principles-head">
          <p className="eyebrow">Why it is shaped this way</p>
          <h2 className="h-sec">Built for operations that take time.</h2>
          <p className="lede">
            A direct FXRP mint spans 8–15 minutes across three actors. The kit is designed around
            that, not around the happy second.
          </p>
        </div>
        <ol className="principles-list">
          {PRINCIPLES.map((item, index) => (
            <li key={item.title} className="principle">
              <span className="principle-n mono" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="principle-body">
                <h3 className="principle-title">{item.title}</h3>
                <p className="principle-text">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
