// packages/core/scripts/probe-memo-flow.mjs
// M14-AC3 — read-only, KEYLESS probe of the direct-minting memo flow, on BOTH networks:
//   - Coston2 (id 114) — the write/verify target,
//   - Flare mainnet (id 14) — the read lens.
//
// It answers the four questions M14 was built on, against the deployed contracts rather
// than against our transcription of them:
//
//   1) IS `executeDirectMintingWithData` ACTUALLY THERE? M13's spec recorded its absence as
//      a protocol fact and it was not one — it was a gap in our own ABI, found in M14's
//      build. So this probe does not trust the ABI it just gained.
//
//      The FIRST version of this probe answered by `eth_call`ing the selector with an
//      invalid proof and reading the revert, and that did not work: `executeDirectMinting`,
//      which we have called live since M1, failed identically to the function under test —
//      both "execution reverted for an unknown reason". A revert with undecodable data
//      cannot distinguish a facet rejecting a proof from a fallback that never heard of the
//      selector. The eth_call is kept as corroboration and is NOT the evidence.
//
//      The evidence is the EIP-2535 diamond loupe: `facetAddress(bytes4)` names the facet
//      implementing a selector, or returns the zero address. Positive identification rather
//      than an inference drawn from a failure — and the selector is derived from the very
//      ABI entry the kit encodes with, so the question asked is exactly "is the call we
//      would send routable?"
//   2) THE FEE SETTINGS THE PLAN GATE DEPENDS ON. Every refusal in `memo-plan.ts` is
//      computed against the live minimum minting fee, and a plan built on a stale copy would
//      wave through a payment that burns entirely to the fee receiver.
//   3) THE THREE MEMO READS M13 ALREADY CALLED — `getNonce`, `getExecutor`,
//      `isTransactionIdUsed` — confirmed on both networks for the memo path.
//   4) THE REPLACEMENT FEE HAS NO EXTERNAL GETTER. `getReplacementFee` is `internal view`
//      (`MemoInstructions.sol:166-174`) and no facet exposes it, so the `ReplacementFeeSet`
//      event is the only observable. This probe PROVES the absence on chain rather than
//      citing the source: it calls the selector the natural name would have and records the
//      failure. SPEC.md's AC3 asked for the fee to "read back through the accessor"; there
//      is no accessor, and that clause is corrected rather than quietly skipped.
//
//   node packages/core/scripts/probe-memo-flow.mjs
//
// KEYLESS: no private key, no XRPL seed, no signing, no broadcast. Every write-shaped call
// below is an `eth_call` against a node — nothing here can move value.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, encodeFunctionData, http, keccak256, toFunctionSelector, toHex } from 'viem'
import {
  ATTESTATION_TYPES,
  assetManagerAbi,
  masterAccountControllerAbi,
  FLARE_NETWORKS,
  prepareRequestUrl,
  registryFor,
  smartAccountsFor,
} from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const EV_PATH = `${ROOT}/.thoughts/verification/2026-08-14-m14-probe.json`

/** The run's XRPL address — an ADDRESS only. Its seed is not read and cannot be. */
const XRPL_OWNER = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
/** A real Coston2 XRPL payment id from M1's live mint, so the replay read has a true subject. */
const KNOWN_TX_ID = '0x3f8394997fd81d36c6da3b626b4ce6d1fa594911fe97c150977b14e5b6ab6c03'

/** Every read returns `{ok, value}` or `{ok:false, error}`. Nothing is ever coerced to a zero. */
async function attempt(label, run) {
  try {
    return { label, ok: true, value: await run() }
  } catch (error) {
    return { label, ok: false, error: String(error?.shortMessage ?? error?.message ?? error).slice(0, 300) }
  }
}

const serialise = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

