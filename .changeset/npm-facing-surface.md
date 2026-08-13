---
'@flare-kit/contracts': minor
'@flare-kit/core': minor
'@flare-kit/react': minor
'@flare-kit/react-ui': minor
---

Add the npm-facing surface: a README and a LICENSE per package, and the
registry metadata every package was missing.

Each package now ships a README on one skeleton — what it is, install, one
complete runnable example, and a link to the documentation. The required peers
appear in the install command rather than in a section of their own, which is
what every comparable package does. `@flare-kit/contracts` is longer and
self-contained, carrying its networks table and capability flags inline,
because a registry package has no docs-site page to link to.

`repository`, `homepage`, `bugs`, `author` and `keywords` were absent from
every manifest. Without `repository` npm cannot rewrite links at all and the
package sidebar carries no source link.

`@flare-kit/react` and `@flare-kit/react-ui` now declare `viem` as a peer
dependency. Both depend on `@flare-kit/core`, which requires it, and peer
dependencies are not transitive — so installing either one directly left the
requirement undeclared and the install command unable to name it honestly.

Every package declared MIT while the repository contained no licence text at
all. Each package now carries its own copy, since npm packs only from within a
package directory.
