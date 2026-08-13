import { readFileSync } from "fs";
import { resolve } from "path";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";

// The operator/deployer key is read from the repo's .secrets file (never an env
// var, never logged, never committed — .secrets/ is gitignored). Public values
// (RPC, chainId, explorer) are constants, per the kit's law. Compiling needs no
// key; deploying signs with secrets.evm.privateKey.
function operatorKey(): string {
  try {
    const secrets = JSON.parse(
      readFileSync(resolve(__dirname, "../../.secrets/live-run.json"), "utf8"),
    );
    return secrets.evm.privateKey as string;
  } catch {
    // Absent only in a fresh clone with no .secrets — fine for `compile`.
    return "0x0000000000000000000000000000000000000000000000000000000000000001";
  }
}

// Coston2 public constants (constants, not env vars).
const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";
const COSTON2_CHAIN_ID = 114;
const COSTON2_EXPLORER = "https://coston2-explorer.flare.network";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    coston2: {
      url: COSTON2_RPC,
      chainId: COSTON2_CHAIN_ID,
      accounts: [operatorKey()],
    },
  },
  // Best-effort Blockscout source verification. The deploy scripts wrap verify in
  // try/catch so a verification miss never fails the deploy.
  etherscan: {
    apiKey: { coston2: "coston2" },
    customChains: [
      {
        network: "coston2",
        chainId: COSTON2_CHAIN_ID,
        urls: {
          apiURL: `${COSTON2_EXPLORER}/api`,
          browserURL: COSTON2_EXPLORER,
        },
      },
    ],
  },
};

export default config;
