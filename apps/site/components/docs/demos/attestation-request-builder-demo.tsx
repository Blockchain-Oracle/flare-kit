'use client'

import { M3_SECTIONS } from '@gallery/m3-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * AttestationRequestBuilder's live preview, driven by the gallery's `fdc-02`
 * section — the submittable request and each of the six distinct refusals it
 * can render instead. One source of truth for the gallery and these docs.
 */
const BUILDER_CASES = M3_SECTIONS.find((section) => section.id === 'fdc-02')!.cases

const CODE = `import { createFdcClient, getRequestFee, xrpPaymentFamily } from '@flarekit-dev/core'
import { AttestationRequestBuilder } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

// The verifier canonicalises the body; the chain prices those exact bytes.
const client = createFdcClient({ services, family: xrpPaymentFamily, source })
const prepared = await client.prepareRequest({ transactionId })
const value = await getRequestFee(reader, chainId, prepared.abiEncodedRequest)

export function Request({ row, account }) {
  return (
    <AttestationRequestBuilder
      row={row}
      sourceId={source.sourceId}
      prepared={prepared}
      fee={{ value, asset: 'C2FLR', decimals: 18 }}
      dataAvailabilityBaseUrl={client.dataAvailabilityBaseUrl}
      proofOwner={account}
      sender={account}
      onSubmit={submit}
    />
  )
}`

export function AttestationRequestBuilderDemo() {
  return <GalleryDemo cases={BUILDER_CASES} code={CODE} />
}
