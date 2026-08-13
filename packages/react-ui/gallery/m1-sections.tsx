import { MOCK_EPOCH, type MockScenario, amount, createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import type { ReactNode } from 'react'
import {
  MintFXRP,
  OperationTimeline,
  RecoveryPanel,
  RedeemFXRP,
} from '@flare-kit/react-ui'
import type { Section } from './sections'

/**
 * M1's four composed surfaces, added to the gallery in the M2 close-out.
 *
 * They shipped green by test alone and had never been rendered in a browser.
 * Six defects turned up the first time the M2 surfaces were looked at, so these
 * are here on the assumption that they have some too.
 *
 * `MintFXRP` and `RedeemFXRP` read the kit through hooks, so each case is
 * wrapped in its own provider over a seeded mock kit — deterministic, no
 * network, no wallet.
 */

/**
 * Not `MOCK_EVM_ACCOUNT` / `MOCK_XRPL_ACCOUNT` from core's mock. Those are
 * deliberately *invalid* — `0xM0CK…` is not hex, and `rMOCK…` uses characters
 * base58 excludes — which is safe for the portfolio surfaces, since they only
 * display an account. The mint and redeem composers validate, so they need a
 * fixture that is unmistakably fake and still well-formed.
 */
/**
 * The gallery's clock, and it must be the **mock kit's** clock.
 *
 * The composers quote through `useDirectMint`, which runs against the mock kit
 * at `MOCK_EPOCH` — a fixed timestamp, not wall time. So `expiresAt` is
 * `MOCK_EPOCH + 60s`, and both a hardcoded date and `Date.now()` sit far past
 * it: every case rendered "Quote expired", which would have been a gallery
 * lying about eight states at once. Read the epoch the quotes actually use.
 */
const M1_NOW = MOCK_EPOCH + 5_000

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function Mounted({ seed, children }: { seed: string; children: ReactNode }) {
  return <FlareProvider kit={createMockKit({ seed })}>{children}</FlareProvider>
}

/** A trace of the mock's own states, so the timeline shows real transitions. */
function traceFor(scenario: MockScenario) {
  const kit = createMockKit({ seed: `gallery-${scenario}`, scenario })
  return kit.trace(
    kit.start({ amountXrp: '25.000000', recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }),
  )
}

const happy = traceFor('happy')
const late = traceFor('executor-late')
const delayed = traceFor('large-delayed')

/**
 * A record in a given state, or a loud failure. The `?? last` fallback this
 * replaced silently rendered a *succeeded* operation under a "ready" label —
 * a gallery that lies about which state it is showing is worse than no
 * gallery.
 */
const at = (trace: ReturnType<typeof traceFor>, state: string) => {
  const found = trace.find((record) => record.state === state)
  if (!found) throw new Error(`No ${state} record in this trace: ${trace.map((r) => r.state).join(', ')}`)
  return found
}

/** The trace begins at `submitted`; `ready` only exists before it. */
const readyRecord = createMockKit({ seed: 'gallery-ready' }).start({
  amountXrp: '25.000000',
  recipient: RECIPIENT,
  xrplAccount: XRPL_ACCOUNT,
})

export const M1_SECTIONS: readonly Section[] = [
  {
    id: 'm1-mint',
    title: 'M1 · MintFXRP (FX-02)',
    cases: [
      {
        name: 'loading',
        node: (
          <Mounted seed="mint-loading">
            <MintFXRP recipient={RECIPIENT} xrplAccount={XRPL_ACCOUNT} loading />
          </Mounted>
        ),
      },
      {
        // Named for what it is. It was called "ready", which it is not — the
        // ready state has eight detail rows and this has none.
        name: 'empty — no amount entered yet',
        node: (
          <Mounted seed="mint-ready">
            <MintFXRP recipient={RECIPIENT} xrplAccount={XRPL_ACCOUNT} onSubmit={() => {}} />
          </Mounted>
        ),
      },
      {
        name: 'BASE ready — quoted, with every term on screen',
        node: (
          <Mounted seed="mint-quoted">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="25"
              xrplBalance={amount(84_950000n, 6, 'XRP')}
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        // AC7. A payment below the minimum mints nothing and cannot be
        // recovered — the refusal that prevents a total unrecoverable loss, and
        // until now it had never been rendered in a browser at all.
        name: 'below minimum — AC7, the unrecoverable-loss refusal',
        node: (
          <Mounted seed="mint-below-min">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="0.4"
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'insufficient balance — states the shortfall exactly',
        node: (
          <Mounted seed="mint-insufficient">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="250"
              xrplBalance={amount(84_950000n, 6, 'XRP')}
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'large-mint delay — the wait, and why',
        node: (
          <Mounted seed="mint-large">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="1000"
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'executor named — now visible, because there is a quote',
        node: (
          <Mounted seed="mint-exec">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="25"
              executor="0x103b384064ae85577127097A7cCadfd6fb13f437"
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'quote expired — terms the protocol will not honour',
        node: (
          <Mounted seed="mint-expired">
            <MintFXRP
              recipient={RECIPIENT}
              xrplAccount={XRPL_ACCOUNT}
              defaultAmountXrp="25"
              now={M1_NOW + 10 * 60_000}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
    ],
  },
  {
    id: 'm1-redeem',
    title: 'M1 · RedeemFXRP (FX-07)',
    cases: [
      {
        name: 'loading',
        node: (
          <Mounted seed="redeem-loading">
            <RedeemFXRP redeemerUnderlyingAddress={XRPL_ACCOUNT} loading />
          </Mounted>
        ),
      },
      {
        name: 'empty — no lots entered yet',
        node: (
          <Mounted seed="redeem-ready">
            <RedeemFXRP redeemerUnderlyingAddress={XRPL_ACCOUNT} onSubmit={() => {}} />
          </Mounted>
        ),
      },
      {
        name: 'BASE ready — quoted, with the agent-pays note',
        node: (
          <Mounted seed="redeem-quoted">
            <RedeemFXRP
              redeemerUnderlyingAddress={XRPL_ACCOUNT}
              defaultLots={2}
              fAssetBalance={amount(31_250000n, 6, 'FMockXRP')}
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'more lots than held — the refusal states both figures',
        node: (
          <Mounted seed="redeem-insufficient">
            <RedeemFXRP
              redeemerUnderlyingAddress={XRPL_ACCOUNT}
              defaultLots={99}
              fAssetBalance={amount(31_250000n, 6, 'FMockXRP')}
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'quote expired',
        node: (
          <Mounted seed="redeem-expired">
            <RedeemFXRP
              redeemerUnderlyingAddress={XRPL_ACCOUNT}
              defaultLots={2}
              now={M1_NOW + 10 * 60_000}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
      {
        name: 'balance known, nothing entered',
        node: (
          <Mounted seed="redeem-balance">
            <RedeemFXRP
              redeemerUnderlyingAddress={XRPL_ACCOUNT}
              fAssetBalance={amount(31_250000n, 6, 'FMockXRP')}
              now={M1_NOW}
              onSubmit={() => {}}
            />
          </Mounted>
        ),
      },
    ],
  },
  {
    id: 'm1-timeline',
    title: 'M1 · OperationTimeline (SH-05)',
    cases: [
      { name: 'ready', node: <OperationTimeline operation={readyRecord} /> },
      { name: 'submitted', node: <OperationTimeline operation={at(happy, 'submitted')} /> },
      { name: 'confirming', node: <OperationTimeline operation={at(happy, 'confirming')} /> },
      {
        name: 'awaiting external',
        node: <OperationTimeline operation={at(happy, 'awaiting_external')} />,
      },
      { name: 'succeeded', node: <OperationTimeline operation={at(happy, 'succeeded')} /> },
      {
        name: 'action required (executor late)',
        node: <OperationTimeline operation={at(late, 'action_required')} onAction={() => {}} />,
      },
      {
        name: 'large mint, delayed',
        node: <OperationTimeline operation={delayed[delayed.length - 1]!} />,
      },
    ],
  },
  {
    id: 'm1-recovery',
    title: 'M1 · RecoveryPanel (SH-06)',
    cases: [
      {
        name: 'action required',
        node: <RecoveryPanel operation={at(late, 'action_required')} onAction={() => {}} />,
      },
      {
        name: 'in flight, no safe action yet',
        node: (
          <RecoveryPanel operation={at(happy, 'confirming')} nowMs={M1_NOW} onAction={() => {}} />
        ),
      },
      {
        /**
         * SH-06's `duplicate-value danger`. Every action in both M1 recovery
         * matrices is `movesNewValue: false`, so this branch — the ghost button,
         * the attention tone and the sentence that says it is not a retry — had
         * never been rendered anywhere: no test, no gallery, no production path.
         * Hand-built because no M1 flow produces one.
         */
        name: 'duplicate-value danger — creates a NEW payment, not a retry',
        node: (
          <RecoveryPanel
            operation={{
              ...at(late, 'action_required'),
              recovery: [
                {
                  id: 'send-new-payment',
                  label: 'Send a new payment',
                  effect: 'Pays the agent again from your XRPL account.',
                  movesNewValue: true,
                  signs: true,
                  broadcasts: true,
                  nextState: 'submitted',
                  preconditions: [
                    'the first payment is confirmed lost',
                    'your XRPL account still holds the amount plus reserve',
                  ],
                },
              ],
            }}
            nowMs={M1_NOW}
            onAction={() => {}}
          />
        ),
      },
      {
        name: 'recovery window closed — not a benign wait',
        node: (
          <RecoveryPanel
            operation={{
              ...at(late, 'action_required'),
              recovery: [
                {
                  id: 'reuse-proof',
                  label: 'Re-present the existing proof',
                  effect: 'Reuses the proof you already have.',
                  movesNewValue: false,
                  signs: false,
                  broadcasts: true,
                  preconditions: ['the original proof has not already been consumed'],
                  nextState: 'submitted',
                  expiresAt: M1_NOW - 60_000,
                },
              ],
            }}
            nowMs={M1_NOW}
            onAction={() => {}}
          />
        ),
      },
    ],
  },
]
