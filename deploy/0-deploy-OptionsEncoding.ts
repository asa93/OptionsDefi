import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployOptionEncoding: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  await deploy("OptionEncoding", {
    from: deployer,
    log: true,
  });
};

export default deployOptionEncoding;
deployOptionEncoding.tags = ["OptionEncoding"];
