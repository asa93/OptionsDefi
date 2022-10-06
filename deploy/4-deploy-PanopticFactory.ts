import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// deploy/0-deploy-Greeter.ts
const deployOptionsFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments,
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;
  const { address: optionsMathLibAddress } = await deployments.get("OptionsMath");
  const { address: optionsHealthLibAddress } = await deployments.get("OptionsHealth");
  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");
  const { address: sfpmAddress } = await deployments.get("SemiFungiblePositionManager");

  await deploy("OptionsFactory", {
    from: deployer,
    args: [sfpmAddress],
    libraries: {
      OptionsMath: optionsMathLibAddress,
      OptionsHealth: optionsHealthLibAddress,
      OptionEncoding: optionEncodingLibAddress,
    },
    log: true,
  });
};

export default deployOptionsFactory;
deployOptionsFactory.tags = ["OptionsFactory"];
