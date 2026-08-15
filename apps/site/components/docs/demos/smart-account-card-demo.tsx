'use client'

import { M13_SMART_ACCOUNT_SECTIONS } from '@gallery/m13-smart-account-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * SmartAccountCard's live preview. The states are imported wholesale from the
 * gallery's `m13-smart-account` section — the observed two-network pair, the
 * account before its first instruction, the funded-but-undeployed moment, a
 * partial read, an unread one, and the four history answers (listed, confirmed
 * empty, still scanning, and a scan that could not complete). Nothing here is
 * re-authored, so the docs cannot drift from the surface.
 */
const SMART_ACCOUNT_CASES = M13_SMART_ACCOUNT_SECTIONS.find(
  (section) => section.id === 'm13-smart-account',
)!.cases

const CODE = `import { smartAccountsFor } from '@flarekit-dev/contracts'
import { useSmartAccount } from '@flarekit-dev/react'
import { SmartAccountCard } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

// One hook per network: a personal account is read on the deployment it lives on,
// and showing the same address on both is the point of the two columns.
export function Account({ xrplOwner, coston2Client, flareClient }) {
  const coston2 = useSmartAccount({
    deployment: smartAccountsFor('coston2'),
    xrplOwner,               // an XRPL address, not an EVM one
    publicClient: coston2Client, // keyless: no wallet and no signature anywhere here
  })
  const flare = useSmartAccount({
    deployment: smartAccountsFor('flare'),
    xrplOwner,
    publicClient: flareClient,
  })

  return (
    <SmartAccountCard
      xrplOwner={xrplOwner}
      networks={[
        {
          deployment: smartAccountsFor('coston2'),
          networkLabel: 'Coston2',
          nativeSymbol: 'C2FLR',
          settings: coston2.settings, // undefined = the controller could not be read
          account: coston2.account,
        },
        {
          deployment: smartAccountsFor('flare'),
          networkLabel: 'Flare Mainnet',
          nativeSymbol: 'FLR',
          settings: flare.settings,
          account: flare.account,
        },
      ]}
    />
  )
}`

export function SmartAccountCardDemo() {
  return <GalleryDemo cases={SMART_ACCOUNT_CASES} code={CODE} />
}
