import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers } from "hardhat";
import {
  OptionsFactory,
  Token,
  OptionsPool,
  SemiFungiblePositionManager,
  MockUniswapV3Pool,
} from "../types";

const deployMockOptionsPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments,
    deployments: { deploy },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { address: factoryAddress } = await deployments.get("MockOptionsFactory");

  const { address: mockUniswapV3PoolAddress } = await deployments.get("MockUniswapV3Pool");

  const mockFactory = (await ethers.getContractAt(
    "MockOptionsFactory",
    factoryAddress
  )) as OptionsFactory;

  let deployPoolTx = await mockFactory.deployToNewPool(mockUniswapV3PoolAddress);
  let receipt = await deployPoolTx.wait();

  let eventFilterFactory = mockFactory.filters["PoolDeployed(address,address)"]();
  const poolDeployedEvent = await mockFactory.queryFilter(eventFilterFactory);
  const { poolAddress } = poolDeployedEvent[0].args;
  const poolContractFactory = await ethers.getContractFactory("MockOptionsPool", {
    libraries: {},
  });
  const abi = poolContractFactory.interface.format(ethers.utils.FormatTypes.json);

  await deployments.save("MockOptionsPool", { address: poolAddress, abi: abi as ABI });

  console.log(`MockOptionsPool deployed at ${poolAddress}`);

  ///////////////////
  /// deposit weth
  const { address: token1Address } = await deployments.get("Token1");
  const token1 = (await ethers.getContractAt("Token", token1Address)) as Token;
  const amount1 = ethers.utils.parseEther("10");

  const pool = (await ethers.getContractAt("OptionsPool", poolAddress)) as OptionsPool;

  deployPoolTx = await pool.deposit(amount1, token1.address);
  receipt = await deployPoolTx.wait();
};

export default deployMockOptionsPool;
deployMockOptionsPool.tags = ["MockOptionsPool"];
