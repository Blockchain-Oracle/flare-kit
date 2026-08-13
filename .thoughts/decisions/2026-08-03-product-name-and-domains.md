# Decision: Product Name, npm Namespace and Domains

Date: 2026-08-03
Status: accepted by Abu in session on 2026-08-03
Closes: the "final product name and package namespace" open question carried in
`specs/2026-08-03-flare-application-layer.md`, `stories/...`, and
`design/2026-08-03-product-surface-map.md`

## Decision

| Item | Value |
| --- | --- |
| Product name | **flare-kit** |
| npm scope | `@flare-kit/*` |
| Unscoped npm name | `flare-kit` (reserve, even if unused) |
| Scaffolder | `create-flare-kit-app`, invoked as `npm create flare-kit-app` |
| Primary domain | **flare-kit.xyz** |
| Documentation | `flare-kit.xyz/docs` |
| The application | `app.flare-kit.xyz` |

Renamed from "demo" to "app" on 2026-08-04 at Abu's decision. It is a real
working product built on the published packages, not a demonstration of one.
"Demo" invites shortcuts and reads as disposable; "app" does not.

Written form is always hyphenated: **flare-kit**, never "flarekit" and never
"FlareKit". The hyphen is load-bearing; see the collision below.

## Evidence gathered 2026-08-03

Checked against the npm registry and DNS on the day of the decision:

| Candidate | Result |
| --- | --- |
| npm `flare-kit` | free |
| npm `create-flare-kit-app` | free |
| npm `flarekit` | **taken** — a CLI for creating Cloudflare Hono Worker projects |
| npm `flarestack` | free |
| npm `lantern-kit`, `flintkit` | taken |
| `flarekit.xyz` | registered, resolves to a placeholder |
| `flarekit.dev` | registered |
| `flare-kit.xyz` | no DNS record, appears unregistered |
| `flarekit.sh` | no DNS record, appears unregistered |
| `flarestack.xyz` / `.dev` | no DNS record, appears unregistered |

The npm organisation scope `@flare-kit` could not be proven free through the
public registry API and must be confirmed at organisation creation. If it is
taken, the fallback is `@flarekit-dev` with the product name unchanged, and
this decision is amended rather than reopened.

## Why this and not the alternatives

- **The unhyphenated form is unusable.** `flarekit` on npm is a Cloudflare
  Workers tool, and "flarekit" reads as Cloudflare-adjacent to anyone
  skimming. The hyphen removes both the package collision and the
  misreading.
- **It mirrors the participant's own prior product.** cdr-kit established the
  pattern; anyone who has seen that work reads flare-kit correctly on sight.
  The brief asked for "the Wagmi for Flare", and a descriptive, boring name is
  what makes that legible to a judge or an integrator in one glance.
- **flarestack was cleaner but weaker.** Every name and domain was free, and it
  carries the most trademark distance, but it reads as infrastructure rather
  than a component kit and discards the "kit" association entirely.
- **flarekit.sh was the recommendation and was not selected.** Abu chose
  `.xyz` for continuity with cdrkit.xyz. Recorded so the trade is not revisited.

## Risks accepted

1. **Affiliation ambiguity.** The name leads with the protocol's name. This is
   normal for community ecosystem tooling but is not neutral. Mitigation, which
   is now a requirement: every published surface (site footer, every package
   README, the repository README) carries an explicit statement that the
   project is community-built and not an official Flare Networks product. If
   the Flare Foundation objects or later adopts the project, the name is
   renegotiated; the package topology does not depend on the name.
2. **Hyphenated domain.** `flare-kit.xyz` is marginally harder to say aloud and
   to type than an unhyphenated domain. Accepted deliberately.
3. **Squatting on the near-miss.** `flarekit.xyz` is already registered by a
   third party. There is a permanent risk of traffic leaking there. Not
   mitigable; noted.

## Immediate actions

- Register `flare-kit.xyz` and point `app.` at a separate deployment target.
- Create the npm organisation and confirm the `@flare-kit` scope, or trigger
  the documented fallback.
- Reserve the unscoped `flare-kit` package name.
- Add the non-affiliation statement to the site footer, the repository README
  and every package README template.

## Consequences for existing artifacts

- The distribution addendum's out-of-scope list no longer defers name, scope or
  domain.
- The design specimen already renders `flare-kit` and `@flare-kit/*`; those
  fixtures are now correct rather than illustrative placeholders, though every
  other value on those pages remains `Illustrative`.
- The demo application specified at `R-DEMO-001` resolves to
  `app.flare-kit.xyz`.

## Provenance

- Availability evidence: npm registry and DNS queries run in session 2026-08-03.
- Naming precedent: cdr-kit and cdrkit.xyz.
- Original brief: "Think of it's like the Wagmi for Flare, but this time, it
  consists of components, it consists of like libraries, SDKs, it consists of
  widgets, and also it consists of AI agents too."
