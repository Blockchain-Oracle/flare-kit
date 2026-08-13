import type { ProposalDetailView, ProposalUnknown } from '@flare-kit/core'
import { planCastVote } from '@flare-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProposalDetail } from '../src/ProposalDetail.js'

/**
 * ProposalDetail — one proposal, in full, honestly (M12 T10).
 *
 * Grounding (Task 6): the ONLY real proposal is mainnet FTSO id=1, Defeated,
 * for `2354308387975507843417`, against `0`, thresholdBIPS `6600`, majorityBIPS
 * `5000`, totalVotePower `5217782567582675528275`. The FTSO shape carries NO
 * `votePowerBlock`, NO `hasVoted`, NO `accountVotes` — those are `undefined` and
 * must render "—", never a fabricated block / 0 / false. `castVote` is CARRIED
 * this milestone and must render declared-unbuilt, never a success.
 */

const PROPOSER = '0x1111111111111111111111111111111111111111' as `0x${string}`

// `carriedVoteReason` is REQUIRED: `planCastVote` is the one authority on why the vote path is
// carried, so the component no longer keeps its own paraphrase as a fallback.
const CARRIED = planCastVote({
  proposal: { id: 1n, source: 'ftso', state: 'defeated', proposer: PROPOSER, votePowerBlock: undefined, voteStart: 1_000n, voteEnd: 2_000n },
  reads: { votes: 0n, delegate: '0x0000000000000000000000000000000000000000' },
}).error.reason

const ftsoDefeated: ProposalDetailView = {
  id: 1n,
  source: 'ftso',
  state: 'defeated',
  proposer: PROPOSER,
  votePowerBlock: undefined, // FTSO shape: no vote-power block
  voteStart: 1_000n,
  voteEnd: 2_000n,
  for: 2_354_308_387_975_507_843_417n,
  against: 0n,
  thresholdBIPS: 6_600,
  majorityBIPS: 5_000,
  totalVotePower: 5_217_782_567_582_675_528_275n,
  hasVoted: undefined, // FTSO shape: no hasVoted
  accountVotes: undefined, // FTSO shape: no per-voter getVotes
}

const unknownDetail: ProposalUnknown = { id: 1n, source: 'ftso', state: 'unknown' }

const rowByLabel = (label: string) => screen.getByText(label).closest('.fk-row') as HTMLElement
const valueOf = (_c: HTMLElement, label: string) => rowByLabel(label).querySelector('.fk-row-v') as HTMLElement
/** The value alone, with the explanatory `.fk-row-v-sub` note stripped off. */
const bareOf = (_c: HTMLElement, label: string) => {
  const v = valueOf(_c, label)
  const sub = v.querySelector('.fk-row-v-sub')
  return ((v.textContent ?? '').replace(sub?.textContent ?? '', '')).trim()
}
const root = (c: HTMLElement) => c.querySelector('[data-vote]') as HTMLElement
const buttonByText = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').toLowerCase().includes(text.toLowerCase()))

describe('ProposalDetail — full state, tallies, BIPS, totalVotePower (mono, full precision)', () => {
  it('renders the full Defeated state and the for/against tallies at full precision in the mono face', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)

    // The lifecycle state, as a word.
    expect(screen.getByText('Defeated')).toBeInTheDocument()
    expect(root(container)?.getAttribute('data-proposal-state')).toBe('defeated')

    // Tallies at FULL precision, in the mono value cell (`.fk-row-v` is the mono face).
    expect(valueOf(container, 'For').textContent).toContain('2354.308387975507843417')
    // A real observed zero, rendered at full precision — not a hidden or dashed value.
    expect(valueOf(container, 'Against').textContent).toContain('0.000000000000000000')
  })

  it('renders the quorum threshold and majority BIPS as their exact integers in mono', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    const threshold = valueOf(container, 'Quorum threshold')
    const majority = valueOf(container, 'Majority')
    expect(threshold.textContent).toContain('6600')
    expect(threshold.querySelector('.fk-mono')).not.toBeNull()
    expect(majority.textContent).toContain('5000')
    expect(majority.querySelector('.fk-mono')).not.toBeNull()
  })

  it('renders totalVotePower HONESTLY — its real value, labelled as vote power, NOT a definitive circulating supply', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    // The real value, full precision, in the mono face.
    const tvp = valueOf(container, 'Total vote power')
    expect(tvp.textContent).toContain('5217.782567582675528275')
    // It is LABELLED as vote power, never as a definitive circulating supply for the FTSO source.
    expect(screen.getByText('Total vote power')).toBeInTheDocument()
    expect(screen.queryByText('Circulating supply')).toBeNull()
    // The disclaimer states, honestly, that it is NOT a definitive circulating supply.
    expect(tvp.textContent?.toLowerCase()).toContain('not a definitive circulating supply')
  })
})

