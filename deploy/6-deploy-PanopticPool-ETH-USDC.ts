import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers } from "hardhat";
import {
  PanopticFactory,
  Token,
  PanopticPool,
  SemiFungiblePositionManager,
  MockUniswapV3Pool,
} from "../types";
import { grantTokens } from "../test/utils";
import * as OptionEncoding from "../test/libraries/OptionEncoding";
import { token } from "../types/@openzeppelin/contracts";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDC_SLOT = 9;

const usdcBalance = ethers.utils.parseUnits("100000000", "6");
const wethBalance = ethers.utils.parseEther("1000");

// deploy/0-deploy-Greeter.ts
const deployPanopticPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;

  if (process.env.WITH_PROXY) return;

  const { address: panopticHealthLibAddress } = await deployments.get("PanopticHealth");
  const { address: factoryAddress } = await deployments.get("PanopticFactory");
  const { address: panopticMathLibAddress } = await deployments.get("PanopticMath");
  const { address: mockUnisapV3PoolAddress } = await deployments.get("MockUniswapV3Pool");

  //const { address: optionEncodingLibAddress } = await deployments.get("OptionEncoding");

  const factory = (await ethers.getContractAt(
    "PanopticFactory",
    factoryAddress
  )) as PanopticFactory;

  let ETH_USDC_POOL_ADDRESS =
    hre.network.name === "hardhat" || hre.network.name === "mainnet"
      ? "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
      : mockUnisapV3PoolAddress;

  let deployPoolTx = await factory.deployToNewPool(ETH_USDC_POOL_ADDRESS);
  let receipt = await deployPoolTx.wait();

  let eventFilterFactory = factory.filters["PoolDeployed(address,address)"]();
  const poolDeployedEvent = await factory.queryFilter(eventFilterFactory);
  const { poolAddress } = poolDeployedEvent[0].args;
  const pool = await ethers.getContractFactory("PanopticPool", {
    libraries: {
      PanopticMath: panopticMathLibAddress,
      //OptionEncoding: optionEncodingLibAddress,
      PanopticHealth: panopticHealthLibAddress,
    },
  });
  const abi = pool.interface.format(ethers.utils.FormatTypes.json);

  await deployments.save("PanopticPool-ETH-USDC", { address: poolAddress, abi: abi as ABI });

  console.log(`Panoptic pool for ETH-USDC deployed at ${poolAddress}`);
};

export default deployPanopticPool;
deployPanopticPool.tags = ["PanopticPool-ETH-USDC"];
