import { ripemd160, sha256 } from 'viem'
import { FlareKitError } from './errors.js'

/**
 * SDK-free P-chain reads over plain JSON-RPC, plus the bech32 P-address helper.
 *
 * No `@flarenetwork/flare-tx-sdk` / `flarejs`: this file ships in
 * `@flare-kit/core`, which stays viem-only. The three reads are `fetch` POSTs to
 * the P-chain endpoint (`…/ext/bc/P`); the address hash chain uses viem's
 * exported `sha256`/`ripemd160`; bech32 is a small local encoder (below) so no
 * new runtime dependency is added.
 *
 * Units: every P-chain amount arrives as a STRING of **nFLR** (1e-9 FLR, i.e.
 * gwei-scale). We convert to `bigint` **wei** by `× 1e9` (`WEI_PER_NFLR`) at the
 * boundary, so callers only ever see wei. `startTime`/`endTime` are unix-second
 * strings → `bigint` seconds.
 */

/** 1 nFLR (1e-9 FLR) = 1e9 wei. The single, explicit gwei↔wei conversion. */
const WEI_PER_NFLR = 1_000_000_000n

/** A validator's own registration window and self-stake weight. */
export interface ValidatorInfo {
  readonly nodeId: string
  readonly startTime: bigint
  readonly endTime: bigint
  /** Self-stake weight, in wei. */
  readonly weight: bigint
}

/** A delegator's on-chain stake position, read back from the validator record. */
export interface StakePosition {
  readonly nodeId: string
  /** Delegated amount, in wei. */
  readonly amount: bigint
  readonly startTime: bigint
  readonly endTime: bigint
}

// --- raw wire shapes (only the fields we read) -----------------------------

interface RawRewardOwner {
  readonly addresses?: readonly string[]
}
interface RawDelegator {
  readonly nodeID: string
  readonly startTime: string
  readonly endTime: string
  readonly weight: string
  readonly rewardOwner?: RawRewardOwner
}
interface RawValidator {
  readonly nodeID: string
  readonly startTime: string
  readonly endTime: string
  readonly weight: string
  readonly delegators?: readonly RawDelegator[] | null
}
interface CurrentValidatorsResult {
  readonly validators?: readonly RawValidator[]
}
interface MinStakeResult {
  readonly minValidatorStake: string
  readonly minDelegatorStake: string
}

/**
 * One JSON-RPC 2.0 POST to the P-chain endpoint. A transport or malformed-JSON
 * fault throws `RPC_UNREACHABLE` (safe to retry; nothing moved); a JSON-RPC
 * `error` object throws `PCHAIN_RPC_ERROR`. Neither is ever quietly turned into
 * an empty read — an absent read is not the same as an empty one.
 */
async function rpcCall<T>(
  rpcBase: string,
  method: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(rpcBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
  } catch (cause) {
    throw new FlareKitError('RPC_UNREACHABLE', {
      domain: 'network',
      message: `The P-chain endpoint did not respond to ${method}.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      cause,
    })
  }
  const text = await response.text()
  let parsed: { result?: T; error?: { message?: string } }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch (cause) {
    throw new FlareKitError('RPC_UNREACHABLE', {
      domain: 'network',
      message: `The P-chain endpoint returned non-JSON for ${method}.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      cause,
    })
  }
  if (parsed.error) {
    throw new FlareKitError('PCHAIN_RPC_ERROR', {
      domain: 'protocol',
      message: parsed.error.message ?? `P-chain ${method} returned an error.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      evidence: { method },
    })
  }
  if (parsed.result === undefined) {
    throw new FlareKitError('RPC_UNREACHABLE', {
      domain: 'network',
      message: `The P-chain endpoint returned no result for ${method}.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
    })
  }
  return parsed.result
}

/** nFLR string → wei bigint. Explicit and total: this is the only unit gate. */
function nflrToWei(nflr: string): bigint {
  return BigInt(nflr) * WEI_PER_NFLR
}

/**
 * The live validator set (`platform.getCurrentValidators`). Validators are
 * live-read, never invented — no NodeID literal lives in library source.
 */
