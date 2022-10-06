import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments } from "hardhat";

const deployPanopticHealth: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");
  const { address: PanopticMath } = await deployments.get("PanopticMath");

  await deploy("PanopticHealth", {
    from: deployer,
    log: true,
    libraries: {
      OptionEncoding: optionEncodingLibAddress,
      PanopticMath: PanopticMath,
    },
  });
};

export default deployPanopticHealth;
deployPanopticHealth.tags = ["PanopticHealth"];
