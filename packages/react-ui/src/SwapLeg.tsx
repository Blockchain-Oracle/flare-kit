import { type Amount, type DexToken, formatExact } from '@flare-kit/core'
import { AssetLogo } from './primitives/AssetLogo.js'

/**
 * One leg of the swap's currency context — the "you pay" or "you receive" row.
 * Reuses the ported amount-entry anatomy (`fk-leg*` in compose.css); the only
 * swap-specific parts are the token-select trigger and the MAX affordance.
 */

export interface SwapLegProps {
  readonly role: 'pay' | 'receive'
  readonly label: string
  /** The digits shown; `—` when the receive amount is unknown. */
  readonly value: string
  readonly editable: boolean
  readonly token: DexToken
  readonly balance?: Amount
  readonly onSelect?: () => void
  readonly onAmountInChange?: (text: string) => void
  readonly onMax?: () => void
}

export function SwapLeg({
  role,
  label,
  value,
  editable,
  token,
  balance,
  onSelect,
  onAmountInChange,
  onMax,
}: SwapLegProps) {
  return (
    <div className="fk-leg" data-leg={role}>
      <span className="fk-leg-label">{label}</span>
      <div className="fk-leg-main">
        <input
          className="fk-leg-amount"
          value={value}
          disabled={!editable}
          inputMode="decimal"
          placeholder="0.0"
          aria-label={role === 'pay' ? 'Amount to pay' : 'Amount to receive'}
          onChange={(event) => onAmountInChange?.(event.target.value)}
        />
        <button type="button" className="fk-swap-token" onClick={onSelect}>
          <AssetLogo symbol={token.symbol} size={22} />
          <span className="fk-swap-token-sym">{token.symbol}</span>
          <span className="fk-swap-token-cr" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {balance || (role === 'pay' && onMax) ? (
        <div className="fk-leg-foot">
          <span className="fk-leg-bal">
            {balance ? (
              <>
                Balance <span className="fk-mono">{formatExact(balance, { asset: false })}</span>
              </>
            ) : null}
          </span>
          {role === 'pay' && onMax ? (
            <button type="button" className="fk-swap-max" onClick={onMax}>
              MAX
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
