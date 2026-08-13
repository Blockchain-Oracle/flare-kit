import { describe, expect, it } from 'vitest'
import { routeByKey } from '@flarekit-dev/contracts'
import { encodeExecutorOptions, lzComposeOption, lzReceiveOption } from '../src/bridge-options.js'

const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!

// The kit ships NO @layerzerolabs runtime dep, so the type-3 option bytes are
// hand-encoded and pinned here. The plain-bridge fixture is the exact hex the LIVE
// Coston2 `quoteSend` accepted in the M8 probe — a malformed option reverts in the
// executor's parser, so this literal is validated by the chain itself, not by us.
// The compose fixture is live-validated in Task 6.
const BRIDGE_OPTIONS = '0x00030100110100000000000000000000000000030d40'
const REDEEM_OPTIONS =
  '0x000301001101000000000000000000000000000f4240010013030000000000000000000000000000000f4240'

describe('type-3 executor options', () => {
  it('a plain bridge encodes one lzReceive option — byte-identical to the probe quote', () => {
    // 0003 (type-3) ++ 01 (executor) ++ 0011 (len 17) ++ 01 (lzReceive) ++ uint128(200000)
    expect(encodeExecutorOptions(bridge)).toBe(BRIDGE_OPTIONS)
  })

  it('a redeem encodes lzReceive PLUS an lzCompose option at index 0', () => {
    // adds 01 (executor) ++ 0013 (len 19) ++ 03 (lzCompose) ++ uint16(0) ++ uint128(1_000_000)
    expect(encodeExecutorOptions(redeem)).toBe(REDEEM_OPTIONS)
  })

  it('the compose gas is required on a redeem route', () => {
    // route.composeGas is set; the encoder throws only if a redeem route lacks it
    expect(redeem.composeGas).toBe(1_000_000)
    expect(() => encodeExecutorOptions({ ...redeem, composeGas: undefined })).toThrow(/composeGas/)
  })

  it('the primitive options carry the correct worker/type headers', () => {
    // lzReceive: worker 01, len 0011, type 01
    expect(lzReceiveOption(200_000)).toBe('0x01001101' + '00000000000000000000000000030d40')
    // lzCompose: worker 01, len 0013, type 03, index 0000
    expect(lzComposeOption(0, 1_000_000)).toBe('0x01001303' + '0000' + '000000000000000000000000000f4240')
  })
})
