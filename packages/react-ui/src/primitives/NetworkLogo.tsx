import type { ChainFamily } from '@flarekit-dev/core'

/**
 * NetworkLogo — the real mark for a chain family, so a person recognises the
 * network at a glance. Flare's mark for EVM (mainnet and Coston2 share one brand
 * family), the XRP Ledger's mark for XRPL. Marks are the vendored Flare marks
 * (MIT), painted via `background-image` in primitives.css.
 *
 * The mark is an AID, never the whole signal. The account model states the
 * network in words — a testnet is the proper noun "Coston2", not a colour — so
 * this always pairs with a name where it is used. `testnet` draws a secondary
 * ring; it never replaces the word.
 */

const FAMILY_CLASS: Record<ChainFamily, string> = {
  evm: 'fk-nm-evm',
  xrpl: 'fk-nm-xrpl',
}

const FAMILY_LABEL: Record<ChainFamily, string> = {
  evm: 'Flare network',
  xrpl: 'XRP Ledger',
}

export interface NetworkLogoProps {
  family: ChainFamily
  /** Draw the testnet ring. The authoritative signal is still the name. */
  testnet?: boolean
  /** Diameter in CSS px. Default 20. */
  size?: number
  className?: string
}

export function NetworkLogo({ family, testnet = false, size = 20, className }: NetworkLogoProps) {
  const classes = `fk-nm ${FAMILY_CLASS[family]}${testnet ? ' fk-nm-testnet' : ''}${
    className ? ` ${className}` : ''
  }`
  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      data-network={family}
      {...(testnet ? { 'data-testnet': 'true' } : {})}
      role="img"
      aria-label={FAMILY_LABEL[family]}
    />
  )
}
