// packages/react-ui/src/instruction-visuals.ts
// The instruction vocabulary comes through `@flare-kit/core`, which re-exports it from
// `@flare-kit/contracts` precisely so this package needs no second dependency on the
// registry — the treatment every other registry type gets here.
import type {
  Amount,
  BuiltInInstruction,
  InstructionAvailability,
  ValueDenomination,
} from '@flare-kit/core'
import { amount, formatExact } from '@flare-kit/core'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * The instruction vocabulary the three M13 surfaces share (M13-R10).
 *
 * It exists because the SAME 80-bit value field means five different things across the
 * eleven built-in instructions. A renderer that printed it as a bare number would show
 * `20260813` for an Upshift claim and `3` for a redeem in the same column, both looking like
 * amounts, and neither being one. Every value that leaves this file names its denomination.
 *
 * The other reason is the catalogue/composer split: the catalogue describes an instruction
 * the user has NOT chosen (so it has no intent to describe), while the composer describes
 * one they have (so `plan.downstream` — the planner's own sentence — is authoritative and
 * this file must not restate it differently). The copy here is the un-instantiated half.
 */

/** Colour is never the first signal: every availability carries a glyph and a word. */
export const INSTRUCTION_AVAILABILITY_VISUAL: Record<
  InstructionAvailability['kind'],
  { tone: Tone; glyph: Glyph; word: string }
> = {
  available: { tone: 'ok', glyph: 'done', word: 'Available' },
  // Not a failure and not a gap in this deployment — the protocol moved on.
  superseded: { tone: 'neutral', glyph: 'unknown', word: 'Superseded' },
  unavailable: { tone: 'att', glyph: 'failed', word: 'Not served here' },
  // The distinction the whole catalogue turns on: we could not look, so we claim nothing.
  unknown: { tone: 'neutral', glyph: 'unknown', word: 'Unknown' },
}

/** Drops and shares are smallest units; lots, periods and dates are not amounts at all. */
const DENOMINATION_NOUN: Record<ValueDenomination, string> = {
  drops: 'drops',
  lots: 'lots',
  shares: 'shares',
  period: 'withdrawal period',
  date: 'claim date (yyyymmdd)',
}

export function denominationNoun(denomination: ValueDenomination): string {
  return DENOMINATION_NOUN[denomination]
}

/**
 * The reference's value field with its denomination named, always.
 *
 * A period index and a `yyyymmdd` date read as identifiers rather than quantities, so they
 * lead with their noun; the three quantities trail theirs, the way an amount does.
 */
export function denominatedValue(value: bigint, denomination: ValueDenomination): string {
  if (denomination === 'period') return `withdrawal period ${value}`
  if (denomination === 'date') return `${value} (yyyymmdd claim date)`
  return `${value} ${DENOMINATION_NOUN[denomination]}`
}

/** `FXRP · transfer` — the controller's own action name, under its instruction type. */
export function instructionLabel(instruction: BuiltInInstruction): string {
  const type = instruction.type === 'fxrp' ? 'FXRP' : instruction.type === 'firelight' ? 'Firelight' : 'Upshift'
  return `${type} · ${instruction.action}`
}

/** `0x11` — the full first byte, always two digits, because that is what travels. */
export function instructionIdHex(id: number): string {
  return `0x${id.toString(16).padStart(2, '0')}`
}

/**
 * What the personal account would do, described WITHOUT an intent.
 *
 * Deliberately not the planner's `downstream` sentence: that one quotes the user's actual
 * value, vault and recipient, and can only be written once those exist. This is the row
 * copy for an instruction nobody has composed yet.
 */
const EFFECT: Record<number, string> = {
  0x00: 'Reserves FAsset collateral with an agent vault, the first half of the legacy minting flow.',
  0x01: 'Transfers FAsset from the personal account to an EVM recipient carried in the reference.',
  0x02: 'Redeems whole FAsset lots back to native XRP, paying the executor from the dispatch value.',
  0x10: 'Reserves collateral and deposits the minted FAsset into a Firelight vault, in one command.',
  0x11: 'Deposits FAsset from the personal account into a Firelight vault, issuing shares to it.',
  0x12: 'Redeems Firelight vault shares held by the personal account.',
  0x13: 'Claims a matured Firelight withdrawal for the given period index.',
  0x20: 'Reserves collateral and deposits the minted FAsset into an Upshift vault, in one command.',
  0x21: 'Deposits FAsset from the personal account into an Upshift vault, issuing shares to it.',
  0x22: 'Requests redemption of Upshift vault shares — a request, not an instant exit.',
  0x23: 'Claims a matured Upshift redemption for the given yyyymmdd date.',
}

export function instructionEffect(instruction: BuiltInInstruction): string {
  // Never a fabricated sentence for an id the table does not describe: an unnamed effect is
  // better than a confident wrong one, and the row still shows the action and denomination.
  return EFFECT[instruction.id] ?? `Dispatches ${instruction.action} on the personal account.`
}

/**
 * A drops value as the XRP-side amount it is, at full 6-decimal precision.
 *
 * The asset comes from the deployment's own `sourceId` (`testXRP` / `XRP`) — read, never a
 * constant — because the fee and the payment are XRP the user actually sends. FAsset drops
 * are NOT converted this way anywhere: the controller never tells us the FAsset's symbol,
 * so an FAsset value keeps its `drops` noun rather than borrowing a symbol we did not read.
 */
export function xrpAmount(drops: bigint, sourceId: string): Amount {
  return amount(drops, 6, sourceId)
}

export function xrpAmountLabel(drops: bigint, sourceId: string): string {
  return formatExact(xrpAmount(drops, sourceId))
}

/**
 * An unread `bigint` is `—`, an observed `0` is `0`. The distinction is the point: a real
 * blank-slate account genuinely reads nonce 0 and balance 0, and a failed read must not wear
 * those values.
 *
 * Lives here rather than in a card's own state file because both the card and the catalogue
 * need it, and two copies of this rule would be two chances to get the emptiest value in the
 * kit wrong.
 */
export function unreadOr(value: bigint | undefined, suffix?: string): string {
  if (value === undefined) return '—'
  return suffix ? `${value} ${suffix}` : `${value}`
}

/** An unread fee is `—`, never the default and never a zero. A real 0 renders as `0 drops`. */
export function feeDropsLabel(feeDrops: bigint | undefined): string {
  return unreadOr(feeDrops, 'drops')
}
