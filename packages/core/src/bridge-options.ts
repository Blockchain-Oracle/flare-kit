// packages/core/src/bridge-options.ts
import { type Hex, concatHex, numberToHex } from 'viem'
import type { BridgeRoute } from '@flarekit-dev/contracts'

/**
 * The LayerZero V2 **type-3 executor option** encoder — the ONE place cross-chain
 * options are built, so no surface or plan encodes bytes (M8-R2/R11). The kit ships
 * no `@layerzerolabs/*` runtime dependency; these bytes are hand-encoded to the
 * documented type-3 layout and then validated against reality: the plain-bridge
 * output is byte-identical to the hex the live Coston2 `quoteSend` accepted in the
 * M8 probe (a malformed option reverts in the executor's parser, so a clean quote is
 * proof the bytes are valid), and the compose output is live-validated in Task 6.
 *
 * Type-3 layout: `0x0003` then, per option,
 *   workerId(1) ++ uint16(optionLength+1) ++ optionType(1) ++ option.
 * lzReceive option = `uint128(gas)` (value 0, matching the vendored starter).
 * lzCompose option = `uint16(index) ++ uint128(gas)` (value 0).
 */

const TYPE_3: Hex = '0x0003'
const WORKER_EXECUTOR = 1
const OPT_TYPE_LZRECEIVE = 1
const OPT_TYPE_LZCOMPOSE = 3

/** Wrap a raw option in its worker/length/type header (LZ `addExecutorOption`). */
function executorOption(optionType: number, option: Hex): Hex {
  const optionBytes = (option.length - 2) / 2
  return concatHex([
    numberToHex(WORKER_EXECUTOR, { size: 1 }),
    numberToHex(optionBytes + 1, { size: 2 }),
    numberToHex(optionType, { size: 1 }),
    option,
  ])
}

/** `addExecutorLzReceiveOption(gas, 0)` — the destination lzReceive gas. */
export function lzReceiveOption(gas: number): Hex {
  return executorOption(OPT_TYPE_LZRECEIVE, numberToHex(BigInt(gas), { size: 16 }))
}

/** `addExecutorLzComposeOption(index, gas, 0)` — the composer lzCompose gas. */
export function lzComposeOption(index: number, gas: number): Hex {
  return executorOption(
    OPT_TYPE_LZCOMPOSE,
    concatHex([numberToHex(index, { size: 2 }), numberToHex(BigInt(gas), { size: 16 })]),
  )
}

/**
 * The `extraOptions` for a route: a plain bridge carries one lzReceive option; a
 * compose redeem carries lzReceive **plus** an lzCompose option at index 0 for the
 * composer. Under-gassing the executor strands a message mid-flight, so both gas
 * values come from the route config (M8-R1), never a guess.
 */
export function encodeExecutorOptions(route: BridgeRoute): Hex {
  const parts: Hex[] = [TYPE_3, lzReceiveOption(route.executorGas)]
  if (route.kind === 'redeem') {
    if (route.composeGas == null) {
      throw new Error(`bridge-options: redeem route ${route.key} has no composeGas`)
    }
    parts.push(lzComposeOption(0, route.composeGas))
  }
  return concatHex(parts)
}
