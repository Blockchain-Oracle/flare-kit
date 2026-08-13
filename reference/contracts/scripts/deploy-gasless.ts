/**
 * Deploy GaslessPaymentForwarder to Coston2 and authorize the operator relayer.
 *
 *   pnpm --dir reference/contracts run deploy:gasless
 *   (or:  cd reference/contracts && npm run deploy:gasless)
 *
 * FXRP is resolved by the forwarder from the Flare Contract Registry; no token
 * address is passed. The deployer (operator) is authorized as the relayer that may
 * call executePayment. Addresses are recorded to deployments/coston2.json — the
 * single source @flare-kit/contracts (Task 3) reads; nothing hardcoded elsewhere.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import hre from "hardhat";

const DEPLOYMENTS = resolve(__dirname, "../deployments/coston2.json");

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
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying GaslessPaymentForwarder to coston2`);
  console.log(`  deployer: ${deployer.address}  (${hre.ethers.formatEther(bal)} C2FLR)`);

  // 1. Deploy the forwarder (FXRP fetched from the registry at runtime).
  const Forwarder = await hre.ethers.getContractFactory("GaslessPaymentForwarder");
  const forwarder = await Forwarder.deploy();
  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();
  console.log(`  forwarder deployed: ${forwarderAddress}`);

  // 2. Read the resolved FXRP address back (proves fxrp() works on Coston2).
  const fxrpAddress: string = await forwarder.fxrp();
  console.log(`  forwarder.fxrp():   ${fxrpAddress}`);
  if (/^0x0+$/.test(fxrpAddress)) throw new Error("forwarder.fxrp() resolved to the zero address");

  // 3. Authorize the operator as the relayer that may call executePayment.
  const authTx = await forwarder.setRelayerAuthorization(deployer.address, true);
  await authTx.wait();
  const isAuthorized: boolean = await forwarder.authorizedRelayers(deployer.address);
  console.log(`  authorizedRelayers[operator]: ${isAuthorized}  (tx ${authTx.hash})`);
  if (!isAuthorized) throw new Error("operator relayer authorization did not take");

  // 4. Sanity read-backs.
  const nonce = await forwarder.getNonce(deployer.address);
  const domainSeparator: string = await forwarder.getDomainSeparator();
  console.log(`  getNonce(operator): ${nonce}   domainSeparator: ${domainSeparator}`);

  mergeDeployment(
    "gasless",
    {
      forwarder: forwarderAddress,
      fxrp: fxrpAddress,
      authorizedRelayer: deployer.address,
      authorizationTx: authTx.hash,
      domainName: "GaslessPaymentForwarder",
      domainVersion: "1",
      domainSeparator,
    },
    deployer.address,
  );
  console.log(`  recorded → ${DEPLOYMENTS}`);

  // 5. Best-effort source verification (never fails the deploy).
  try {
    await hre.run("verify:verify", { address: forwarderAddress, constructorArguments: [] });
    console.log("  forwarder verified on explorer");
  } catch (e) {
    console.log(`  forwarder verification skipped: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`);
  }

  console.log(`\n  explorer: https://coston2-explorer.flare.network/address/${forwarderAddress}`);
  console.log("  gasless deploy complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