async function probeNetwork(key) {
  const chain = FLARE_NETWORKS[key]
  const registry = registryFor(chain.id)
  const deployment = registry.fassets.XRP
  const smartAccounts = smartAccountsFor(key)
  const client = createPublicClient({ transport: http(chain.rpcUrl) })

  const read = (address, abi, functionName, args = []) =>
    client.readContract({ address, abi, functionName, args })

  const assetManager = deployment?.assetManager
  const controller = smartAccounts.masterAccountController

  // ---- 2) The fee settings the gate computes every refusal against.
  const fees = assetManager
    ? {
        feeBIPS: await attempt('getDirectMintingFeeBIPS', () =>
          read(assetManager, assetManagerAbi, 'getDirectMintingFeeBIPS'),
        ),
        minimumFeeUBA: await attempt('getDirectMintingMinimumFeeUBA', () =>
          read(assetManager, assetManagerAbi, 'getDirectMintingMinimumFeeUBA'),
        ),
        executorFeeUBA: await attempt('getDirectMintingExecutorFeeUBA', () =>
          read(assetManager, assetManagerAbi, 'getDirectMintingExecutorFeeUBA'),
        ),
        coreVaultAddress: await attempt('directMintingPaymentAddress', () =>
          read(assetManager, assetManagerAbi, 'directMintingPaymentAddress'),
        ),
        delayState: await attempt('directMintingDelayState(known tx)', () =>
          read(assetManager, assetManagerAbi, 'directMintingDelayState', [KNOWN_TX_ID]),
        ),
      }
    : undefined

  // ---- 1) Is `executeDirectMintingWithData` on the deployed diamond?
  //
  // Called with an all-zero proof, which CANNOT succeed. What matters is HOW it fails: a
  // named protocol refusal proves the selector routed to a facet that executed and rejected
  // the proof. "function does not exist" / "no data" proves the opposite. Recorded verbatim
  // either way — this probe reports what the node said, it does not grade it.
  const zeroProof = {
    merkleProof: [],
    data: {
      attestationType: `0x${'00'.repeat(32)}`,
      sourceId: `0x${'00'.repeat(32)}`,
      votingRound: 0n,
      lowestUsedTimestamp: 0n,
      requestBody: { transactionId: `0x${'00'.repeat(32)}`, proofOwner: `0x${'00'.repeat(20)}` },
      responseBody: {
        blockNumber: 0n,
        blockTimestamp: 0n,
        sourceAddress: '',
        sourceAddressHash: `0x${'00'.repeat(32)}`,
        receivingAddressHash: `0x${'00'.repeat(32)}`,
        intendedReceivingAddressHash: `0x${'00'.repeat(32)}`,
        spentAmount: 0n,
        intendedSpentAmount: 0n,
        receivedAmount: 0n,
        intendedReceivedAmount: 0n,
        hasMemoData: false,
        firstMemoData: '0x',
        hasDestinationTag: false,
        destinationTag: 0n,
        status: 0,
      },
    },
  }

  // The eth_call above is NOT a sufficient discriminator, and the first run of this probe
  // proved it: `executeDirectMinting` — a function we have called live since M1 — and
  // `executeDirectMintingWithData` BOTH answered "execution reverted for an unknown reason".
  // A revert with undecodable data looks identical whether the selector routed to a facet
  // that rejected the proof or hit a fallback that had never heard of it.
  //
  // The diamond loupe answers it exactly. `facetAddress(bytes4)` returns the facet
  // implementing a selector, or the zero address when nothing does. That is a positive
  // identification rather than an inference from a failure.
  const LOUPE_ABI = [
    {
      type: 'function',
      name: 'facetAddress',
      stateMutability: 'view',
      inputs: [{ name: '_functionSelector', type: 'bytes4' }],
      outputs: [{ name: 'facetAddress_', type: 'address' }],
    },
  ]

  // The selector is derived from THE VERY ABI ENTRY the kit encodes calls with, not from a
  // signature typed out by hand here. That is the point: a hand-written tuple string could
  // be wrong in the same way the ABI is wrong, and the two mistakes would agree with each
  // other. This way the question asked is exactly "is the thing we would send routable?"
  const loupe = (functionName) =>
    attempt(`facetAddress(${functionName})`, async () => {
      const item = assetManagerAbi.find((f) => f.type === 'function' && f.name === functionName)
      if (!item) return { present: false, note: 'not in our ABI at all' }
      const selector = toFunctionSelector(item)
      const facet = await read(assetManager, LOUPE_ABI, 'facetAddress', [selector])
      return { selector, facet, present: !/^0x0{40}$/i.test(facet) }
    })

  const selectorProbe = async (functionName, args) =>
    attempt(functionName, async () => {
      const data = encodeFunctionData({ abi: assetManagerAbi, functionName, args })
      await client.call({ to: assetManager, data })
      // An all-zero proof succeeding would be a far bigger finding than a missing function.
      return 'RETURNED WITHOUT REVERTING — investigate'
    })

  const withData = assetManager
    ? await selectorProbe('executeDirectMintingWithData', [zeroProof, '0x'])
    : undefined
  const plain = assetManager ? await selectorProbe('executeDirectMinting', [zeroProof]) : undefined

  // ---- 3) The three memo reads, on the controller M13 already drives.
  const personalAccount = await attempt('getPersonalAccount', () =>
    read(controller, masterAccountControllerAbi, 'getPersonalAccount', [XRPL_OWNER]),
  )
  const account = personalAccount.ok ? personalAccount.value : undefined

  const memoReads = {
    getNonce: account
      ? await attempt('getNonce', () =>
          read(controller, masterAccountControllerAbi, 'getNonce', [account]),
        )
      : undefined,
    getExecutor: account
      ? await attempt('getExecutor', () =>
          read(controller, masterAccountControllerAbi, 'getExecutor', [account]),
        )
      : undefined,
    isTransactionIdUsed: await attempt('isTransactionIdUsed', () =>
      read(controller, masterAccountControllerAbi, 'isTransactionIdUsed', [KNOWN_TX_ID]),
    ),
  }

  // ---- 4) Prove the replacement fee has no external getter.
  //
  // `getReplacementFee(address,bytes32)` is `internal view` in the library and no facet
  // re-exposes it. Calling the selector it WOULD have had is how that becomes an observation
  // rather than a reading of the source.
  const replacementFeeGetter = await attempt('getReplacementFee (expected ABSENT)', async () => {
    const selector = keccak256(toHex('getReplacementFee(address,bytes32)')).slice(0, 10)
    const result = await client.call({
      to: controller,
      data: `${selector}${(account ?? `0x${'00'.repeat(20)}`).slice(2).padStart(64, '0')}${KNOWN_TX_ID.slice(2)}`,
    })
    return `RETURNED ${result?.data ?? '(no data)'} — an external getter EXISTS after all`
  })

  // ---- The XRPPayment verifier route. M13 built the chain-agnostic `Payment`; this flow
  // needs `XRPPayment`, because it is the only family that carries the raw memo bytes.
  const verifier = await attempt('XRPPayment prepareRequest route', async () => {
    const url = prepareRequestUrl(registry.services.verifierBaseUrl, 'xrp', 'XRPPayment')
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        [registry.services.apiKeyHeader]: registry.services.publicApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attestationType: ATTESTATION_TYPES.XRPPayment,
        sourceId: null,
        requestBody: { transactionId: KNOWN_TX_ID, proofOwner: `0x${'00'.repeat(20)}` },
      }),
    })
    // A 400/INVALID here is a SERVED route answering about the request. Only a transport
    // failure or a 404 would say the route is absent, and those are different facts.
    return { status: response.status, body: (await response.text()).slice(0, 240) }
  })

  return {
    network: key,
    chainId: chain.id,
    rpcUrl: chain.rpcUrl,
    masterAccountController: controller,
    assetManager: assetManager ?? null,
    smartAccountsVerified: smartAccounts.smartAccountsVerified,
    fees,
    // The loupe is the ANSWER; the eth_call beside it is only corroboration.
    selectorsOnDiamond: assetManager
      ? {
          executeDirectMintingWithData: await loupe('executeDirectMintingWithData'),
          executeDirectMinting: await loupe('executeDirectMinting'),
          markUnblockedDirectMintingAllowed: await loupe('markUnblockedDirectMintingAllowed'),
        }
      : undefined,
    executeDirectMintingWithData: withData,
    executeDirectMinting: plain,
    personalAccount,
    memoReads,
    replacementFeeGetter,
    verifier,
  }
}

