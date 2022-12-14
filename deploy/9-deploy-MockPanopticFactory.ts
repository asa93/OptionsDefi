import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";

const deployMockOptionsFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments,
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { address: sfpmAddress } = await deployments.get("MockSFPM");

  await deploy("MockOptionsFactory", {
    from: deployer,
    args: [sfpmAddress],
    libraries: {},
    log: true,
  });
};

export default deployMockOptionsFactory;
deployMockOptionsFactory.tags = ["MockOptionsFactory"];
