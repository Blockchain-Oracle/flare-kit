// packages/react-ui/src/claim-card-notes.ts
import type { CardNote } from './card-chrome.js'
import type { ClaimStateKey } from './claim-card-state.js'

/**
 * The ClaimCard's human-facing state notes — split from `claim-card-state.ts` (M11 Task 11) to
 * keep both files under the 300-line limit. Every empty/gated state is a DECLARED unknown carrying
 * its OWN copy, never a fabricated amount: `ftso-empty` invites delegation, `ftso-proof-unavailable`
 * names the epoch, `flaredrop-concluded` states the archive, `staking-empty` is a NON-EXPIRING
 * delayed leg (no epoch boundary), and `unavailable` is a read that never landed — not empty.
 */

export interface ClaimNoteContext {
  /** The DECLARED proof-unavailable epoch (from the plan error or the reads). */
  readonly epoch?: number | undefined
  /** The date the FlareDrop concluded (Coston2: 2026-01-30). */
  readonly endedAt?: string
}

/** The honest note for a state, or `null` for a plain claimable one. */
export function claimStateNote(state: ClaimStateKey, ctx: ClaimNoteContext = {}): CardNote | null {
  switch (state) {
    case 'not-verified':
      return {
        tone: 'bad',
        title: 'Claim not built here',
        body: 'No reward claim has been driven live on this network in this build, so the kit will not sign one. The claim is carried unverified — not yet available, never a fabricated success.',
      }
    case 'ftso-empty':
      return {
        tone: 'info',
        title: 'Nothing earned yet — delegate to earn',
        body: 'You have no claimable FTSO delegation rewards across this epoch range. Delegate your wrapped balance to an FTSO provider to start earning — the kit shows nothing rather than a fabricated amount.',
      }
    case 'ftso-proof-unavailable':
      return {
        tone: 'att',
        title: 'Proof declared unavailable',
        body: `The reward${ctx.epoch !== undefined ? ` for epoch ${ctx.epoch}` : ''} has no Merkle proof on the unofficial mirror, so it is declared unavailable — not a claimable amount, and not zero.`,
      }
    case 'ftso-expiring':
      return {
        tone: 'att',
        title: 'Expiring — claim before it lapses',
        body: 'A claimable reward is at or past the on-chain expire-next boundary. Delegation rewards lapse after a 25-epoch window (unlike non-expiring staking rewards) — claim it before it expires.',
      }
    case 'rnat-empty':
      return {
        tone: 'info',
        title: 'No RNat account',
        body: 'No project has assigned you RNat rewards on this network, so there is nothing to claim or withdraw here.',
      }
    case 'flaredrop-concluded':
      return {
        tone: 'info',
        title: 'Distribution concluded',
        body: `The Coston2 FlareDrop distribution concluded${ctx.endedAt ? ` on ${ctx.endedAt}` : ''}. This is a read-only archive — there is no new drop to claim.`,
      }
    case 'staking-empty':
      return {
        tone: 'info',
        title: 'No staking rewards yet',
        body: 'You have no claimable validator staking rewards on this network yet. Staking rewards accrue while your stake is active and are paid as a delayed leg — the kit shows nothing rather than a fabricated amount. They do not expire.',
      }
    case 'unavailable':
      return {
        tone: 'att',
        title: 'Rewards unavailable',
        body: "The last read didn't land, so your rewards are unknown — not empty. It refreshes on the next read.",
      }
    default:
      return null
  }
}
