import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// deploy/0-deploy-Greeter.ts
const deployMockSFPM: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const UNISWAPV3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  if (hre.network.name !== "hardhat") await sleep(20000);

  await deploy("MockSFPM", {
    from: deployer,
    args: [UNISWAPV3_FACTORY_ADDRESS, WETH_ADDRESS],
    libraries: {},
    log: true,
  });
};

export default deployMockSFPM;
deployMockSFPM.tags = ["MockSFPM"];

async function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
