// packages/core/scripts/pchain-executor.mjs
/**
 * Reference `PChainStakeExecutor` (M11-R5) — the SDK-backed signing edge the viem-only
 * runtime cannot provide itself. It fulfils the `PChainStakeExecutor` seam declared in
 * `packages/core/src/stake-adapter.ts` by wrapping `@flarenetwork/flare-tx-sdk`'s
 * `Network` and signing every cross-substrate leg with a LOCAL key.
 *
 * DEV / live-run ONLY. `@flarenetwork/flare-tx-sdk` (which pulls in `flarejs`) is imported
 * HERE — in `scripts/`, never under any `packages/<pkg>/src`. The shipped packages depend
 * only on the `PChainStakeExecutor` shape; this reference implementation is injected by the
 * live script (`live-stake.mjs`) and by tests, and never ships.
 *
 * The five legs of the round trip (all in wei; startTime/endTime unix seconds):
 *   - `getPAddress()`         — the bech32 P-address the signer controls (`P-costwo…`).
 *   - `transferToP(amount)`   — C→P: export from the C-chain, import onto the P-chain.
 *   - `delegate(intent)`      — `AddPermissionlessDelegator` (SDK `delegateOnP`).
 *   - `transferToC(amount)`   — P→C: export from the P-chain, import back onto the C-chain.
 *   - `claimStakingReward(recipient, amount, wrap)` — `ValidatorRewardManager.claim`.
 *
 * The SDK's transfer/delegate/claim methods resolve to `void`; the real tx ids arrive
 * through the `AfterTxSubmission` callback (a C→P transfer submits TWO — export + import).
 * We buffer every submitted id per call and surface them, so the caller records real
 * broadcast evidence rather than a fabricated hash.
 *
 * SECRETS: the private key lives only inside the signing closure — it is read to build the
 * viem `sign`/public key and is NEVER logged, printed, returned, or written to evidence.
 */
import { serializeSignature } from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'
import { Network } from '@flarenetwork/flare-tx-sdk'

/**
 * A minimal SDK `Wallet` backed by a local key — the `getPublicKey` + `signDigest` shape
 * (the SDK's own `TestDigestWallet` pattern). `signDigest` signs the RAW 32-byte digest the
 * SDK hands it (no extra hashing) and returns the `r‖s‖v` (v = 27/28) serialization the
 * SDK's `ethers`-based `recoverPublicKey`/`recoverAddress` verify against. The uncompressed
 * `account.publicKey` (`0x04…`) is what the probe fed `Network.getPAddress`; the SDK
 * normalises it internally for both P- and C-chain address recovery.
 */
function localKeyWallet(privateKey) {
  const account = privateKeyToAccount(privateKey)
  return {
    async getPublicKey() {
      return account.publicKey
    },
    async getCAddress() {
      return account.address
    },
    async signDigest(digest) {
      // Sign the digest as-is; serialize to r‖s‖v (65 bytes, v∈{27,28}).
      return serializeSignature(await sign({ hash: digest, privateKey }))
    },
  }
}

/**
 * Build the reference executor.
 *
 * @param {object} args
 * @param {`0x${string}`} args.privateKey  Local signing key (never logged).
 * @param {import('@flarenetwork/flare-tx-sdk').Network} [args.network]  SDK network (default COSTON2).
 * @param {(evt: { leg: string; txType: string; txId: string }) => void} [args.onSubmit]  Optional
 *        per-tx-id sink for live evidence (receives real submitted ids, never the key).
 * @returns {import('../dist/index.js').PChainStakeExecutor & { network: import('@flarenetwork/flare-tx-sdk').Network }}
 */
export function makePChainStakeExecutor({ privateKey, network = Network.COSTON2, onSubmit } = {}) {
  if (!privateKey) throw new Error('makePChainStakeExecutor: privateKey is required')
  const wallet = localKeyWallet(privateKey)
  const publicKey = privateKeyToAccount(privateKey).publicKey

  // Per-call submitted-txid buffer. The SDK fires AfterTxSubmission once per broadcast
  // (a C→P/P→C transfer fires twice: export then import). We capture the ids as evidence.
  let leg = 'idle'
  let buffer = []
  network.setAfterTxSubmissionCallback(async ({ txType, txId }) => {
    buffer.push(txId)
    onSubmit?.({ leg, txType, txId })
    return true // proceed to await confirmation
  })

  // Run one SDK signing call, collecting the tx ids it submits. Returns { txId, txIds }
  // where `txId` is the final (settling) broadcast — for a two-tx transfer that is the import.
  const collect = async (label, run) => {
    leg = label
    buffer = []
    await run()
    const txIds = buffer.slice()
    leg = 'idle'
    return { txId: txIds[txIds.length - 1] ?? '', txIds }
  }

  return {
    network,

    async getPAddress() {
      // SDK returns the bech (`costwo1…`); the reads and P-chain RPC use the `P-` form.
      return `P-${network.getPAddress(publicKey)}`
    },

    // C→P: export from the C-chain and import onto the P-chain (two broadcasts).
    async transferToP(amount) {
      return collect('transferToP', () => network.transferToP(wallet, amount))
    },

    // AddPermissionlessDelegator: delegate the imported stake to a live-read validator.
    // startTime/endTime are unix-second bigints inside the validator's active window.
    async delegate(intent) {
      return collect('delegate', () =>
        network.delegateOnP(wallet, intent.amount, intent.nodeId, intent.startTime, intent.endTime),
      )
    },

    // P→C: the delayed return leg — export from the P-chain, import back onto the C-chain.
    async transferToC(amount) {
      return collect('transferToC', () => network.transferToC(wallet, amount))
    },

    // ValidatorRewardManager.claim — claim staking rewards to `recipient`, wrapping when asked.
    // The SDK claims the ENTIRE claimable amount; `amount` is accepted for interface parity and
    // recorded by the caller. rewardOwner defaults to the wallet's own C-chain address.
    async claimStakingReward(recipient, _amount, wrap) {
      const { txId } = await collect('claimStakingReward', () =>
        network.claimStakingReward(wallet, undefined, recipient, wrap),
      )
      return { txHash: /** @type {`0x${string}`} */ (txId) }
    },
  }
}
