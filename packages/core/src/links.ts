import {
  UnsupportedNetworkError,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTxUrl,
  underlyingExplorerAccountUrl,
  underlyingExplorerLedgerUrl,
  underlyingExplorerTxUrl,
} from '@flarekit-dev/contracts'
import type { ChainFamily } from './account.js'
import { type EvidenceItem, type EvidenceKind, evidence } from './evidence.js'

/**
 * Where each identifier can actually be looked up.
 *
 * M2-R6 and R-DATA-007: the link follows the operation's real network and the
 * identifier's own chain. A mint holds an XRPL payment, an FDC round and a
 * Flare execution at once, and each belongs to a different explorer — or, for
 * the round, to none. Guessing a URL for the ones no explorer indexes would
 * dress a 404 up as evidence, so those say so instead.
 */

export interface EvidenceLink {
  readonly href?: string
  /** Present exactly when there is no link, and always says why. */
  readonly unsupportedReason?: string
}

type Builder = (chainId: number, value: string) => string

const BUILDERS: Partial<Record<EvidenceKind, Builder>> = {
  xrpl_tx: underlyingExplorerTxUrl,
  xrpl_ledger: underlyingExplorerLedgerUrl,
  xrpl_destination: underlyingExplorerAccountUrl,
  flare_tx: explorerTxUrl,
  flare_block: explorerBlockUrl,
  recipient_address: explorerAddressUrl,
  executor_address: explorerAddressUrl,
  agent_vault: explorerAddressUrl,
}

/**
 * The identifiers that are real and verifiable but have no explorer page. Each
 * carries the reason a surface shows beside the copyable value.
 */
const NO_EXPLORER: Partial<Record<EvidenceKind, string>> = {
  fdc_request: 'No block explorer indexes Flare Data Connector requests. Copy the identifier to check it against the attestation provider.',
  fdc_round: 'A voting round is not a transaction, so no block explorer shows it. Copy the round number to check it against the Data Connector.',
  fdc_proof: 'A Merkle proof is not a transaction, so no block explorer shows it. Copy it to verify it yourself.',
  ftso_proof: 'A Merkle proof is not a transaction. Copy it and check it yourself against FtsoV2.verifyFeedData.',
  payment_reference: 'A payment reference is carried inside the XRPL payment, not indexed on its own. Open the payment to see it.',
  reservation_id: 'A request id is protocol state rather than a transaction, so no block explorer shows it.',
}

export function explorerLink(item: EvidenceItem, chainId: number): EvidenceLink {
  const build = BUILDERS[item.kind]
  if (!build) {
    return { unsupportedReason: NO_EXPLORER[item.kind] ?? 'No explorer covers this identifier.' }
  }
  try {
    return { href: build(chainId, item.value) }
  } catch (error) {
    if (error instanceof UnsupportedNetworkError) {
      // Never a link to a default network: that would send a person to another
      // chain's explorer and show them somebody else's transaction.
      return { unsupportedReason: error.message }
    }
    throw error
  }
}

/**
 * Where a connected *account* can be looked up. Deliberately separate from
 * `explorerLink`: an account address is identity, not operation evidence, so it
 * never becomes an `EvidenceKind` (re-cut 2026-08-09). Only the EVM leg links —
 * its `NetworkRef` carries the chain id `explorerAddressUrl` needs. The XRP
 * Ledger identity has no chain id (its underlying is a paired network, not a
 * chain of its own), so its account stays copy-only rather than being linked to
 * a guessed ledger, the same refusal the evidence path makes for an identifier
 * no explorer indexes.
 */
export function accountExplorerLink(
  family: ChainFamily,
  address: string,
  chainId?: number,
): EvidenceLink {
  if (family !== 'evm') {
    return {
      unsupportedReason:
        'An XRP Ledger account is shown here for identity; copy it to open it in a ledger explorer.',
    }
  }
  if (chainId === undefined) {
    return {
      unsupportedReason: 'This account is copy-only until its network — and so its explorer — is known.',
    }
  }
  try {
    return { href: explorerAddressUrl(chainId, address) }
  } catch (error) {
    if (error instanceof UnsupportedNetworkError) {
      return { unsupportedReason: error.message }
    }
    throw error
  }
}

/**
 * Fills in the links a list of evidence can carry, leaving the identifiers,
 * their labels and their observation times exactly as they were. A producer
 * that already knew a link keeps it.
 */
export function linkEvidence(
  items: readonly EvidenceItem[],
  chainId: number,
): readonly EvidenceItem[] {
  return items.map((item) => {
    if (item.href) return item
    const { href } = explorerLink(item, chainId)
    return href ? evidence({ ...item, href }) : item
  })
}
