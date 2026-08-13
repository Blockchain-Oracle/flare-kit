# Hackathon Idea Scout: Flare Summer Signal

Research date: 2026-07-22.

## Platform Superpowers

1. **XRP becomes programmable without asking an XRP holder to become a Flare power user.** FAssets turns XRP into FXRP, while Flare Smart Accounts let an XRPL signature authorize Flare actions without a separate FLR balance.
2. **Private computation can produce a result that public contracts can trust.** FCC runs hidden logic or secret-bearing operations in an attested TEE, gates onchain instructions through Flare data-provider consensus, and returns signed results that contracts can verify.

The strongest two-bounty concepts make those capabilities depend on each other: a private decision or secret policy determines what happens to FXRP or another interoperable asset.

## Ranked Candidates

### 1. VeilGuard - private stop-loss and take-profit vault

**It's like:** 1inch limit orders or a TradingView automation, but the trigger price, position size, and strategy remain private until execution.

**The problem:** Public stop-loss and take-profit orders announce where a trader will be forced to buy or sell. Other traders and bots can trade around those levels.

**Why it needs Flare:** FCC keeps the strategy and trigger confidential and signs the result; FTSO supplies the reference price; an onchain vault holds and settles FXRP. Without confidential compute, the strategy leaks. Without Flare's oracle and FXRP, it is a generic automation demo rather than an XRPFi product.

**The zero-friction try:** The judge deposits test FXRP, creates a hidden protection rule, then opens a public-observer view that proves the rule is unreadable. When the condition is met, the app shows the FXRP position settle and exposes only the final action.

**Who actually uses it:** XRP holders, active traders, and vault managers who do not want their risk boundaries broadcast.

