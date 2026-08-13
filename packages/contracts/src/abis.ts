/**
 * Curated, typed ABIs. Not the whole 200-function AssetManager diamond — only
 * the fragments flare-kit actually calls, transcribed from the FAssets
 * repository's `contracts/userInterfaces/IAssetManager.sol`.
 *
 * A curated ABI is deliberate: it keeps this package dependency-free, it types
 * every call site end to end through viem, and a reader can see the entire
 * protocol surface this kit touches on one screen.
 */

import { directMintingAbi, directMintingSettingsAbi } from './direct-minting-abi.js'
import { directMintingErrorsAbi } from './direct-minting-errors.js'
import { redemptionAbi } from './redemption-abi.js'

export * from './direct-minting-abi.js'
export * from './direct-minting-errors.js'
export * from './redemption-abi.js'

/** The AssetManager reads a quote depends on, beyond direct minting itself. */
const assetManagerBaseAbi = [
  {
    type: 'function',
    name: 'lotSize',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '_lotSizeUBA', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'assetMintingDecimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'assetMintingGranularityUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fAsset',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Availability, read before quoting. A paused manager is a real "unavailable",
  // never a silent failure discovered at submit time.
  {
    type: 'function',
    name: 'mintingPaused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'emergencyPaused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * The AssetManager is an EIP-2535 diamond, so direct minting and its settings
 * are callable at the same address as the base reads. One ABI, one address.
 */
export const assetManagerAbi = [
  ...assetManagerBaseAbi,
  ...directMintingAbi,
  ...directMintingSettingsAbi,
  // Included so viem decodes a revert into a named protocol state rather than
  // leaving the caller with undecodable bytes.
  ...directMintingErrorsAbi,
  ...redemptionAbi,
] as const

/** The FAsset itself: FTestXRP on Coston2, FXRP on Flare. */
export const fassetAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const
