import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// deploy/0-deploy-Greeter.ts
const deployPanopticFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments,
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;
  const { address: panopticMathLibAddress } = await deployments.get("PanopticMath");
  const { address: panopticHealthLibAddress } = await deployments.get("PanopticHealth");
  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");
  const { address: sfpmAddress } = await deployments.get("SemiFungiblePositionManager");

  await deploy("PanopticFactory", {
    from: deployer,
    args: [sfpmAddress],
    libraries: {
      PanopticMath: panopticMathLibAddress,
      PanopticHealth: panopticHealthLibAddress,
      OptionEncoding: optionEncodingLibAddress,
    },
    log: true,
  });
};

export default deployPanopticFactory;
deployPanopticFactory.tags = ["PanopticFactory"];