const evidence = {
  probe: 'M14-AC3 — direct-minting memo flow, keyless',
  ranAt: new Date().toISOString(),
  xrplOwner: XRPL_OWNER,
  knownTransactionId: KNOWN_TX_ID,
  networks: [await probeNetwork('coston2'), await probeNetwork('flare')],
  notes: [
    'KEYLESS: no key or seed was read; every write-shaped call is an eth_call.',
    'A read that threw is recorded as {ok:false,error} and never coerced to a zero.',
    'executeDirectMintingWithData is confirmed by the DIAMOND LOUPE, not by trusting our ABI ' +
      'and not by reading a revert — M13 recorded its absence as a protocol fact and that was ' +
      'wrong. The eth_call beside it is corroboration only: it cannot tell a rejecting facet ' +
      'from a missing selector, which the first run of this probe demonstrated.',
    'getReplacementFee has no external getter (MemoInstructions.sol:166, internal view). ' +
      'SPEC.md AC3 asked for it to read back through an accessor; there is none, so the ' +
      'ReplacementFeeSet event is the only observable and AC3 is corrected accordingly.',
  ],
}

mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
writeFileSync(EV_PATH, `${JSON.stringify(serialise(evidence), null, 2)}\n`)
console.log(JSON.stringify(serialise(evidence), null, 2))
console.log(`\nwrote ${EV_PATH}`)