// M-h2: unreachable today (no foundation proposal exists on either network), but the trailing
// uint is a DIFFERENT field per contract — `IGovernor` names its own `_circulatingSupply`
// authoritatively, and rendering it under "Total vote power" relabelled a named field as
// something it isn't, with the disclaimer gated on `isFtso` so it never appeared.
describe('ProposalDetail — the trailing uint is labelled PER SOURCE', () => {
  const foundationDetail: ProposalDetailView = {
    ...ftsoDefeated,
    id: 42n,
    source: 'foundation',
    state: 'active',
    votePowerBlock: 1_234n,
    hasVoted: false,
    accountVotes: 0n,
  }

  it('a foundation proposal labels it "Circulating supply" — the field IGovernor actually names', () => {
    const { container } = render(<ProposalDetail detail={foundationDetail} carriedVoteReason={CARRIED} />)
    expect(screen.getByText('Circulating supply')).toBeInTheDocument()
    expect(screen.queryByText('Total vote power')).toBeNull()
    // And it carries its own sub-line rather than silently dropping the FTSO-gated one.
    const row = valueOf(container, 'Circulating supply')
    expect(row.querySelector('.fk-row-v-sub')?.textContent?.toLowerCase()).toContain('circulatingsupply')
    // The FTSO-only disclaimer must NOT appear on a foundation proposal.
    expect(container.textContent?.toLowerCase()).not.toContain('as reported by the ftso proposal')
  })

  it('an FTSO proposal keeps "Total vote power" and its unconfirmed-total disclaimer', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    expect(screen.getByText('Total vote power')).toBeInTheDocument()
    expect(screen.queryByText('Circulating supply')).toBeNull()
    expect(valueOf(container, 'Total vote power').textContent?.toLowerCase()).toContain('not a definitive circulating supply')
  })
})

describe('ProposalDetail — the FTSO shape lacks fields, and they render "—", never fabricated', () => {
  it('votePowerBlock undefined → "—", never a fabricated block number', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    const block = bareOf(container, 'Vote-power block')
    expect(block).toBe('—')
    // No fabricated numeric block leaked into the value.
    expect(block).not.toMatch(/\d/)
  })

  it('hasVoted undefined → "—", never a fabricated Yes/No', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    const voted = bareOf(container, 'You voted')
    expect(voted).toBe('—')
    expect(voted.toLowerCase()).not.toContain('yes')
    expect(voted.toLowerCase()).not.toContain('no')
  })

  it('accountVotes undefined → "—", never a fabricated 0', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)
    const yourVp = bareOf(container, 'Your vote power')
    expect(yourVp).toBe('—')
    expect(yourVp).not.toMatch(/\d/)
  })
})

describe('ProposalDetail — castVote is CARRIED (declared-unbuilt), never a success', () => {
  it('presents the cast-vote affordance disabled, marks the surface carried, and never renders a success', () => {
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={CARRIED} />)

    // The affordance is present but not actionable — it is built and gated, never signable this milestone.
    const cast = buttonByText(container, 'cast vote')
    expect(cast).toBeDefined()
    expect(cast?.hasAttribute('disabled')).toBe(true)

    // The surface declares the vote CARRIED — never a "cast"/"voted"/success state.
    expect(root(container)?.getAttribute('data-vote')).toBe('carried')
    expect(container.querySelector('[data-vote="cast"]')).toBeNull()
    expect(container.querySelector('[data-vote="succeeded"]')).toBeNull()
    expect(container.textContent?.toLowerCase()).not.toMatch(/vote cast|vote succeeded|you voted successfully/)

    // It states WHY it is carried, honestly.
    expect(container.textContent?.toLowerCase()).toMatch(/carried|not built|awaiting/)
  })

  it('renders the caller-supplied carried reason when one is passed, still never a success', () => {
    const reason = 'castVote for the ftso proposal 1 is carried this milestone: no Active proposal is executable.'
    const { container } = render(<ProposalDetail detail={ftsoDefeated} carriedVoteReason={reason} />)
    expect(container.textContent).toContain(reason)
    expect(root(container)?.getAttribute('data-vote')).toBe('carried')
    expect(buttonByText(container, 'cast vote')?.hasAttribute('disabled')).toBe(true)
  })
})

describe('ProposalDetail — an unknown proposal renders "—", never a fabricated tally', () => {
  it('a failed detail read (ProposalUnknown) shows Unknown and every tally as "—"', () => {
    const { container } = render(<ProposalDetail detail={unknownDetail} carriedVoteReason={CARRIED} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(root(container)?.getAttribute('data-proposal-state')).toBe('unknown')

    // No fabricated tallies — every value is "—".
    expect(valueOf(container, 'For').textContent).toBe('—')
    expect(valueOf(container, 'Against').textContent).toBe('—')
    expect(valueOf(container, 'Quorum threshold').textContent).toBe('—')
    expect(valueOf(container, 'Total vote power').textContent).toBe('—')

    // A tally value never leaks a number for an unknown proposal.
    const values = [...container.querySelectorAll('.fk-row-v')].map((e) => e.textContent ?? '')
    expect(values.some((v) => /\d/.test(v))).toBe(false)
  })
})
