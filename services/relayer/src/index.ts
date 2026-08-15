import express from 'express'
import { createPublicClient, createWalletClient, http, getAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { FLARE_NETWORKS, FORWARDER_ABI, gaslessFor, type FlareNetworkKey } from '@flarekit-dev/contracts'
import { executePayment, type RelayerContext } from './relayer-execute.js'

/**
 * The flare-kit reference fee-free gasless relayer (M9-R5). `GET /nonce/:addr` and
 * `POST /execute`. It imports the EIP-712 crypto and validation from `@flarekit-dev/core`
 * (via relayer-execute.ts), absorbs its own gas, and adds no fee or quota.
 *
 * The operator key is read from `RELAYER_PRIVATE_KEY` — never an env-echoed public
 * value, never logged, never included in any response body. Public config (RPC, chain
 * id, addresses) comes from the constants in `@flarekit-dev/contracts`.
 */

const NETWORK = (process.env.RELAYER_NETWORK ?? 'coston2') as FlareNetworkKey
const PORT = Number(process.env.RELAYER_PORT ?? 8788)
const KEY = process.env.RELAYER_PRIVATE_KEY as Hex | undefined

if (!KEY) {
  console.error('[relayer] RELAYER_PRIVATE_KEY is required (never logged). Exiting.')
  process.exit(1)
}

const deployment = gaslessFor(NETWORK)
const chainCfg = FLARE_NETWORKS[NETWORK]
if (!deployment) {
  console.error(`[relayer] no gasless deployment configured for network "${NETWORK}". Exiting.`)
  process.exit(1)
}

const viemChain = {
  id: chainCfg.id,
  name: chainCfg.name,
  nativeCurrency: chainCfg.nativeCurrency,
  rpcUrls: { default: { http: [chainCfg.rpcUrl] } },
}
const account = privateKeyToAccount(KEY)
const publicClient = createPublicClient({ chain: viemChain, transport: http(chainCfg.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chainCfg.rpcUrl) })

const ctx: RelayerContext = {
  publicClient,
  walletClient,
  forwarder: deployment.forwarder,
  fxrp: deployment.fxrp.address,
  chainId: chainCfg.id,
}

function shortErr(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 160)
}

const app = express()
app.use(express.json())

// Config only — addresses, never the key.
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    network: NETWORK,
    chainId: chainCfg.id,
    forwarder: deployment.forwarder,
    fxrp: deployment.fxrp.address,
    relayer: account.address,
    feeFree: true,
  })
})

app.get('/nonce/:addr', async (req, res) => {
  try {
    const addr = getAddress(req.params.addr)
    const nonce = (await publicClient.readContract({
      address: deployment.forwarder,
      abi: FORWARDER_ABI,
      functionName: 'getNonce',
      args: [addr],
    })) as bigint
    res.json({ address: addr, nonce: nonce.toString() })
  } catch (e) {
    res.status(400).json({ error: shortErr(e) })
  }
})

app.post('/execute', async (req, res) => {
  try {
    const b = req.body ?? {}
    if (!b.from || !b.to || b.amount == null || b.deadline == null || !b.signature) {
      res.status(400).json({ ok: false, error: 'from, to, amount, deadline, signature are required' })
      return
    }
    const result = await executePayment(ctx, {
      from: getAddress(b.from),
      to: getAddress(b.to),
      amount: BigInt(b.amount),
      deadline: BigInt(b.deadline),
      signature: b.signature as Hex,
    })
    // A rejected-but-well-formed request is 422 (the request was understood, refused).
    res.status(result.ok ? 200 : 422).json(result)
  } catch (e) {
    res.status(400).json({ ok: false, error: shortErr(e) })
  }
})

app.listen(PORT, () => {
  // Config only — NEVER the key.
  console.log(
    `[relayer] fee-free gasless relayer listening on :${PORT} — ${NETWORK} (chain ${chainCfg.id}), forwarder ${deployment.forwarder}, relayer ${account.address}`,
  )
})
