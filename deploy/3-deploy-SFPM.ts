import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments } from "hardhat";

// deploy/0-deploy-Greeter.ts
const deploySFPM: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");
  const { address: panopticMathLibAddress } = await deployments.get("PanopticMath");
  const UNISWAPV3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  await deploy("SemiFungiblePositionManager", {
    from: deployer,
    args: [UNISWAPV3_FACTORY_ADDRESS, WETH_ADDRESS],
    libraries: {
      OptionEncoding: optionEncodingLibAddress,
      PanopticMath: panopticMathLibAddress,
    },
    log: true,
  });
};

export default deploySFPM;
deploySFPM.tags = ["SemiFungiblePositionManager"];
