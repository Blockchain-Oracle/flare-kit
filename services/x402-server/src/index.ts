import express from 'express'
import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { FLARE_NETWORKS, x402For, type FlareNetworkKey } from '@flarekit-dev/contracts'
import { eip3009Domain } from '@flarekit-dev/core'
import {
  buildChallenge,
  encodePaymentResponse,
  settlePayment,
  syntheticResource,
  type X402ChallengeConfig,
  type X402ServerContext,
} from './x402-settle.js'

/**
 * The flare-kit reference x402 server (M9-R6/R7) — a SINGLE-ENDPOINT fixture, not a
 * marketplace. `GET /api/demo` returns `402`; with an `X-Payment` header it verifies +
 * settles the EIP-3009 authorization via the X402Facilitator and serves an obviously
 * synthetic payload. The operator key is read from `X402_PRIVATE_KEY` — never logged,
 * never in any response. Public config comes from `@flarekit-dev/contracts`.
 */

const NETWORK = (process.env.X402_NETWORK ?? 'coston2') as FlareNetworkKey
const PORT = Number(process.env.X402_PORT ?? 8789)
const KEY = process.env.X402_PRIVATE_KEY as Hex | undefined
// The demo price (0.1 mUSDT0, 6 dp). Overridable; a public constant, not a secret.
const PRICE = BigInt(process.env.X402_PRICE_UNITS ?? '100000')
const MAX_TIMEOUT_SECONDS = 300

if (!KEY) {
  console.error('[x402] X402_PRIVATE_KEY is required (never logged). Exiting.')
  process.exit(1)
}

const deployment = x402For(NETWORK)
const chainCfg = FLARE_NETWORKS[NETWORK]
if (!deployment) {
  console.error(`[x402] no x402 deployment configured for network "${NETWORK}". Exiting.`)
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

const challengeConfig: X402ChallengeConfig = {
  resourcePath: deployment.resourcePath,
  network: NETWORK === 'coston2' ? 'flare-coston2' : 'flare',
  payee: deployment.payee,
  token: deployment.token.address,
  tokenSymbol: deployment.token.symbol,
  facilitator: deployment.facilitator,
  chainId: chainCfg.id,
  maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
  price: PRICE,
}

const ctx: X402ServerContext = {
  publicClient,
  walletClient,
  facilitator: deployment.facilitator,
  token: deployment.token.address,
  payee: deployment.payee,
  minAmount: PRICE,
  domain: eip3009Domain(deployment.token.eip712Name, deployment.token.eip712Version, chainCfg.id, deployment.token.address),
}

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    network: NETWORK,
    chainId: chainCfg.id,
    token: deployment.token.address,
    tokenLabel: `${deployment.token.symbol} (demo)`,
    demoToken: deployment.token.demoToken,
    facilitator: deployment.facilitator,
    payee: deployment.payee,
    resource: deployment.resourcePath,
    priceUnits: PRICE.toString(),
  })
})

app.get(deployment.resourcePath, async (req, res) => {
  // The whole handler is guarded: Express 4 does not catch a rejected async handler, so
  // an unauthenticated malformed X-Payment must never become an unhandled rejection.
  try {
    const header = req.headers['x-payment'] as string | undefined
    if (!header) {
      res.status(402).json(buildChallenge(challengeConfig))
      return
    }
    const result = await settlePayment(ctx, header)
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    // Settlement is real; the resource is synthetic. Two independent facts.
    res.setHeader('X-Payment-Response', encodePaymentResponse(result.paymentId, result.txHash))
    res.json(syntheticResource(nowSeconds(), { paymentId: result.paymentId, txHash: result.txHash }))
  } catch (e) {
    res.status(400).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 160) })
  }
})

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

app.listen(PORT, () => {
  console.log(
    `[x402] single-endpoint fixture on :${PORT} — ${NETWORK} (chain ${chainCfg.id}), ${deployment.resourcePath} priced ${PRICE} ${deployment.token.symbol} (demo), facilitator ${deployment.facilitator}`,
  )
})
