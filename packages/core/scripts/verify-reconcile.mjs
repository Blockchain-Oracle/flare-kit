/**
 * Proves M0: the live kit reconciles a real, already-settled mint from chain
 * evidence alone — and submits nothing.
 *
 * This is what replaced `resume-mint.mjs`. That script was a Resume button: it
 * pushed a transaction that reverted. This asks the chain where the operation
 * is and believes the answer.
 */
import { createPublicClient, http } from 'viem'
import { chainFor } from '@flarekit-dev/contracts'
import { createFlareKit, createFdcClient, evidence, applyTransition } from '../dist/index.js'
import { registryFor } from '@flarekit-dev/contracts'

const CHAIN_ID = 114
const XRPL_TX = '3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03'
const VOTING_ROUND = '1415484'
const RECIPIENT = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const chain = chainFor(CHAIN_ID)
const client = createPublicClient({ transport: http(chain.rpcUrl) })

const kit = await createFlareKit({ client, chainId: CHAIN_ID })
console.log('kit          ', kit.label, '| isMock =', kit.isMock)
console.log('fAsset       ', kit.protocolState.fAssetSymbol)

// Re-derive the request bytes; they are deterministic from the same inputs.
const fdc = createFdcClient({ services: registryFor(CHAIN_ID).services })
const requestBytes = await fdc.prepareRequest({
  transactionId: `0x${XRPL_TX}`,
  proofOwner: RECIPIENT,
})

// The operation as it would have been persisted mid-flight.
const now = Date.now()
let op = kit.start({ amountXrp: '25', recipient: RECIPIENT, xrplAccount: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio' })
op = applyTransition(op, { to: 'executing', at: now }).record
op = applyTransition(op, {
  to: 'submitted',
  at: now,
  evidence: [
    evidence({ kind: 'xrpl_tx', label: 'XRPL payment', value: XRPL_TX, observedAt: now }),
    evidence({ kind: 'fdc_request', label: 'FDC request', value: requestBytes, observedAt: now }),
    evidence({ kind: 'fdc_round', label: 'FDC round', value: VOTING_ROUND, observedAt: now }),
  ],
}).record

console.log('before       ', op.state)

const reconciled = await kit.reconcile(op)

console.log('after        ', reconciled.state)
console.log('actions      ', JSON.stringify(reconciled.recovery ?? []))
console.log('awaiting     ', reconciled.awaiting?.actor ?? 'none')
console.log('')
const ok = reconciled.state === 'succeeded' && (reconciled.recovery ?? []).length === 0
console.log(ok
  ? 'PASS — resolved succeeded from chain evidence, no transaction submitted.'
  : `FAIL — expected succeeded with no actions, got ${reconciled.state}`)
process.exit(ok ? 0 : 1)
