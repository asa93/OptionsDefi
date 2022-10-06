import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments } from "hardhat";

const deployPanopticMath: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");

  await deploy("PanopticMath", {
    from: deployer,
    log: true,
    libraries: {
      OptionEncoding: optionEncodingLibAddress,
    },
  });
};

export default deployPanopticMath;
deployPanopticMath.tags = ["PanopticMath"];
