/**
 * The identifiers an operation correlates. R-OP-002: the operation is
 * identified by none of these, and correlates all of them.
 */
export type EvidenceKind =
  | 'xrpl_tx'
  | 'xrpl_ledger'
  | 'xrpl_destination'
  | 'payment_reference'
  | 'flare_tx'
  | 'flare_block'
  | 'fdc_request'
  | 'fdc_round'
  | 'fdc_proof'
  /**
   * An FTSO scaling proof. Kept apart from `fdc_proof` even though both settle
   * on the same Relay: they are two protocols — 100 and 200 — with independent
   * finality, so labelling an anchor-feed proof `fdc_proof` would name the wrong
   * protocol on a value somebody is about to verify.
   */
  | 'ftso_proof'
  | 'executor_address'
  | 'recipient_address'
  /** The id the protocol assigned to this request — a redemption request id. */
  | 'reservation_id'
  /** The agent counterparty obliged to pay a redemption. */
  | 'agent_vault'

/**
 * One anatomy everywhere: a mono type label, a truncated identifier, and the
 * full value behind a copy control. Identical in the widget, the timeline, the
 * receipt, the operator console and the support workspace (DESIGN.md).
 */
export interface EvidenceItem {
  readonly kind: EvidenceKind
  readonly label: string
  readonly value: string
  readonly href?: string
  /** When we first saw it, not when it happened. */
  readonly observedAt: number
}

export function evidence(init: EvidenceItem): EvidenceItem {
  return Object.freeze({ ...init })
}

/**
 * Absorbs newly observed identifiers. Idempotent by (kind, value), because
 * protocol events arrive duplicated, out of order and backfilled (R-LIFE-005),
 * and none of that may duplicate or drop what we know.
 */
export function mergeEvidence(
  existing: readonly EvidenceItem[],
  incoming: readonly EvidenceItem[],
): EvidenceItem[] {
  const merged = [...existing]
  for (const item of incoming) {
    const at = merged.findIndex((e) => e.kind === item.kind && e.value === item.value)
    if (at === -1) {
      merged.push(evidence(item))
      continue
    }
    const known = merged[at]
    if (!known) continue
    merged[at] = evidence({
      kind: known.kind,
      label: known.label || item.label,
      value: known.value,
      // A later sighting may supply a link we did not have; it never revises
      // when we first saw the identifier.
      ...(known.href ?? item.href ? { href: known.href ?? item.href } : {}),
      observedAt: Math.min(known.observedAt, item.observedAt),
    })
  }
  return merged
}

export function findEvidence(
  list: readonly EvidenceItem[],
  kind: EvidenceKind,
): EvidenceItem | undefined {
  return list.find((item) => item.kind === kind)
}

function truncate(value: string, head: number, tail: number): string {
  return value.length > head + tail + 1
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value
}

/** Addresses truncate first-6 / last-4 (DESIGN.md). */
export function truncateAddress(value: string): string {
  return truncate(value, 6, 4)
}

/** Hashes truncate first-10 / last-6 (DESIGN.md). */
export function truncateHash(value: string): string {
  return truncate(value, 10, 6)
}
