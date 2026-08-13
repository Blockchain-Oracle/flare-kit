import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, getAbiItem, pad, zeroAddress } from 'viem'
import {
  BRIDGE_ROUTES,
  COMPOSER_ABI,
  OFT_ADAPTER_ABI,
  OFT_DEST_ABI,
  REDEEM_COMPOSE_MESSAGE,
  routeByKey,
  routesFor,
} from '../src/index.js'

// M8-R1: the cross-chain route registry is the one source of truth for every OFT
// address, EID and gas constant, so nothing is hardcoded in a component. Every value
// pinned here was read on-chain by the M8 probe
// (`.thoughts/verification/2026-08-11-m8-bridge-probe.json`, Coston2 block + Sepolia
// block recorded): token() == FTestXRP, peers(40161) set, quoteSend/quoteOFT return,
// no dust (sharedDecimals 6, decimalConversionRate 1). Nothing is inferred.

const COSTON2_OFT_ADAPTER = '0xCd3d2127935Ae82Af54Fc31cCD9D3440dbF46639'
const FTESTXRP_COSTON2 = '0x0b6A3645c240605887a5532109323A3E12273dc7'
const SEPOLIA_FXRP_OFT = '0x81672c5d42f3573ad95a0bdfbe824faac547d4e6'
const COSTON2_COMPOSER = '0xa10569DFb38FE7Be211aCe4E4A566Cea387023b0'

