import type { ProposalSummary } from '@flare-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProposalCatalogue } from '../src/ProposalCatalogue.js'

/**
 * ProposalCatalogue — the mainnet-read proposal lens (M12 T10).
 *
 * The load-bearing discipline (mirrors AttestationCatalogue): the three
 * outcomes of `useProposals` stay three. `undefined`-with-error (the discovery
 * read FAILED) is UNAVAILABLE, `[]` (a confirmed-empty discovery) is
 * honest-empty, and a non-empty array is rows — and the first two must render
 * DIFFERENTLY, because collapsing them turns an RPC outage into a false "no
 * proposals" claim about the network. Never a fabricated row.
 */

const PROPOSER = '0x1111111111111111111111111111111111111111' as `0x${string}`
const PROPOSER2 = '0x2222222222222222222222222222222222222222' as `0x${string}`

// The ONLY real proposal (Task 6): mainnet FTSO id=1, state Defeated.
const ftsoDefeated: ProposalSummary = {
  id: 1n,
  source: 'ftso',
  state: 'defeated',
  proposer: PROPOSER,
  votePowerBlock: undefined, // FTSO shape carries none — never fabricated
  voteStart: 1_000n,
  voteEnd: 2_000n,
}

const foundationActive: ProposalSummary = {
  id: 42n,
  source: 'foundation',
  state: 'active',
  proposer: PROPOSER2,
  votePowerBlock: 1_234n,
  voteStart: 10n,
  voteEnd: 20n,
}

const row = (c: HTMLElement, id: string) => c.querySelector(`tr[data-proposal="${id}"]`)
const dataRows = (c: HTMLElement) => c.querySelectorAll('tr[data-proposal]')
const availability = (c: HTMLElement) => c.querySelector('[data-availability]')?.getAttribute('data-availability')
const noteTitles = (c: HTMLElement) => [...c.querySelectorAll('.fk-note-title')].map((e) => e.textContent ?? '')

describe('ProposalCatalogue — a discovered proposal: id + state + the cross-network label', () => {
  it('renders each proposal with its id (mono), its state, and a "Flare mainnet" label on every row', () => {
    const { container } = render(<ProposalCatalogue proposals={[ftsoDefeated, foundationActive]} loading={false} />)

    // Both proposals are rows, keyed by their real ids.
    expect(dataRows(container).length).toBe(2)
    expect(row(container, '1')).not.toBeNull()
    expect(row(container, '42')).not.toBeNull()

    // The id renders in the mono face (exact value).
    const idCell = row(container, '1')!.querySelector('.fk-mono')
    expect(idCell?.textContent).toContain('1')

    // The state renders as a word (colour is never the first signal).
    expect(screen.getByText('Defeated')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()

    // A cross-network label on EVERY row: this is a read lens onto Flare mainnet
    // even though the write target is Coston2.
    const labels = screen.getAllByText('Flare mainnet')
    expect(labels.length).toBe(2)
  })

  it('carries the row state onto the <tr> so it can be tested and styled, not just coloured', () => {
    const { container } = render(<ProposalCatalogue proposals={[ftsoDefeated]} loading={false} />)
    expect(row(container, '1')?.getAttribute('data-state')).toBe('defeated')
    expect(row(container, '1')?.getAttribute('data-source')).toBe('ftso')
    expect(availability(container)).toBe('listed')
  })

  // The caption is `fk-sr` (the table's accessible name) and the note title is VISIBLE. Both
  // state which chain was read, so both must track `networkLabel` — a hardcoded "Flare
  // mainnet" makes exactly the whole-surface network claim the per-row labels exist to avoid.
  // Asserted TOGETHER, in the same case, so the pair cannot drift apart again: the note title
  // renders only when `availability === 'listed'`, which is why the earlier `proposals={[]}`
  // case never exposed it.
  it('names the table AND titles the note after the network actually read — never a hardcoded mainnet', () => {
    const mainnet = render(<ProposalCatalogue proposals={[ftsoDefeated]} loading={false} />)
    expect(mainnet.container.querySelector('caption')?.textContent).toBe('Proposals on Flare mainnet')
    expect(noteTitles(mainnet.container)).toContain('Read from Flare mainnet')

    const coston2 = render(<ProposalCatalogue proposals={[ftsoDefeated]} loading={false} networkLabel="Coston2" />)
    expect(coston2.container.querySelector('caption')?.textContent).toBe('Proposals on Coston2')
    expect(noteTitles(coston2.container)).toContain('Read from Coston2')
    // The whole point: nothing anywhere in the Coston2 render says "Flare mainnet".
    expect(coston2.container.textContent).not.toContain('Flare mainnet')
  })
})

describe('ProposalCatalogue — the three outcomes stay three (undefined ≠ [] ≠ rows)', () => {
  it('`[]` (a confirmed-empty discovery) is honest-empty — never a fabricated row', () => {
    const { container } = render(<ProposalCatalogue proposals={[]} loading={false} />)
    expect(container.textContent?.toLowerCase()).toContain('no active proposals on this network')
    // Nothing failed — this is an observed-empty, not an outage.
    expect(dataRows(container).length).toBe(0)
    expect(availability(container)).toBe('empty')
  })

  it('`undefined` + error is UNAVAILABLE, and renders DIFFERENTLY from honest-empty', () => {
    const empty = render(<ProposalCatalogue proposals={[]} loading={false} />)
    const unavail = render(<ProposalCatalogue proposals={undefined} loading={false} error="RPC endpoint unreachable" />)

    // The two are distinct claims and must be distinguishable.
    expect(availability(empty.container)).toBe('empty')
    expect(availability(unavail.container)).toBe('unavailable')

    // The honest-empty sentence appears ONLY for the confirmed-empty read.
    expect(empty.container.textContent?.toLowerCase()).toContain('no active proposals on this network')
    expect(unavail.container.textContent?.toLowerCase()).not.toContain('no active proposals on this network')

    // Unavailable surfaces the failure (and the reason), never an empty claim.
    expect(unavail.container.textContent?.toLowerCase()).toContain('unavailable')
    expect(unavail.container.textContent).toContain('RPC endpoint unreachable')

    // Never a fabricated row in either non-rows state.
    expect(dataRows(unavail.container).length).toBe(0)
  })

  // M-h1: unreachable from `useProposals`, but this is a PUBLISHED component and a host
  // driving it from its own read can land here. It used to fall through to 'listed' with zero
  // rows and no note — a completely blank table, which reads as "none".
  it('`undefined` with no error and nothing loading is NOT-READ, never a silent blank table', () => {
    const { container } = render(<ProposalCatalogue proposals={undefined} loading={false} />)
    expect(availability(container)).toBe('not-read')
    expect(dataRows(container).length).toBe(0)
    // It says so, rather than presenting nothing.
    expect(container.textContent?.toLowerCase()).toContain('no discovery read has run yet')
    // And it never borrows the confirmed-empty sentence.
    expect(container.textContent?.toLowerCase()).not.toContain('no active proposals on this network')
  })

  it('while loading (undefined, no error) shows skeletons, never a fabricated row', () => {
    const { container } = render(<ProposalCatalogue proposals={undefined} loading={true} />)
    expect(availability(container)).toBe('loading')
    expect(dataRows(container).length).toBe(0)
    expect(container.querySelector('.fk-skeleton')).not.toBeNull()
    // Loading is NOT honest-empty and NOT unavailable.
    expect(container.textContent?.toLowerCase()).not.toContain('no active proposals on this network')
  })
})
