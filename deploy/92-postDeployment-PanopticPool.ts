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

const testPanopticPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;

  const { deployer, seller, buyer } = await getNamedAccounts();

  const { address: token1Address } = await deployments.get("Token1");
  const token1 = (await ethers.getContractAt("Token", token1Address)) as Token;
  const amount1 = ethers.utils.parseEther("10");
  const { address: poolAddress } = await deployments.get("PanopticPool-ETH-USDC");
  const pool = (await ethers.getContractAt("PanopticPool", poolAddress)) as PanopticPool;

  //granting USDC and WETH (forked mainnet)
  // await grantTokens(WETH_ADDRESS, deployer, WETH_SLOT, wethBalance);
  // await grantTokens(USDC_ADDRESS, deployer, USDC_SLOT, usdcBalance);

  // await grantTokens(WETH_ADDRESS, seller, WETH_SLOT, wethBalance);
  // await grantTokens(USDC_ADDRESS, seller, USDC_SLOT, usdcBalance);

  // await grantTokens(WETH_ADDRESS, buyer, WETH_SLOT, wethBalance);
  // await grantTokens(USDC_ADDRESS, buyer, USDC_SLOT, usdcBalance);

  ///////////// MINT OPTION FOR GRAPH TEST
  // to comment for proper deployment
  const tick = 1190;
  const width = 10;
  let strike = tick - 1100;
  strike = strike - (strike % 10);

  //initialize pool
  const SFPMdeployment = await deployments.get("SemiFungiblePositionManager");

  const sfpm = (await ethers.getContractAt(
    "SemiFungiblePositionManager",
    SFPMdeployment.address
  )) as SemiFungiblePositionManager;
  await sfpm.initializePool({ token0: USDC_ADDRESS, token1: WETH_ADDRESS, fee: 500 });

  // //deposit WETH_

  let deployPoolTx = await token1.mint(deployer, amount1);
  let receipt = await deployPoolTx.wait();

  deployPoolTx = await token1.approve(pool.address, amount1);
  receipt = await deployPoolTx.wait();

  deployPoolTx = await pool.deposit(amount1, token1.address);
  receipt = await deployPoolTx.wait();

  deployPoolTx = await pool.withdraw(amount1, token1.address, []);
  receipt = await deployPoolTx.wait();

  // //mint option
  const numberOfContracts = ethers.utils.parseEther("1");

  const uniPoolAddress = await pool.pool();
  const poolId = BigInt(uniPoolAddress.slice(0, 22).toLowerCase());

  const tokenId = OptionEncoding.encodeID(poolId, [
    {
      width,
      ratio: 3,
      strike,
      long: false,
      tokenType: 1,
      riskPartner: 0,
    },
  ]);

  // await pool.mintOptions([tokenId], numberOfContracts);

  // events

  // let eventFilter = sfpm.filters["TokenizedPositionMinted(address,uint256,uint128)"]();
  // console.log("TokenizedPositionMinted", await sfpm.queryFilter(eventFilter));

  // let eventFilterTransfer = token1.filters["Transfer(address,address,uint256)"]();
  // const transferEvent = await token1.queryFilter(eventFilterTransfer);
  // console.log("Transfer", transferEvent[0].args);

  // let eventFilterDeposited = pool.filters["Deposited(address,address,uint256)"]();
  // const depositedEvent = await pool.queryFilter(eventFilterDeposited);
  // console.log("Deposited", depositedEvent[0].args);

  // let eventFilterWithdrawn = pool.filters["Withdrawn(address,address,uint256)"]();
  // const withdrawnEvent = await pool.queryFilter(eventFilterWithdrawn);
  // console.log("Withdrawn", withdrawnEvent[0]);

  // let eventFilterPool = pool.filters["PoolStarted(address,address)"]();
  // const poolStartedEvent = await pool.queryFilter(eventFilterPool);

  // let eventFilterMint = sfpm.filters["TokenizedPositionMinted(address,uint256,uint128,address)"]();
  // const mintEvent = await pool.queryFilter(eventFilterMint);
  // console.log("mintEvent", mintEvent[0]);

  // console.log("blockNumber", poolStartedEvent[0].blockNumber);
};

export default testPanopticPool;
testPanopticPool.tags = ["testPanopticPool"];
