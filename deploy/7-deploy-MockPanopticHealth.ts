import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers } from "hardhat";
import { MockPanopticHealth, MockPanopticHealth__factory } from "../types";

// deploy/0-deploy-Greeter.ts
const deployMockPanopticHealth: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;

  if (process.env.WITH_PROXY) return;

  const { address: panopticHealthLibAddress } = await deployments.get("PanopticHealth");

  const MockPanopticHealth = (await ethers.getContractFactory("MockPanopticHealth", {
    libraries: {
      PanopticHealth: panopticHealthLibAddress,
    },
  })) as MockPanopticHealth__factory;

  let mockPanopticHealth = await MockPanopticHealth.deploy();
  let abi = mockPanopticHealth.interface.format(ethers.utils.FormatTypes.json);
  await deployments.save("MockPanopticHealth", {
    address: mockPanopticHealth.address,
    abi: abi as ABI,
  });
  console.log(`MockPanopticHealth deployed at ${mockPanopticHealth.address}`);
};

export default deployMockPanopticHealth;
deployMockPanopticHealth.tags = ["MockPanopticHealth"];
