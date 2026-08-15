import { type Amount, type DexToken, formatExact } from '@flarekit-dev/core'
import { useMemo, useState } from 'react'
import { AssetLogo } from './primitives/AssetLogo.js'
import { Modal } from './primitives/Modal.js'

/**
 * TokenSelector — the token picker (M5-R7).
 *
 * Presentational and prop-driven: the host passes the kit's known tokens with
 * whatever balances it has read, and this renders search, common-base pills and
 * balance-sorted rows. It never fetches.
 *
 * Its one hard rule is the **counter-side gate**. When a side is chosen, the
 * other side may only be a token that has a real pool with it — `pooled: false`
 * renders the row shown but disabled, with the missing pair named, so a person
 * can never pick a pair the DEX cannot quote. A missing pool is stated, not
 * hidden and not faked into a selectable row.
 */

export interface TokenChoice {
  /** Registry key the selection reports, e.g. `FXRP`. */
  readonly key: string
  readonly token: DexToken
  /** Human name for the row's sublabel, e.g. `FAsset XRP`. */
  readonly name?: string
  /** The holder's balance, when read. Absence is unknown, never zero. */
  readonly balance?: Amount
  /**
   * Counter-side gate: `false` = no pool pairs this with the chosen side, so the
   * row is shown but cannot be picked. Omit when the side is not counter-gated.
   */
  readonly pooled?: boolean
}

export interface TokenSelectorProps {
  readonly open: boolean
  readonly tokens: readonly TokenChoice[]
  /** Keys to surface as quick common-base pills. */
  readonly commonBases?: readonly string[]
  /** The token already chosen on this side, marked as current. */
  readonly selectedKey?: string
  readonly onSelect: (key: string) => void
  readonly onClose: () => void
  /** The symbol being paired against, named in the no-pool reason. */
  readonly counterSymbol?: string
  /** Initial search text, so the filtered state is reachable from props. */
  readonly defaultQuery?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

const held = (choice: TokenChoice): boolean => (choice.balance?.value ?? 0n) > 0n

/** Held balances first, largest first; unknown and zero keep their given order. */
function bySortOrder(a: TokenChoice, b: TokenChoice): number {
  const heldDelta = Number(held(b)) - Number(held(a))
  if (heldDelta !== 0) return heldDelta
  if (held(a) && held(b)) return a.balance!.value < b.balance!.value ? 1 : -1
  return 0
}

function matches(choice: TokenChoice, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    choice.token.symbol.toLowerCase().includes(needle) ||
    (choice.name?.toLowerCase().includes(needle) ?? false) ||
    choice.token.address.toLowerCase().includes(needle)
  )
}

function TokenRow({
  choice,
  selected,
  counterSymbol,
  onSelect,
}: {
  choice: TokenChoice
  selected: boolean
  counterSymbol: string | undefined
  onSelect: (key: string) => void
}) {
  const noPool = choice.pooled === false
  return (
    <button
      type="button"
      className="fk-tsel-row"
      data-token={choice.key}
      data-selected={selected ? 'true' : undefined}
      disabled={noPool}
      onClick={noPool ? undefined : () => onSelect(choice.key)}
    >
      <AssetLogo symbol={choice.token.symbol} size={30} />
      <span className="fk-tsel-meta">
        <span className="fk-tsel-sym">{choice.token.symbol}</span>
        {choice.name ? <span className="fk-tsel-name">{choice.name}</span> : null}
      </span>
      {noPool ? (
        <span className="fk-tsel-nopool">No {counterSymbol ?? 'matching'} pool</span>
      ) : choice.balance ? (
        <span className="fk-tsel-bal">{formatExact(choice.balance)}</span>
      ) : null}
    </button>
  )
}

function TokenSection({
  title,
  rows,
  selectedKey,
  counterSymbol,
  onSelect,
}: {
  title: string
  rows: readonly TokenChoice[]
  selectedKey: string | undefined
  counterSymbol: string | undefined
  onSelect: (key: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <>
      <div className="fk-tsel-sec">{title}</div>
      {rows.map((choice) => (
        <TokenRow
          key={choice.key}
          choice={choice}
          selected={choice.key === selectedKey}
          counterSymbol={counterSymbol}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

export function TokenSelector({
  open,
  tokens,
  commonBases,
  selectedKey,
  onSelect,
  onClose,
  counterSymbol,
  defaultQuery,
  theme,
  className,
}: TokenSelectorProps) {
  const [query, setQuery] = useState(defaultQuery ?? '')

  const filtered = useMemo(
    () => tokens.filter((choice) => matches(choice, query)).slice().sort(bySortOrder),
    [tokens, query],
  )
  const pills = useMemo(
    () => (commonBases ?? []).map((key) => tokens.find((t) => t.key === key)).filter(Boolean) as TokenChoice[],
    [commonBases, tokens],
  )

  const yours = filtered.filter(held)
  const rest = filtered.filter((choice) => !held(choice))

  return (
    <Modal
      open={open}
      title="Select a token"
      ariaLabel="Select a token"
      onClose={onClose}
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
    >
      <div className="fk-tsel-search">
          <svg
            className="fk-tsel-search-i"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Search tokens"
            placeholder="Search name or symbol"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {pills.length > 0 ? (
          <div className="fk-tsel-pills">
            {pills.map((choice) => {
              const noPool = choice.pooled === false
              return (
                <button
                  key={choice.key}
                  type="button"
                  className="fk-tsel-pill"
                  data-token={choice.key}
                  disabled={noPool}
                  onClick={noPool ? undefined : () => onSelect(choice.key)}
                >
                  <AssetLogo symbol={choice.token.symbol} size={20} />
                  {choice.token.symbol}
                </button>
              )
            })}
          </div>
        ) : null}

        <div className="fk-tsel-body">
          {filtered.length === 0 ? (
            <p className="fk-tsel-empty">No token matches “{query}”.</p>
          ) : (
            <>
              <TokenSection
                title="Your assets"
                rows={yours}
                selectedKey={selectedKey}
                counterSymbol={counterSymbol}
                onSelect={onSelect}
              />
              <TokenSection
                title="All tokens"
                rows={rest}
                selectedKey={selectedKey}
                counterSymbol={counterSymbol}
                onSelect={onSelect}
              />
            </>
          )}
        </div>
    </Modal>
  )
}
