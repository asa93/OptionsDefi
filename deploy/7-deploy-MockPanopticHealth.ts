import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers } from "hardhat";
import { MockOptionsHealth, MockOptionsHealth__factory } from "../types";

// deploy/0-deploy-Greeter.ts
const deployMockOptionsHealth: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;

  if (process.env.WITH_PROXY) return;

  const { address: optionsHealthLibAddress } = await deployments.get("OptionsHealth");

  const MockOptionsHealth = (await ethers.getContractFactory("MockOptionsHealth", {
    libraries: {
      OptionsHealth: optionsHealthLibAddress,
    },
  })) as MockOptionsHealth__factory;

  let mockOptionsHealth = await MockOptionsHealth.deploy();
  let abi = mockOptionsHealth.interface.format(ethers.utils.FormatTypes.json);
  await deployments.save("MockOptionsHealth", {
    address: mockOptionsHealth.address,
    abi: abi as ABI,
  });
  console.log(`MockOptionsHealth deployed at ${mockOptionsHealth.address}`);
};

export default deployMockOptionsHealth;
deployMockOptionsHealth.tags = ["MockOptionsHealth"];
