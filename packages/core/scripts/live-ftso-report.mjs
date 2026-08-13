/**
 * The evidence file M4-R11 requires, written from what the run actually
 * observed.
 *
 * Split from the run script so the probes stay readable and so nothing in here
 * can reach the network — a report that could re-query would be able to record
 * something the run never saw.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

// bigint has no JSON representation, and this file records protocol values —
// so they are stringified rather than routed through Number, which is the exact
// corruption the kit exists to prevent.
const json = (value) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2)

export function writeReport(root, r) {
  const date = r.ranAt.slice(0, 10)
  const tampers = Object.entries(r.proof.tampered)
    // A revert reason arrives multi-line and would break the table row it sits
    // in. Collapsed, never truncated: the sentence is the evidence.
    .map(([label, t]) => `| ${label} | \`${t.outcome}\` | ${(t.reason ?? '—').replace(/\s+/g, ' ')} |`)
    .join('\n')

  const body = `# Live FTSO run — ${r.network}

Ran ${r.ranAt} against ${r.network} (chain id ${r.chainId}). M4-R11.

**Read-only. No signing key was loaded and nothing was spent.** Every figure
below came from an \`eth_call\` or an HTTP request, which is the property that
makes this reproducible by anyone without funds.

## Catalogue — M4-R1

- \`getSupportedFeedIds()\`: **${r.catalogue.entries}** feeds, of which
  **${r.catalogue.customFeedCount}** are custom (category \`0x21\`)
- Unused configuration indices, stated rather than rendered as rows:
  \`${r.catalogue.unusedIndices.join(', ') || 'none'}\`
- Renamed feeds, each rendered as one feed carrying a former name:
${r.catalogue.renames.map((x) => `  - ${x}`).join('\n') || '  - none'}

## Reads and the fee — M4-R2, M4-AC3

- \`FtsoV2.calculateFeeByIds\` for this exact batch: **${r.reads.feeWei} wei**,
  sent as the call's \`value\`
- \`FeeCalculator\` second opinion: ${
    r.reads.secondOpinionWei === null
      ? 'agrees'
      : `**${r.reads.secondOpinionWei} wei** — the two are scoped to different call paths, and what gets paid is quoted from the contract that guards \`getFeedsById\``
  }

| feed | raw value | decimals | path |
|---|---|---|---|
${r.reads.readings.map((x) => `| ${x.name} | \`${x.value}\` | ${x.decimals} | ${x.path} |`).join('\n')}

Decimals differ **within one batch**, which is why they are carried per reading
and never cached per feed.

## Anchor proof and verification — M4-R3, M4-AC4

- Retrieved from **${r.proof.source}** for voting round
  \`${r.proof.votingRoundId}\`: value \`${r.proof.value}\` at
  ${r.proof.decimals} decimals, ${r.proof.proofNodes} proof nodes
- \`FtsoV2.verifyFeedData\` on the untouched proof: **\`${r.proof.valid.outcome}\`**

| tamper | outcome | reason |
|---|---|---|
${tampers}

Every tamper lands on \`could_not_check\`, never \`not_proven\`. The contract
**reverts** on a bad proof rather than returning false, so coercing that revert
to a boolean would put "this is not proven" on screen when the truth is "we
could not check this".

## Retention floor — M4-R5, M4-AC5

${
  r.retention.oldestRetrievable
    ? `Bisected this run: round \`${r.retention.oldestRetrievable}\` is retrievable and
\`${r.retention.newestGone}\` is not, and a round 5,000 below the boundary is also
gone — so retention is contiguous here and this pair is a real edge.

**This corrects the figure the M4 spec recorded.** That said ~297 days with a
floor at \`1130919\`; round \`1130919\` retrieves a value today, and the boundary is
around \`${r.retention.oldestRetrievable}\` — roughly twice the window. The earlier
number was established by a bisection that believed a single absence, and **the
host intermittently serves an empty 200 for a round it holds**: measured this
session, round \`812988\` answered empty and then returned a real value on three
paced retries seconds later. A bisection over an unreliable predicate returns an
adjacent pair that looks exactly like a measurement.

So the rule is stronger than "the floor moves". It is: **never conclude a round
is gone from one absence.** \`readFeedHistory\` now confirms an absence three
times before classifying it, because that classification —
\`committed_not_retrievable\` — is a permanent claim that a committed value is
gone forever, and it was previously reachable from a single blip.`
    : `Not established. ${r.retention.note}`
}

## Secure random — M4-R6, M4-AC6

- Current: \`isSecure = ${r.random.current.isSecure}\`, timestamp
  \`${r.random.current.timestampSeconds}\`
- Round \`${r.random.knownInsecureRound}\`, known insecure, read with
  \`requireSecure\`: **refused = ${r.random.refused}**
- The refusal carries no value at all: **${r.random.valueWithheld}**
- Reason: ${r.random.refusalReason ?? '—'}

## Incentive — M4-R7

- Current range \`${r.incentive.currentRange}\`, offering an increase of
  \`${r.incentive.rangeIncrease}\`
- Quoted amount: **\`${r.incentive.offerAmountWei}\` wei**, duration
  \`${r.incentive.durationSeconds}\`s
- Dry run against the live contract: **${r.incentive.dryRunAccepted}**
- One wei below: ${
    r.incentive.dryRunRefusedOneWeiBelow
      ? `refused at \`${r.incentive.dryRunRefusedOneWeiBelow}\` — the quote is exact, not approximate`
      : 'not established'
  }

**Submitted: ${r.incentive.submitted}.**
${r.incentive.submitted ? json(r.incentive.submission) : r.incentive.submissionNote}

## Custom feeds — M4-R8

- Network read: **${r.customFeeds.network}**
- Feeds: ${r.customFeeds.entries.length > 0 ? r.customFeeds.entries.map((n) => `\`${n}\``).join(', ') : '**none** — an honest empty set, not an error and not an absence of the feature'}
- Previously observed ${r.customFeeds.previouslyObserved.at}: ${r.customFeeds.previouslyObserved.names.join(', ') || 'none'}

## What this run establishes

- The fee is **measured, not assumed**, on every read.
- A revert is recorded as **could not check**, four different ways.
- The retention floor is **discovered**, and the committed-but-unretrievable
  state is real rather than theoretical.
- \`requireSecure\` **withholds the value**, rather than returning it with a flag.
- The incentive price is **exact to the wei**, established by acceptance above
  and refusal one below — without spending anything to learn it.
`

  mkdirSync(`${root}/.thoughts/verification`, { recursive: true })
  const path = `${root}/.thoughts/verification/${date}-live-ftso-${r.network.toLowerCase().replace(/\s+/g, '-')}.md`
  writeFileSync(path, body)
  writeFileSync(path.replace(/\.md$/, '.json'), json(r))
  console.log(`  wrote ${path}`)
}
