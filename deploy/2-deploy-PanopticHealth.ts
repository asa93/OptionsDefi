import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments } from "hardhat";

const deployOptionsHealth: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");
  const { address: OptionsMath } = await deployments.get("OptionsMath");

  await deploy("OptionsHealth", {
    from: deployer,
    log: true,
    libraries: {
      OptionEncoding: optionEncodingLibAddress,
      OptionsMath: OptionsMath,
    },
  });
};

export default deployOptionsHealth;
deployOptionsHealth.tags = ["OptionsHealth"];
