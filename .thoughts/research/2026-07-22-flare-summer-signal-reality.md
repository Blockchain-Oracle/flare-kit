# Reality Research: Flare Summer Signal

## Scope

Establish the current hackathon rules, the Flare primitives that are actually available to builders, the state of the official examples, the deployment constraints, and the most important overlap risks before choosing a project.

Research date: 2026-07-22 (Africa/Lagos).

## Sources Checked

- Hackathon brief supplied by Abu in the task, including dates, bounties, submission requirements, and judging criteria.
- Context7 library resolution and documentation for `/flare-foundation/developer-hub` (high-reputation source, 5,076 indexed snippets).
- Local shallow clone of [`flare-foundation/developer-hub`](https://github.com/flare-foundation/developer-hub) at commit `b9562d89133de99bd07e5c1aa099efc724a5555c`, dated 2026-07-22.
- Flare Developer Hub pages and examples under `developer-hub/docs/fcc`, `developer-hub/docs/fxrp`, `developer-hub/docs/fassets`, `developer-hub/docs/fdc`, `developer-hub/docs/smart-accounts`, and `developer-hub/examples`.
- Flare Confidential Compute whitepaper at `developer-hub/static/pdf/whitepapers/20260706-FlareConfidentialCompute.pdf`.
- Current Flare Foundation organization repositories via the GitHub API, especially `fce-extension-scaffold`, `fce-orderbook`, `fce-shielded-transfers`, `fce-weather-insurance`, `fce-sign`, `fassets-demo-dapp`, `flare-smart-accounts`, and `flare-ai-kit`.
- Official [STP.13 governance proposal](https://proposals.flare.network/STP/STP_13.html), [FCC Songbird launch article](https://flare.network/news/flare-confidential-compute-votes-to-launch-on-songbird), [XRPFi update](https://flare.network/news/xrpfis-next-phase), and [D'CENT Smart Accounts integration](https://flare.network/news/flare-and-dcent-bring-one-flow-institutional-yield-to-xrp-holders-worldwide).
- Official [Flare x Google Cloud hackathon winners](https://flare.network/news/google-cloud-hackathon-winners) and comparable confidential-compute winners from [Zama at PL Genesis](https://www.zama.org/post/zama-at-the-pl-genesis-hackathon-the-winning-projects).

## Verified Facts

### Hackathon

- Development opened June 29, 2026, and final submissions are due August 14, 2026. On the research date, 23 calendar days remain; the exact submission cutoff time was not stated in the supplied brief.
- There are two separate $6,000 pools: Interoperable Asset Products and Confidential Compute Apps. Each pays $4,000 for first and $2,000 for second.
- The judging criteria explicitly reward product usefulness, meaningful Flare integration, technical execution, evidence of new work, clarity, and future potential.
- Existing projects are eligible, but submissions must separate pre-existing work from work newly built, ported, integrated, or improved during the program.
- Distribution evidence and real-user feedback are not strict requirements, but the brief says they help judges evaluate seriousness and potential beyond the hackathon.

### FXRP, FAssets, and XRP-facing UX

- FXRP is the ERC-20 FAsset representation of XRP on Flare. FAssets is an over-collateralized bridge design that uses FDC to verify source-chain activity. Source: `developer-hub/docs/fxrp/overview.mdx` and `developer-hub/docs/fassets/01-overview.mdx`.
- Test FXRP is directly available from the Coston2 faucet, so a demo does not have to complete a live XRPL-to-Flare mint before a judge can try an FXRP action. Source: `developer-hub/docs/fxrp/overview.mdx`.
- Flare Smart Accounts assign an XRPL user a deterministic Flare account and allow the XRPL user to control Flare actions through signed XRPL payments, without holding FLR. Supported flows include FXRP transfer/redemption and deposits into Firelight- and Upshift-style vaults. Source: `developer-hub/docs/smart-accounts/1-overview.mdx`.
- The direct-minting memo path can carry a custom EIP-4337-style operation to a Flare Smart Account. This is a real route for turning an XRPL payment into a programmable Flare action. Source: `developer-hub/docs/smart-accounts/1-overview.mdx`.
- The official FAssets demo already covers settings, direct minting with Xaman, minting tags, FXRP transfers, redemption, and FDC redemption completion. A submission that only reproduces these screens would overlap heavily with official material. Source: [`flare-foundation/fassets-demo-dapp`](https://github.com/flare-foundation/fassets-demo-dapp).
- FXRP has current LayerZero OFT routes across Flare, HyperEVM/HyperCore, Ethereum, Base, BNB Smart Chain, Monad, and Katana. The docs also publish a Coston2-to-Hyperliquid test route. Source: `developer-hub/docs/fxrp/oft/index.mdx`.
- Gasless FXRP transfer is documented through a custom EIP-712 forwarder and relayer after a one-time token approval. Native x402 with FXRP is not yet documented as available because the token does not yet implement EIP-3009; the current x402 guide uses MockUSDT0. Source: `developer-hub/docs/fxrp/token-interactions/03-x402-payments.mdx` and `04-gasless-fxrp-payments.mdx`.
- Flare reported in May 2026 that its XRPFi ecosystem had about $200M in XRP TVL, $440M total ecosystem size, 3.4M+ FXRP DeFi transactions, and about 16.5K users since launch. The same article identifies fragmented UX, vault capacity, strategy depth, and distribution as remaining problems. Source: [XRPFi's next phase](https://flare.network/news/xrpfis-next-phase).
- A one-flow XRP-to-vault experience is already live through D'CENT and Flare Smart Accounts. It uses two XRPL signatures, requires no separate EVM wallet or FLR gas management, and automatically mints FXRP and deposits it into a selected Flare vault. This makes a generic "one-click XRP yield" submission an overlap risk unless it has a distinct user, distribution channel, or product job. Source: [Flare and D'CENT](https://flare.network/news/flare-and-dcent-bring-one-flow-institutional-yield-to-xrp-holders-worldwide).

### Flare Confidential Compute

- FCC combines onchain instruction contracts, Flare data providers/cosigners, public TEE proxies, and attested TEE machines. A TEE executes an instruction after it sees the configured threshold of current signing weight, normally more than 50%. Source: `developer-hub/docs/fcc/1-overview.mdx` and the July 2026 FCC whitepaper.
- Custom applications are Flare Compute Extensions. An extension is defined by supported reproducible code versions and registered TEE machines; signed results can be verified or consumed onchain. Source: `developer-hub/docs/fcc/1-overview.mdx`.
- FCC is not yet described by the Developer Hub as a fully public production system. The documented hackathon path runs a locally simulated TEE against real Coston2, with Docker, a public HTTPS tunnel, Coston2 funds, and access to Flare's C-chain indexer database. Source: `developer-hub/docs/fcc/guides/00-getting-started.mdx`.
- The Coston2 scaffold provides a working instruction lifecycle and extension handlers. The application controls the onchain instruction-sender contract and the extension business logic; the TEE node and proxy handle attestation, signing, and message routing. Source: `developer-hub/docs/fcc/guides/00-getting-started.mdx` and [`flare-foundation/fce-extension-scaffold`](https://github.com/flare-foundation/fce-extension-scaffold).
- STP.13 was accepted on July 12, 2026. It introduces FCC to Songbird with FDC V2 and XRPL Protocol Managed Wallets. The initial deployment uses Foundation-operated Google Confidential Compute machines for system extensions; custom-extension infrastructure is present, but no custom extension is registered at launch. Source: [STP.13](https://proposals.flare.network/STP/STP_13.html).
- FCC's explicit trust assumptions include the TEE hardware/attestation chain, the honest weighted majority of Flare data providers, and availability of the TEE owner/proxy. The whitepaper also states that the first signing policy received by a new TEE must be trusted and that TEE security remains an evolving attack surface. Source: `developer-hub/static/pdf/whitepapers/20260706-FlareConfidentialCompute.pdf`.
- Data-provider augmentation is not automatically available for arbitrary new tasks. The whitepaper says use cases that require providers to assemble special offchain inputs must be clearly defined and supported by those providers. A hackathon extension should not assume custom provider behavior without organizer confirmation. Source: FCC whitepaper, section 3.2.

### Official overlap and prior-winner risks

- Flare publishes a complete confidential orderbook reference with private resting orders, price-time matching, TEE-held state, onchain custody, signed withdrawals, a frontend, and load tests. A basic private orderbook is not a fresh project shape. Source: [`flare-foundation/fce-orderbook`](https://github.com/flare-foundation/fce-orderbook).
- Flare publishes a complete shielded ERC-20 transfer reference with private balances, ECIES-encrypted operations and replies, onchain custody, KYC hooks, audit access, signed withdrawals, and a frontend. A basic private payment ledger or confidential payroll built by lightly adapting this repo has a strong overlap problem. Source: [`flare-foundation/fce-shielded-transfers`](https://github.com/flare-foundation/fce-shielded-transfers).
- Flare also publishes weather-insurance and private-key signing extensions. The weather example includes encrypted policy terms, external API access inside the TEE, and onchain settlement. Source: [`flare-foundation/fce-weather-insurance`](https://github.com/flare-foundation/fce-weather-insurance) and [`flare-foundation/fce-sign`](https://github.com/flare-foundation/fce-sign).
- Previous Flare x Google Cloud winners already covered conversational DeFi, voice-controlled DeFi, TEE RAG/fact checking, social summarization, and multi-model NFT appraisal. A generic "AI agent on Flare" or "RAG in a TEE" would repeat a proven but crowded shape. Source: [Flare x Google Cloud winners](https://flare.network/news/google-cloud-hackathon-winners).
- Comparable 2026 confidential-compute winners already covered private payroll, confidential lending, encrypted file sharing, private credit, and private VPN usage. Source: [Zama at PL Genesis](https://www.zama.org/post/zama-at-the-pl-genesis-hackathon-the-winning-projects).

## Inferences

- The strongest unused surface is likely not a raw protocol primitive. Flare already supplies extensive protocol examples; the hackathon brief rewards turning them into a focused product for a named user with a visible end-to-end outcome.
- Entering both bounties can be credible only when the confidential computation directly controls or improves an interoperable-asset workflow. Adding FXRP as a cosmetic payment token to an otherwise unrelated FCC demo would be superficial.
- A Coston2 FXRP product has a lower infrastructure risk than a custom FCC product. A custom FCC product has a stronger novelty ceiling but depends on the organizer/indexer/TEE path working early.
- Product concepts involving custom data-provider augmentation, production PMWs, or arbitrary Songbird custom extensions carry schedule risk unless confirmed in office hours or the Telegram group.
- Because distribution evidence is explicitly encouraged, a narrowly defined product that can recruit 3-5 real testers before August 14 may score better than a technically broader platform with no observable user loop.

## Unknowns And Questions

- The exact August 14 submission cutoff time and timezone.
- Whether entrants will receive shared Coston2 indexer credentials or a hosted FCC development environment.
- Whether the organizers expect custom extensions to remain on Coston2 for judging or will support Songbird deployment during the hackathon.
- Whether one submission may win both bounty pools, or merely be entered in both.
- Whether judges will have Xaman/XRPL testnet wallets ready, which affects the lowest-friction demo path for XRP-native checkout.
- Whether teams may deploy modified versions of official reference repositories and how judges will weigh the amount of new work.
- Which projects are already being built by the current participant cohort; the public sources checked did not expose a reliable current submission list.

## Not Included

- No final project selection.
- No product specification, architecture, implementation plan, contract design, or code.
- No claim that an unannounced or trial-stage Songbird capability will be available before the deadline.

