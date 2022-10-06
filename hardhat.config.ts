import dotenv from "dotenv";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";

import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default {
  solidity: "0.7.6",
  settings: {
    optimizer: {
      enabled: true,
      // runs: 200,
    },
  },
  networks: {
    hardhat: {
      deploy: ["./deploy"],
      forking: {
        blockNumber: 14487083,
        url: process.env.NODE_URL,
      },
    },
    rinkeby: {
      deploy: ["./deploy"],
      url: process.env.RINKEBY_URL || "",
      accounts: process.env.DEPLOYER_ADDRESS !== undefined ? [process.env.DEPLOYER_ADDRESS] : [],
    },
  },
  typechain: {
    outDir: "types/",
    target: "ethers-v5",
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 21,
  },
  namedAccounts: {
    deployer: 0,
    seller: 1,
    buyer: 2,
  },
} as HardhatUserConfig;
