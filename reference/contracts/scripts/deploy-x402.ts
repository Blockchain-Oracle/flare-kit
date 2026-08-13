/**
 * Deploy MockUSDT0 (demo token) + X402Facilitator to Coston2, wire them up, and
 * mint a demo balance to the AC1/AC3 payer.
 *
 *   pnpm --dir reference/contracts run deploy:x402
 *   (or:  cd reference/contracts && npm run deploy:x402)
 *
 * MockUSDT0 is a LABELLED DEMO token — the only EIP-3009 substrate on Coston2. The
 * facilitator is deployed FEE-FREE (feeBps = 0; the fee fields are inert anyway).
 * The payee is the operator (the x402 server's receiving address); the payer (the
 * client) is minted a demo balance so it can sign EIP-3009 authorizations in Task 11.
 * Addresses recorded to deployments/coston2.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import hre from "hardhat";

const DEPLOYMENTS = resolve(__dirname, "../deployments/coston2.json");
const PAYER_SECRET = resolve(__dirname, "../../../.secrets/m9-payer.json");
const DEMO_MINT = 1_000n * 10n ** 6n; // 1000 mUSDT0 (6 dp) to the payer for the demo

function payerAddress(): string {
  const p = JSON.parse(readFileSync(PAYER_SECRET, "utf8"));
  return p.address as string; // address only; the key never enters this script
}

function mergeDeployment(section: string, data: Record<string, unknown>, deployer: string) {
  const prev = existsSync(DEPLOYMENTS) ? JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) : {};
  const next = {
    ...prev,
    network: "coston2",
    chainId: 114,
    deployer,
    updatedAt: new Date().toISOString(),
    [section]: data,
  };
  mkdirSync(resolve(__dirname, "../deployments"), { recursive: true });
  writeFileSync(DEPLOYMENTS, JSON.stringify(next, null, 2) + "\n");
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const payer = payerAddress();
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying x402 (MockUSDT0 + X402Facilitator) to coston2`);
  console.log(`  deployer/payee: ${deployer.address}  (${hre.ethers.formatEther(bal)} C2FLR)`);
  console.log(`  payer (client): ${payer}`);

  // 1. Deploy MockUSDT0 (constructor mints 1,000,000 mUSDT0 to the deployer).
  const Token = await hre.ethers.getContractFactory("MockUSDT0");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const name: string = await token.name();
  const symbol: string = await token.symbol();
  const decimals: bigint = await token.decimals();
  const domainSeparator: string = await token.DOMAIN_SEPARATOR();
  console.log(`  MockUSDT0 deployed: ${tokenAddress}  (${name} / ${symbol} / ${decimals} dp)`);
  if (decimals !== 6n) throw new Error(`MockUSDT0 decimals ${decimals} != 6`);

  // 2. Deploy the facilitator FEE-FREE (feeRecipient = operator, feeBps = 0).
  const Facilitator = await hre.ethers.getContractFactory("X402Facilitator");
  const facilitator = await Facilitator.deploy(deployer.address, 0);
  await facilitator.waitForDeployment();
  const facilitatorAddress = await facilitator.getAddress();
  console.log(`  X402Facilitator deployed: ${facilitatorAddress}  (feeBps 0)`);

  // 3. Register MockUSDT0 as the facilitator's supported token.
  const addTx = await facilitator.addSupportedToken(tokenAddress);
  await addTx.wait();
  const supported: boolean = await facilitator.supportedTokens(tokenAddress);
  console.log(`  facilitator.supportedTokens(MockUSDT0): ${supported}  (tx ${addTx.hash})`);
  if (!supported) throw new Error("addSupportedToken did not take");

  // 4. Mint the demo balance to the payer (so it can sign authorizations in Task 11).
  const mintTx = await token.mint(payer, DEMO_MINT);
  await mintTx.wait();
  const payerBal: bigint = await token.balanceOf(payer);
  console.log(`  minted ${DEMO_MINT} to payer; balanceOf(payer) = ${payerBal}  (tx ${mintTx.hash})`);
  if (payerBal < DEMO_MINT) throw new Error("payer demo mint did not take");

  mergeDeployment(
    "x402",
    {
      mockUsdt0: tokenAddress,
      facilitator: facilitatorAddress,
      payee: deployer.address,
      payer,
      feeBps: 0,
      demoMint: DEMO_MINT.toString(),
      tokenName: name,
      tokenSymbol: symbol,
      tokenDecimals: Number(decimals),
      eip712DomainName: name, // MockUSDT0's EIP-712 domain name is its ERC-20 name
      eip712DomainVersion: "1",
      tokenDomainSeparator: domainSeparator,
      supportedTokenTx: addTx.hash,
      demoMintTx: mintTx.hash,
    },
    deployer.address,
  );
  console.log(`  recorded → ${DEPLOYMENTS}`);

  // 5. Best-effort source verification (never fails the deploy).
  for (const [label, address, args] of [
    ["MockUSDT0", tokenAddress, [] as unknown[]],
    ["X402Facilitator", facilitatorAddress, [deployer.address, 0]],
  ] as const) {
    try {
      await hre.run("verify:verify", { address, constructorArguments: args });
      console.log(`  ${label} verified on explorer`);
    } catch (e) {
      console.log(`  ${label} verification skipped: ${(e instanceof Error ? e.message : String(e)).slice(0, 90)}`);
    }
  }

  console.log(`\n  explorer token:       https://coston2-explorer.flare.network/address/${tokenAddress}`);
  console.log(`  explorer facilitator: https://coston2-explorer.flare.network/address/${facilitatorAddress}`);
  console.log("  x402 deploy complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
