import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers } from "hardhat";
import { PanopticFactory, Token__factory, MockUniswapV3Pool__factory } from "../types";

// deploy/0-deploy-Greeter.ts
const deployMockUniswapV3Pool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;

  if (process.env.WITH_PROXY) return;

  const UniswapV3Pool = (await ethers.getContractFactory(
    "MockUniswapV3Pool"
  )) as MockUniswapV3Pool__factory;
  const Token = (await ethers.getContractFactory("Token")) as Token__factory;
  let token0 = await Token.deploy();
  let abi = token0.interface.format(ethers.utils.FormatTypes.json);
  await deployments.save("Token0", { address: token0.address, abi: abi as ABI });
  console.log(`token0 deployed at ${token0.address}`);

  let token1 = await Token.deploy();
  abi = token1.interface.format(ethers.utils.FormatTypes.json);
  await deployments.save("Token1", { address: token1.address, abi: abi as ABI });
  console.log(`token1 deployed at ${token1.address}`);

  let pool = await UniswapV3Pool.deploy(token0.address, token1.address, 0);
  abi = pool.interface.format(ethers.utils.FormatTypes.json);
  await deployments.save("MockUniswapV3Pool", { address: pool.address, abi: abi as ABI });
  console.log(`MockUniswapV3Pool deployed at ${pool.address}`);
  console.log("tickSpacing", await pool.tickSpacing());
};

export default deployMockUniswapV3Pool;
deployMockUniswapV3Pool.tags = ["MockUniswapV3Pool"];