**Trend + feasibility:** Private intent execution is a live industry direction, while Flare says XRPFi already has 3.4M+ transactions and still needs deeper strategies and better UX. The loop is self-contained with Coston2 test FXRP and an FTSO price. The deterministic demo must choose a condition that can be reached during judging without faking the oracle. Sources: [XRPFi's next phase](https://flare.network/news/xrpfis-next-phase), `developer-hub/docs/ftso`, and `developer-hub/docs/fcc`.

**Build difficulty:** Medium-high. The product is compact, but FCC setup and safe settlement authorization are the critical path.

### 2. XRP Checkout - merchant checkout for an XRPL-native buyer

**It's like:** Stripe Checkout, but the buyer pays from XRP/XRPL and the merchant receives a programmable Flare settlement without asking the buyer to acquire FLR.

**The problem:** Merchants want a familiar payment session, receipt, status, refund, and reconciliation flow; raw token-transfer screens are not a merchant product.

**Why it needs Flare:** FAssets and Smart Accounts are the bridge between an XRPL authorization and programmable settlement on Flare. A generic EVM checkout does not let an XRP holder remain in their existing XRPL wallet while triggering a Flare workflow.

**The zero-friction try:** The judge opens a hosted invoice, scans or opens the XRP payment request, signs once in an XRPL wallet, and watches the merchant dashboard move from `pending` to `paid` with an onchain receipt and refund control.

**Who actually uses it:** Online merchants, African cross-border sellers, donation platforms, and XRP-heavy communities.

**Trend + feasibility:** Coinbase now exposes card-like stablecoin authorization, capture, refund, and void primitives, and Checkout.com says real-world stablecoin payment volume doubled to $390B in 2025. Flare's own brief explicitly names merchant flows. The MVP is self-contained, but it must add a merchant lifecycle and SDK-shaped integration rather than reproduce the official direct-mint demo. Sources: [Coinbase Payment Acceptance](https://docs.cdp.coinbase.com/payments/payment-acceptance/overview), [Checkout.com/Coinbase](https://www.checkout.com/newsroom/checkout-com-enables-stablecoin-acceptance-for-merchants-in-partnership-with-coinbase), and [`fassets-demo-dapp`](https://github.com/flare-foundation/fassets-demo-dapp).

**Build difficulty:** Medium. The largest risk is reliable XRPL/Xaman test flow and confirmation timing, not contract novelty.

### 3. ZeroDay Escrow - confidential bug-bounty validation and FXRP payout

**It's like:** HackerOne, but an exploit can be validated inside an attested TEE and paid without publishing the vulnerability first.

**The problem:** A security researcher must reveal a vulnerability to prove it exists, but early disclosure can let others exploit it or let the project copy the report without paying.

**Why it needs Flare:** FCC can decrypt the report or exploit input, run deterministic validation privately, and sign a pass/fail result. An onchain escrow then releases FXRP only for a valid submission. Public smart contracts alone cannot inspect a secret exploit without revealing it.

**The zero-friction try:** The judge sees a funded bounty, submits an encrypted exploit against a deliberately vulnerable sample contract, and receives an FXRP payout. A public observer sees the bounty and payout but not the exploit payload.

**Who actually uses it:** Smart-contract teams, security researchers, protocol foundations, and audit competitions.

**Trend + feasibility:** The demand anchor is established bug-bounty workflow; the hackathon loop closes because the bounty, validation target, and payout are all controlled in the demo. The MVP should validate a narrow deterministic class of exploit rather than claim to run arbitrary untrusted code safely. Flare's scaffold supports arbitrary extension business logic and signed results. Source: [`fce-extension-scaffold`](https://github.com/flare-foundation/fce-extension-scaffold) and [FCC overview](https://dev.flare.network/fcc/overview).

**Build difficulty:** Medium-high. The winning version needs a convincing validation target and strict sandbox boundary.

### 4. Agent Allowance - a confidential spending firewall for AI agents

**It's like:** AWS AgentCore Payments, but the agent's wallet key and spending policy live in FCC and payments settle in FXRP.

**The problem:** An autonomous agent needs to pay for APIs and services, but exposing its key or full budget policy to the agent process turns one prompt-injection bug into a drained wallet.

**Why it needs Flare:** FCC can hold the signing key and privately enforce merchant, amount, rate, and daily-budget rules before signing. FXRP gasless forwarding can settle an approved payment. A plain x402 client has payment ability but not an attested, isolated policy boundary.

**The zero-friction try:** The judge asks an agent to buy a paid API result. An allowed purchase succeeds and produces an FXRP transaction; a second request that violates the private daily cap is visibly rejected without exposing the cap or key.

**Who actually uses it:** AI-agent developers, paid API providers, autonomous research tools, and companies delegating limited purchasing authority.

**Trend + feasibility:** AWS launched AgentCore Payments with Coinbase and Stripe in 2026, and Coinbase's payment APIs explicitly support x402-enabled agents. The official Flare docs already provide a TEE signing extension and a gasless FXRP forwarder. Native FXRP x402 remains unavailable because FXRP lacks EIP-3009, so the MVP must clearly use the documented custom forwarder rather than pretend native support exists. Sources: [Coinbase Payment Acceptance](https://docs.cdp.coinbase.com/payments/payment-acceptance/overview), `developer-hub/docs/fxrp/token-interactions/03-x402-payments.mdx`, `04-gasless-fxrp-payments.mdx`, and [`fce-sign`](https://github.com/flare-foundation/fce-sign).

**Build difficulty:** Medium-high. The payment path is documented; the hard part is making the policy boundary and real API purchase obvious.

### 5. DarkRFQ - private request-for-quote for large FXRP swaps

**It's like:** a Coinbase Prime or CoW Swap RFQ, but the desired size, minimum price, and competing dealer quotes remain private until the best quote settles.

**The problem:** A large public swap or quote request leaks intent and invites price movement before execution.

**Why it needs Flare:** FCC can accept encrypted trade intent and dealer quotes, select the best compatible quote, and authorize settlement from an onchain FXRP/USDT0 vault. FTSO can provide a public reference-price guard. The privacy benefit collapses if requests and quotes are public.

**The zero-friction try:** The judge requests a large FXRP quote, two bundled dealer bots submit hidden quotes, and the screen reveals only the winning settlement. A public observer cannot read the losing quotes or the user's minimum.

**Who actually uses it:** XRP treasuries, market makers, OTC desks, and high-value traders.

**Trend + feasibility:** The flow is self-contained with two deterministic market-maker personas and test tokens. It must be framed as a one-shot institutional RFQ, not as another private orderbook, because Flare already publishes a complete confidential orderbook reference. Source: [`fce-orderbook`](https://github.com/flare-foundation/fce-orderbook) and [FCC overview](https://dev.flare.network/fcc/overview).

**Build difficulty:** High. Atomic settlement and balance accounting must be credible, and the distinction from the reference orderbook must stay crisp.

### 6. BlindLaunch - sealed allocation sale settled in FXRP

**It's like:** CoinList, but bids and demand remain sealed while FCC computes a transparent clearing result.

**The problem:** Public token-sale bids leak demand, encourage copying, and let late bidders trade around earlier participants.

**Why it needs Flare:** FCC keeps bids secret and computes the allocation; the public contract escrows the sale asset and FXRP, verifies the signed result, and settles. A public contract cannot run a sealed auction without extra cryptography or reveal phases.

**The zero-friction try:** Two judge-controlled bidder tabs submit different hidden bids, the auction closes, and the app reveals the uniform clearing price, allocation, and refunds in one settlement moment.

**Who actually uses it:** Token issuers, NFT/RWA sellers, treasury managers, and grant programs allocating scarce slots.

**Trend + feasibility:** A 2025 research implementation demonstrated TEE-backed sealed bids with public-chain settlement, which validates the technical product shape. The loop is fully self-contained. The risk is originality: private auctions are named in the bounty and will be an obvious choice for other teams. Source: [Cross-Chain Sealed-Bid Auctions Using Confidential Compute Blockchains](https://arxiv.org/abs/2510.19491).

**Build difficulty:** Medium. The core is straightforward, so product polish and a specific market niche decide whether it feels generic.

### 7. SecretBallot - private voting with an auditable final tally

**It's like:** Snapshot, but individual votes stay secret and only the final result is published with an attested execution proof.

**The problem:** Public votes expose political preferences and make live tallies influence later voters.

**Why it needs Flare:** FCC decrypts and tallies ballots privately, while an onchain contract enforces eligibility and verifies the signed tally. A normal public voting contract cannot keep choices secret.

**The zero-friction try:** Three preloaded voters cast encrypted ballots; the public view shows turnout but no choices. At close, the tally appears and double-vote attempts fail.

**Who actually uses it:** DAOs, validator communities, investment committees, clubs, and grant juries.

**Trend + feasibility:** Confidential governance appears repeatedly in privacy-platform ecosystems, and the demo is contained. It is technically clean but uses fewer Flare-specific asset primitives and has less direct commercial pull than the higher-ranked ideas. Comparable privacy hackathons already attract many confidential-governance entries. Source: [Zama PL Genesis overview](https://www.zama.org/post/zama-at-the-pl-genesis-hackathon-the-winning-projects).

**Build difficulty:** Medium-low. Easy to demonstrate, harder to make uniquely Flare-native.

### 8. PocketVault - goal-based XRP savings into Flare vaults

**It's like:** Acorns or a one-click Yearn deposit, but the user begins and remains in an XRPL wallet.

**The problem:** XRP holders face wallet, gas-token, bridging, vault-selection, and withdrawal complexity before earning yield.

**Why it needs Flare:** Smart Accounts and FAssets turn XRPL signatures into FXRP minting and Flare vault actions without an FLR balance.

**The zero-friction try:** The judge chooses a savings goal and risk label, signs the XRPL flow, and sees the resulting FXRP vault position and progress toward the goal.

**Who actually uses it:** Long-term retail XRP holders who do not identify as DeFi users.

**Trend + feasibility:** Flare says UX and distribution are still major XRPFi bottlenecks, so the user problem is real. However, D'CENT and Flare already ship a two-signature, one-flow XRP-to-vault experience. This concept is viable only with a genuinely distinct distribution surface or user job; otherwise it is a red-flag repeat. Sources: [XRPFi's next phase](https://flare.network/news/xrpfis-next-phase) and [D'CENT integration](https://flare.network/news/flare-and-dcent-bring-one-flow-institutional-yield-to-xrp-holders-worldwide).

**Build difficulty:** Medium. Technically grounded, but differentiation is harder than implementation.

## Top 3

### 1. VeilGuard

Best overall fit because the privacy payoff is visible, FXRP and FTSO are structural rather than decorative, and the product maps directly to an XRPFi user with money at risk. It can credibly enter both bounties. Its only serious weakness is FCC infrastructure risk, which should be tested immediately.

### 2. XRP Checkout

Best lower-risk route and best pure Bounty 1 candidate. It matches the explicitly eligible merchant direction, aligns with current payment adoption, and can look like a real product rather than a protocol dashboard. It needs merchant lifecycle features and a polished hosted checkout to rise above the official direct-mint demo.

### 3. ZeroDay Escrow

Best originality and clearest explanation of why confidential compute is necessary. The judge payoff is memorable: a secret exploit is proven and paid without disclosure. Keeping validation narrow and deterministic prevents the concept from collapsing into an unshippable general-purpose security platform.

## Ideas Deliberately Deprioritized

- **Generic private orderbook:** Flare already publishes one as a serious reference implementation.
- **Shielded transfers or confidential payroll:** Flare's shielded-transfer reference is already close to the product core, and private payroll won a major 2026 confidential-compute hackathon.
- **Generic TEE AI assistant/RAG:** Prior Flare winners already cover conversational DeFi, voice agents, RAG, fact checking, social summarization, and model consensus.
- **Private credit score/lending:** Comparable 2026 winners already include confidential lending and private BNPL, while a credible version introduces underwriting and liquidity assumptions that are hard to close inside this demo.
- **Weather insurance:** Flare publishes a complete FCC weather-insurance extension.

## Decision Gate

Before any specification or code, validate one operational fact with the Flare team: whether custom Coston2 FCC builders receive working indexer access or a hosted development path. If yes, VeilGuard and ZeroDay Escrow remain top choices. If not, XRP Checkout becomes the rational primary build because its core can be completed without the custom FCC stack.