describe('bridge route registry', () => {
  it('carries both probed Coston2 routes with exact addresses and EIDs', () => {
    const routes = routesFor('coston2')
    expect(routes).toHaveLength(2)

    const bridge = routeByKey('coston2', 'coston2-sepolia')
    expect(bridge?.kind).toBe('bridge')
    expect(bridge?.from.key).toBe('coston2')
    expect(bridge?.from.chainId).toBe(114)
    expect(bridge?.from.eid).toBe(40294) // EndpointId.FLARE_V2_TESTNET
    expect(bridge?.from.oft).toBe(COSTON2_OFT_ADAPTER)
    expect(bridge?.to.key).toBe('sepolia')
    expect(bridge?.to.chainId).toBe(11155111)
    expect(bridge?.to.eid).toBe(40161) // EndpointId.SEPOLIA_V2_TESTNET
    expect(bridge?.to.oft).toBe(SEPOLIA_FXRP_OFT)
    // the asset locked on the source is the FAsset the DEX/vault config already carries
    expect(bridge?.asset.address).toBe(FTESTXRP_COSTON2)
    expect(bridge?.asset.decimals).toBe(6)

    const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')
    expect(redeem?.kind).toBe('redeem')
    // the redeem SEND runs on Sepolia (from), delivering to the Coston2 composer (to)
    expect(redeem?.from.key).toBe('sepolia')
    expect(redeem?.from.oft).toBe(SEPOLIA_FXRP_OFT)
    expect(redeem?.to.key).toBe('coston2')
    expect(redeem?.to.oft).toBe(COSTON2_OFT_ADAPTER)
    // on Sepolia the FXRP OFT is its own token (native OFT), per the probe
    expect(redeem?.asset.address).toBe(SEPOLIA_FXRP_OFT)
  })

  it('marks each route verified only after its OWN live delivery run', () => {
    // coston2→sepolia bridge: delivered + confirmed on Sepolia 2026-08-11
    // (guid 0xd0f1e2c6…2b22a04, quoted == delivered exact).
    expect(routeByKey('coston2', 'coston2-sepolia')?.bridgeVerified).toBe(true)
    // sepolia→coston2 redeem: verified end-to-end 2026-08-11 — LZ delivery → composer
    // FAssetRedeemed → native XRP SETTLED on XRPL (9.94 XRP, tx 401F7591…).
    expect(routeByKey('coston2', 'sepolia-coston2-redeem')?.bridgeVerified).toBe(true)
  })

  it('the redeem route carries a composer and compose gas; the bridge route does not', () => {
    const bridge = routeByKey('coston2', 'coston2-sepolia')
    const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')
    // plain bridge: one lzReceive executor option, no compose
    expect(bridge?.composer).toBeUndefined()
    expect(bridge?.composeGas).toBeUndefined()
    expect(bridge?.executorGas).toBe(200_000)
    // redeem: composer + heavier compose/executor gas
    expect(redeem?.composer).toBe(COSTON2_COMPOSER)
    expect(redeem?.composeGas).toBe(1_000_000)
    expect(redeem?.executorGas).toBe(1_000_000)
  })

  it('both routes carry the LayerZeroScan evidence base and no route key repeats', () => {
    const routes = routesFor('coston2')
    for (const route of routes) {
      expect(route.scanUrl).toBe('https://testnet.layerzeroscan.com/tx/')
    }
    const keys = routes.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('exposes the configured networks as a readonly record', () => {
    expect(Object.keys(BRIDGE_ROUTES)).toContain('coston2')
    // the source network the kit drives cross-chain is Coston2; Flare mainnet routes
    // are a later, separately-verified milestone
    expect(routesFor('flare')).toEqual([])
  })
})

describe('bridge ABIs', () => {
  it('OFT_ADAPTER_ABI exposes the IOFT surface the kit drives', () => {
    for (const name of ['token', 'peers', 'sharedDecimals', 'quoteSend', 'quoteOFT', 'send'] as const) {
      expect(getAbiItem({ abi: OFT_ADAPTER_ABI, name })).toBeTruthy()
    }
    // quoteSend takes the SendParam tuple + payInLzToken bool, returns MessagingFee
    const quoteSend = getAbiItem({ abi: OFT_ADAPTER_ABI, name: 'quoteSend' })
    expect(quoteSend?.inputs.map((i) => i.type)).toEqual(['tuple', 'bool'])
    expect(getAbiItem({ abi: OFT_ADAPTER_ABI, name: 'OFTSent' })?.type).toBe('event')
  })

  it('OFT_DEST_ABI reads the destination and carries the OFTReceived delivery event', () => {
    expect(getAbiItem({ abi: OFT_DEST_ABI, name: 'balanceOf' })).toBeTruthy()
    const received = getAbiItem({ abi: OFT_DEST_ABI, name: 'OFTReceived' })
    expect(received?.type).toBe('event')
    // guid + toAddress are indexed — the reconciler correlates delivery by guid
    expect(received?.inputs.find((i) => i.name === 'guid')).toMatchObject({ indexed: true, type: 'bytes32' })
    expect(received?.inputs.find((i) => i.name === 'amountReceivedLD')).toMatchObject({ type: 'uint256' })
  })

  it('COMPOSER_ABI carries the FAssetRedeemed success and FAssetRedeemFailed shapes', () => {
    const ok = getAbiItem({ abi: COMPOSER_ABI, name: 'FAssetRedeemed' })
    expect(ok?.type).toBe('event')
    expect(ok?.inputs.find((i) => i.name === 'redeemer')).toMatchObject({ indexed: true, type: 'address' })
    // the honest failure shape exists so an unknown outcome is never rendered as failed,
    // and a real failure is not rendered as success
    expect(getAbiItem({ abi: COMPOSER_ABI, name: 'FAssetRedeemFailed' })?.type).toBe('event')
  })

  it('the redeem compose message encodes against the RedeemComposeMessage shape', () => {
    // mirrors IFAssetRedeemComposer.RedeemComposeMessage — the kit builds this, never
    // an LZ runtime dep
    expect(() =>
      encodeAbiParameters(REDEEM_COMPOSE_MESSAGE, [
        {
          redeemer: '0x0000000000000000000000000000000000000001',
          redeemerUnderlyingAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
          redeemWithTag: false,
          destinationTag: 0n,
          executor: zeroAddress,
          executorFee: 0n,
        },
      ]),
    ).not.toThrow()
    // recipient padding for a SendParam `to` is bytes32 left-pad
    expect(pad('0x0000000000000000000000000000000000000001', { size: 32 })).toHaveLength(66)
  })
})
