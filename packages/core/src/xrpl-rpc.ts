import { FlareKitError } from './errors.js'

/**
 * XRPL reads over plain JSON-RPC.
 *
 * No `xrpl.js`: three read methods and a `fetch` are the whole requirement, and
 * a dependency-free core is what keeps the widget light enough to embed.
 *
 * The distinction this module exists to preserve is between *not found*,
 * *validated and successful*, and *validated and failed*. Collapsing the first
 * into the third is how a payment that simply has not been indexed yet gets
 * rendered as a failure.
 */

export interface XrplTransactionState {
  /** The node knows about it. */
  readonly found: boolean
  /** It is in a validated ledger and can no longer change. */
  readonly validated: boolean
  /** Validated *and* `tesSUCCESS`. Only then has value actually moved. */
  readonly succeeded: boolean
  readonly resultCode?: string
  readonly ledgerIndex?: number
}

export interface XrplAccountInfo {
  /** Exact drops. Never a float — XRPL balances exceed safe integer range. */
  readonly balanceDrops: bigint
  readonly sequence: number
}

export interface CreateXrplClientInput {
  jsonRpcUrl: string
  fetch?: typeof globalThis.fetch
}

export interface XrplClient {
  getTransaction(hash: string): Promise<XrplTransactionState>
  getAccountInfo(account: string): Promise<XrplAccountInfo>
  getCurrentLedgerIndex(): Promise<number>
}

interface XrplResult {
  status?: string
  error?: string
  validated?: boolean
  ledger_index?: number
  ledger_current_index?: number
  meta?: { TransactionResult?: string } | string
  account_data?: { Balance?: string; Sequence?: number }
}

export function createXrplClient(input: CreateXrplClientInput): XrplClient {
  const doFetch = input.fetch ?? globalThis.fetch

  async function call(method: string, params: Record<string, unknown>): Promise<XrplResult> {
    let response: Response
    try {
      response = await doFetch(input.jsonRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params: [params] }),
      })
    } catch (cause) {
      throw new FlareKitError('XRPL_UNREACHABLE', {
        domain: 'network',
        message: 'The XRP Ledger endpoint did not respond.',
        recovery: 'safe_to_retry',
        valueMoved: 'no',
        cause,
      })
    }
    const text = await response.text()
    try {
      return (JSON.parse(text) as { result?: XrplResult }).result ?? {}
    } catch (cause) {
      throw new FlareKitError('XRPL_UNREACHABLE', {
        domain: 'network',
        message: 'The XRP Ledger endpoint returned something that is not JSON.',
        recovery: 'safe_to_retry',
        valueMoved: 'no',
        cause,
      })
    }
  }

  return {
    async getTransaction(hash) {
      const result = await call('tx', { transaction: hash, binary: false })

      if (result.error) {
        // `txnNotFound` most often means "submitted, not yet indexed". That is
        // an unknown outcome, and an unknown outcome is never a failure.
        return { found: false, validated: false, succeeded: false }
      }

      const validated = result.validated === true
      const resultCode =
        typeof result.meta === 'object' ? result.meta?.TransactionResult : undefined

      return {
        found: true,
        validated,
        // tesSUCCESS is the only code that means the payment applied.
        succeeded: validated && resultCode === 'tesSUCCESS',
        ...(resultCode ? { resultCode } : {}),
        ...(result.ledger_index !== undefined ? { ledgerIndex: result.ledger_index } : {}),
      }
    },

    async getAccountInfo(account) {
      const result = await call('account_info', { account, ledger_index: 'validated' })
      if (result.error || !result.account_data) {
        throw new FlareKitError('XRPL_ACCOUNT_NOT_FOUND', {
          domain: 'input',
          message: `The XRP Ledger has no record of ${account}. An account must hold the base reserve before it can send.`,
          recovery: 'terminal',
          valueMoved: 'no',
          evidence: { account },
        })
      }
      return {
        balanceDrops: BigInt(result.account_data.Balance ?? '0'),
        sequence: result.account_data.Sequence ?? 0,
      }
    },

    async getCurrentLedgerIndex() {
      const result = await call('ledger', { ledger_index: 'current' })
      return result.ledger_current_index ?? result.ledger_index ?? 0
    },
  }
}
