/**
 * AssetLogo — the one place a symbol becomes a mark.
 *
 * Resolution is **bundled SVG → seeded monogram**, never a remote image. An
 * embeddable widget runs under a strict CSP with no external request, and
 * hotlinking a logo host would also leak which assets a user is viewing. The
 * bundled marks are the official Flare marks (MIT), painted through
 * `background-image` in `primitives.css` so their two-tone colour survives — the
 * monochrome icons use a `mask`, which would strip exactly that colour.
 *
 * An unknown symbol is a **seeded monogram** — a deterministic colour and the
 * first letters — never a blank and never a wrong logo. That is the honest
 * "no bundled mark yet"; the alternative (fill an unknown with a plausible mark)
 * is the same class of lie DESIGN.md forbids for numbers.
 *
 * A mark is asset **identity**, not an operation outcome, so it never touches
 * the seven-glyph state vocabulary.
 */

// symbol (upper-cased) -> the mark class defined in primitives.css. Kept as
// literals so `css-integrity` sees each `.fk-am-*` rule referenced. Symbols
// without a bundled mark fall through to the monogram, by design.
const MARK_CLASS: Record<string, string> = {
  FXRP: 'fk-am-fxrp',
  FTESTXRP: 'fk-am-fxrp',
  XRP: 'fk-am-xrp',
  FLR: 'fk-am-flr',
  WFLR: 'fk-am-flr',
  C2FLR: 'fk-am-flr',
  CFLR: 'fk-am-flr',
  FBTC: 'fk-am-fassets',
  FDOGE: 'fk-am-fassets',
  FLTC: 'fk-am-fassets',
  // FTSO feed base assets — real marks (Trust Wallet, MIT). See ATTRIBUTION.md.
  BTC: 'fk-am-btc',
  ETH: 'fk-am-eth',
  LTC: 'fk-am-ltc',
  DOGE: 'fk-am-doge',
  ADA: 'fk-am-ada',
  XLM: 'fk-am-xlm',
  BCH: 'fk-am-bch',
  ALGO: 'fk-am-algo',
  AVAX: 'fk-am-avax',
  BNB: 'fk-am-bnb',
  SOL: 'fk-am-sol',
  POL: 'fk-am-pol',
  MATIC: 'fk-am-pol',
  DOT: 'fk-am-dot',
  TRX: 'fk-am-trx',
  USDC: 'fk-am-usdc',
  USDT: 'fk-am-usdt',
  DAI: 'fk-am-dai',
}

/** Deterministic so one symbol is the same colour on every surface. */
function seededHue(symbol: string): number {
  let hash = 0
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 31 + symbol.charCodeAt(index)) % 360
  }
  return hash
}

function initials(symbol: string): string {
  const letters = symbol.replace(/[^A-Za-z0-9]/g, '')
  return (letters.slice(0, 2) || symbol.slice(0, 2)).toUpperCase()
}

export interface AssetLogoProps {
  /** The asset symbol, e.g. `FXRP`, `XRP`, `FLR`. */
  symbol: string
  /** Diameter in CSS px. Default 24. */
  size?: number
  className?: string
}

export function AssetLogo({ symbol, size = 24, className }: AssetLogoProps) {
  const base = `fk-am${className ? ` ${className}` : ''}`
  const markClass = MARK_CLASS[symbol.toUpperCase()]

  if (markClass) {
    return (
      <span
        className={`${base} ${markClass}`}
        style={{ width: size, height: size }}
        data-asset={symbol}
        role="img"
        aria-label={symbol}
      />
    )
  }

  return (
    <span
      className={`${base} fk-am-mono`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        backgroundColor: `hsl(${seededHue(symbol)} 42% 42%)`,
      }}
      data-asset={symbol}
      role="img"
      aria-label={symbol}
    >
      {initials(symbol)}
    </span>
  )
}