export async function readValidators(
  rpcBase: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ValidatorInfo[]> {
  const result = await rpcCall<CurrentValidatorsResult>(
    rpcBase,
    'platform.getCurrentValidators',
    {},
    fetchImpl,
  )
  return (result.validators ?? []).map((v) => ({
    nodeId: v.nodeID,
    startTime: BigInt(v.startTime),
    endTime: BigInt(v.endTime),
    weight: nflrToWei(v.weight),
  }))
}

/**
 * The live stake floors (`platform.getMinStake`), returned as wei bigints.
 * Minimums are read live, never hardcoded from the docs.
 */
export async function readMinStake(
  rpcBase: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ minDelegatorStake: bigint; minValidatorStake: bigint }> {
  const result = await rpcCall<MinStakeResult>(rpcBase, 'platform.getMinStake', {}, fetchImpl)
  return {
    minDelegatorStake: nflrToWei(result.minDelegatorStake),
    minValidatorStake: nflrToWei(result.minValidatorStake),
  }
}

/**
 * The stake positions owned by `pAddress`, read back from the chain.
 *
 * Source: `platform.getCurrentValidators`. A delegator's position — the nodeId
 * it delegates to, its window and amount — lives inside each validator's
 * `delegators[]`, keyed by the delegator's `rewardOwner.addresses`. This is the
 * only P-chain JSON-RPC read that returns a *position* (with nodeId + window):
 * `platform.getStake` returns only an aggregate `staked` amount plus hex-encoded
 * UTXOs and cannot be mapped to a `StakePosition` without inventing the nodeId
 * and window, so it is deliberately not used here.
 *
 * An account that is nobody's delegator yields `[]` — the honest empty state,
 * never a throw and never a fabricated position. A genuine transport/RPC fault
 * still throws (an absent read is not an empty one).
 */
export async function readStakesOf(
  rpcBase: string,
  pAddress: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<StakePosition[]> {
  const result = await rpcCall<CurrentValidatorsResult>(
    rpcBase,
    'platform.getCurrentValidators',
    {},
    fetchImpl,
  )
  const positions: StakePosition[] = []
  for (const validator of result.validators ?? []) {
    for (const delegator of validator.delegators ?? []) {
      if (delegator.rewardOwner?.addresses?.includes(pAddress)) {
        positions.push({
          nodeId: delegator.nodeID,
          amount: nflrToWei(delegator.weight),
          startTime: BigInt(delegator.startTime),
          endTime: BigInt(delegator.endTime),
        })
      }
    }
  }
  return positions
}

// ---------------------------------------------------------------------------
// bech32 (BIP-173) — a ~40-line local encoder so core stays viem-only.
// The P-address is `P-` + bech32(hrp, ripemd160(sha256(compressedPubKey))).
// hrp is network configuration: `costwo` (Coston2) / `flare` (mainnet).
// ---------------------------------------------------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function bech32Polymod(values: readonly number[]): number {
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= BECH32_GENERATOR[i]!
  }
  return chk
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}

function bech32Checksum(hrp: string, data: readonly number[]): number[] {
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1
  const out: number[] = []
  for (let i = 0; i < 6; i++) out.push((mod >> (5 * (5 - i))) & 31)
  return out
}

/** Regroup 8-bit bytes into the 5-bit words bech32 encodes (with padding). */
function convertBits8to5(bytes: Uint8Array): number[] {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const byte of bytes) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out.push((acc >> bits) & 31)
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}

function bech32Encode(hrp: string, payload: Uint8Array): string {
  const data = convertBits8to5(payload)
  const combined = [...data, ...bech32Checksum(hrp, data)]
  let out = `${hrp}1`
  // `word` is always a 5-bit value (0–31) → charAt is total, no undefined.
  for (const word of combined) out += BECH32_CHARSET.charAt(word)
  return out
}

/**
 * Derive a P-chain address from an already-compressed (33-byte) secp256k1
 * public key: `P-` + bech32(hrp, ripemd160(sha256(pubKey))). The input is
 * already compressed, so no curve math (and thus no secp256k1 dependency) is
 * needed here. `hrp` is `costwo` on Coston2, `flare` on mainnet.
 */
export function pAddressFromPubKey(pubKey: Uint8Array, hrp: string): string {
  const hash = ripemd160(sha256(pubKey, 'bytes'), 'bytes')
  return `P-${bech32Encode(hrp, hash)}`
}
