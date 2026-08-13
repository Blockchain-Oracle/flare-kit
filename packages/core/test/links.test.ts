import { describe, expect, it } from 'vitest'
import { evidence } from '../src/evidence.js'
import { accountExplorerLink, explorerLink, linkEvidence } from '../src/links.js'

// M2-R6: "Explorer links are generated from the operation's actual network and
// identifier, covering Flare and XRPL separately." — R-DATA-007.
// R-DATA-003: a mint's XRPL payment, FDC round and Flare execution stay three
// identifiers, never one.

const COSTON2 = 114
const FLARE = 14

const item = (kind: Parameters<typeof evidence>[0]['kind'], value: string) =>
  evidence({ kind, label: kind, value, observedAt: 1_000 })

describe('explorerLink', () => {
  it('sends an XRPL payment to the XRPL explorer, not to Flare', () => {
    const link = explorerLink(item('xrpl_tx', 'E3FE6EA3'), COSTON2)
    expect(link.href).toBe('https://testnet.xrpl.org/transactions/E3FE6EA3')
  })

  it('sends a Flare execution to the Flare explorer, not to XRPL', () => {
    const link = explorerLink(item('flare_tx', '0xdeadbeef'), COSTON2)
    expect(link.href).toBe('https://coston2-explorer.flare.network/tx/0xdeadbeef')
  })

  it('follows the operation network to mainnet without a source change', () => {
    expect(explorerLink(item('xrpl_tx', 'E3FE'), FLARE).href).toBe(
      'https://livenet.xrpl.org/transactions/E3FE',
    )
    expect(explorerLink(item('flare_tx', '0xab'), FLARE).href).toBe(
      'https://flare-explorer.flare.network/tx/0xab',
    )
  })

  it('links an XRPL account to the XRPL explorer', () => {
    expect(explorerLink(item('xrpl_destination', 'rGEgtY'), COSTON2).href).toBe(
      'https://testnet.xrpl.org/accounts/rGEgtY',
    )
  })

  it('links an XRPL ledger index', () => {
    expect(explorerLink(item('xrpl_ledger', '4821993'), COSTON2).href).toBe(
      'https://testnet.xrpl.org/ledgers/4821993',
    )
  })

  it('links Flare addresses — recipient, executor and agent vault alike', () => {
    for (const kind of ['recipient_address', 'executor_address', 'agent_vault'] as const) {
      expect(explorerLink(item(kind, '0xA4b0'), COSTON2).href).toBe(
        'https://coston2-explorer.flare.network/address/0xA4b0',
      )
    }
  })

  it('links a Flare block', () => {
    expect(explorerLink(item('flare_block', '21999'), COSTON2).href).toBe(
      'https://coston2-explorer.flare.network/block/21999',
    )
  })
})

describe('identifiers no explorer can show', () => {
  // SH-08 requires the warning as well as the URL. An FDC round is not a
  // transaction and no block explorer indexes it, so inventing a link would
  // send a person to a 404 and call it evidence.
  it('offers no link for an FDC round, and says why', () => {
    const link = explorerLink(item('fdc_round', '923114'), COSTON2)
    expect(link.href).toBeUndefined()
    expect(link.unsupportedReason).toBeTruthy()
    expect(link.unsupportedReason).toMatch(/explorer/i)
  })

  it('offers no link for an FDC proof or request', () => {
    expect(explorerLink(item('fdc_proof', '0xabc'), COSTON2).href).toBeUndefined()
    expect(explorerLink(item('fdc_request', '0xabc'), COSTON2).href).toBeUndefined()
  })

  it('offers no link for a payment reference or a reservation id', () => {
    expect(explorerLink(item('payment_reference', '0x4642'), COSTON2).href).toBeUndefined()
    expect(explorerLink(item('reservation_id', '77'), COSTON2).href).toBeUndefined()
  })

  it('refuses to link on a network the kit does not support, rather than guessing', () => {
    const link = explorerLink(item('flare_tx', '0xab'), 1)
    expect(link.href).toBeUndefined()
    expect(link.unsupportedReason).toContain('1')
  })
})

describe('accountExplorerLink', () => {
  // A wallet address is identity, not operation evidence, so it never becomes an
  // EvidenceKind. Only the EVM leg links here: its NetworkRef carries the chain
  // id explorerAddressUrl needs; the XRP Ledger identity has none.
  const EVM_ADDRESS = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
  const XRPL_ADDRESS = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

  it('links an EVM account to its address page on the operation network', () => {
    expect(accountExplorerLink('evm', EVM_ADDRESS, COSTON2).href).toBe(
      `https://coston2-explorer.flare.network/address/${EVM_ADDRESS}`,
    )
    expect(accountExplorerLink('evm', EVM_ADDRESS, FLARE).href).toBe(
      `https://flare-explorer.flare.network/address/${EVM_ADDRESS}`,
    )
  })

  it('leaves an XRPL account copy-only — it carries no chain id to key an explorer', () => {
    const link = accountExplorerLink('xrpl', XRPL_ADDRESS)
    expect(link.href).toBeUndefined()
    expect(link.unsupportedReason).toBeTruthy()
  })

  it('is copy-only for an EVM account whose network is not known yet', () => {
    const link = accountExplorerLink('evm', EVM_ADDRESS)
    expect(link.href).toBeUndefined()
    expect(link.unsupportedReason).toBeTruthy()
  })

  it('refuses to guess a link on a network the kit does not support', () => {
    const link = accountExplorerLink('evm', EVM_ADDRESS, 1)
    expect(link.href).toBeUndefined()
    expect(link.unsupportedReason).toContain('1')
  })
})

describe('linkEvidence', () => {
  const items = [
    item('xrpl_tx', 'E3FE'),
    item('fdc_round', '923114'),
    item('flare_tx', '0xdead'),
  ]

  it('keeps a multi-chain journey as separate identifiers with separate links', () => {
    // R-DATA-003: three identifiers, three destinations, never collapsed.
    const linked = linkEvidence(items, COSTON2)
    expect(linked).toHaveLength(3)
    expect(linked[0]?.href).toContain('testnet.xrpl.org')
    expect(linked[1]?.href).toBeUndefined()
    expect(linked[2]?.href).toContain('coston2-explorer.flare.network')
  })

  it('leaves the identifiers and their observation times untouched', () => {
    const linked = linkEvidence(items, COSTON2)
    expect(linked.map((e) => e.value)).toEqual(['E3FE', '923114', '0xdead'])
    expect(linked.every((e) => e.observedAt === 1_000)).toBe(true)
  })

  it('does not overwrite a link the producer already knew', () => {
    const known = evidence({
      kind: 'flare_tx',
      label: 'Flare execution',
      value: '0xdead',
      href: 'https://example.invalid/custom',
      observedAt: 1_000,
    })
    expect(linkEvidence([known], COSTON2)[0]?.href).toBe('https://example.invalid/custom')
  })
})
