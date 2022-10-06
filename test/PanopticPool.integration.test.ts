import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { grantTokens } from "./utils";
import {
  ERC20__factory,
  IUniswapV3Pool,
  IUniswapV3Pool__factory,
  OptionsPool,
  ERC20,
  SemiFungiblePositionManager,
  MockOptionsHealth,
  OptionsHealth,
  ISwapRouter,
  OptionsMath,
} from "../types";

import * as OptionEncoding from "./libraries/OptionEncoding";
import * as UniswapV3 from "./libraries/UniswapV3";

import { BigNumber, Signer } from "ethers";
import { maxLiquidityForAmounts, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { token } from "../types/@openzeppelin/contracts";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_SLOT = 9;
const token0 = USDC_ADDRESS;

const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WETH_SLOT = 3;
const token1 = WETH_ADDRESS;

const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const decimalUSDC = 6;
const decimalWETH = 18;

describe("OptionsPool", function () {
  const contractName = "OptionsPool";
  const deploymentName = "OptionsPool-ETH-USDC";

  const SFPMContractName = "SemiFungiblePositionManager";
  const SFPMDeploymentName = "SemiFungiblePositionManager";

  let pool: OptionsPool;
  let uniPool: IUniswapV3Pool;
  let optionsMath: OptionsMath;
  let optionsHealth: OptionsHealth;

  let deployer: Signer;
  let optionWriter: Signer;
  let swapper: Signer;

  let poolId: bigint;
  let tick: number;
  let sqrtPriceX96: BigNumber;

  const usdcBalance = ethers.utils.parseUnits("100000000", "6");
  const wethBalance = ethers.utils.parseEther("1000000");

  const emptyPositionList: string[] = [];

  function calculateOptionSize(
    strike: number,
    width: number,
    sqrtPriceX96: BigNumber,
    amount0: BigNumber,
    amount1: BigNumber,
    ts: number = 10
  ) {
    const tickLower = strike - width * ts;
    const tickUpper = strike + width * ts;

    const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

    return maxLiquidityForAmounts(
      JSBI.BigInt(sqrtPriceX96.toString()),
      sqrtRatioAX96,
      sqrtRatioBX96,
      JSBI.BigInt(amount0.toString()),
      JSBI.BigInt(amount1.toString()),
      true
    );
  }

  beforeEach(async () => {
    await deployments.fixture([
      deploymentName,
      "OptionsFactory",
      "OptionEncoding",
      "OptionsMath",
      "OptionsHealth",
      "SemiFungiblePositionManager",
    ]);
    const { address } = await deployments.get(deploymentName);
    [deployer, optionWriter, swapper] = await ethers.getSigners();

    await grantTokens(WETH_ADDRESS, await deployer.getAddress(), WETH_SLOT, wethBalance);
    await grantTokens(USDC_ADDRESS, await deployer.getAddress(), USDC_SLOT, usdcBalance);

    await grantTokens(WETH_ADDRESS, await optionWriter.getAddress(), WETH_SLOT, wethBalance);
    await grantTokens(USDC_ADDRESS, await optionWriter.getAddress(), USDC_SLOT, usdcBalance);

    pool = (await ethers.getContractAt(contractName, address)) as OptionsPool;

    const SFPMdeployment = await deployments.get(SFPMDeploymentName);

    // initialize the pool
    const sfpm = (await ethers.getContractAt(
      SFPMContractName,
      SFPMdeployment.address
    )) as SemiFungiblePositionManager;
    await sfpm.initializePool({ token0: USDC_ADDRESS, token1: WETH_ADDRESS, fee: 500 });

    const uniPoolAddress = await pool.pool();
    poolId = BigInt(uniPoolAddress.slice(0, 22).toLowerCase());

    uniPool = IUniswapV3Pool__factory.connect(uniPoolAddress, deployer);
    ({ sqrtPriceX96, tick } = await uniPool.slot0());

    //approvals
    await ERC20__factory.connect(WETH_ADDRESS, deployer).approve(
      pool.address,
      ethers.constants.MaxUint256
    );
    await ERC20__factory.connect(USDC_ADDRESS, deployer).approve(
      pool.address,
      ethers.constants.MaxUint256
    );

    await ERC20__factory.connect(WETH_ADDRESS, optionWriter).approve(
      pool.address,
      ethers.constants.MaxUint256
    );
    await ERC20__factory.connect(USDC_ADDRESS, optionWriter).approve(
      pool.address,
      ethers.constants.MaxUint256
    );

    // initialize the pool

    const OptionsMathDeployment = await deployments.get("OptionsMath");

    optionsMath = (await ethers.getContractAt(
      "OptionsMath",
      OptionsMathDeployment.address
    )) as OptionsMath;

    const optionsHealthDeployment = await deployments.get("OptionsHealth");

    optionsHealth = (await ethers.getContractAt(
      "OptionsHealth",
      optionsHealthDeployment.address
    )) as OptionsHealth;
  });

  it("should deploy the pool", async function () {
    expect(pool.address).to.be.not.undefined;
  });

  // it("should calculate notional value", async function () {
  //   const optionSize = ethers.utils.parseEther("1");
  //   const range = 100 * 10; //width*ts
  //   const strike = 195129;

  //   const value1 = Math.pow(1.0001, strike / 2);
  //   const value2 = Math.pow(1.0001, range / 2) - Math.pow(1.0001, -range / 2);

  //   const expected = optionSize.mul(BigNumber.from(Math.floor(value1 * value2)));

  //   const value = await pool.calcPositionNotional(optionSize, strike, range);
  //   const delta = expected.sub(value);

  //   console.log(ethers.utils.formatEther(delta));

  //   //expect(delta).to.not.be.greaterThan(10 * 10);
  // });

  // describe("liquidity", async function () {
  //   it("should not withdraw token without any previous deposit", async function () {
  //     const amount = ethers.utils.parseUnits("10000000", "6");
  //     const depositor = await deployer.getAddress();

  //   await expect(
  //     pool.connect(deployer).withdraw(ethers.utils.parseUnits("10000000", "20"), token1, [])
  //   ).to.be.revertedWith("19");
  // });

  //   it("should deposit token 0", async function () {
  //     const amount = ethers.utils.parseUnits("10000000", "6");
  //     const depositor = await deployer.getAddress();

  //   await pool.connect(deployer).deposit(amount, token0);
  //   const recipientToken0 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken0()
  //   )) as ERC20;
  //   const recipientToken1 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken1()
  //   )) as ERC20;
  //   expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal(amount.toString());
  //   expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal("0");
  // });

  it("should deposit token 1", async function () {
    const amount = ethers.utils.parseEther("1");
    const depositor = await deployer.getAddress();
    await pool.deposit(amount, token1);
    const recipientToken1 = (await ethers.getContractAt(
      "ERC20",
      await pool.receiptToken1()
    )) as ERC20;
    expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(amount.toString());
  });

  it("should deposit 2 tokens", async function () {
    const amount0 = ethers.utils.parseUnits("10000000", "6");
    const amount1 = ethers.utils.parseEther("1");
    const depositor = await deployer.getAddress();
    await pool.deposit(amount0, token0);
    await pool.deposit(amount1, token1);
    const recipientToken0 = (await ethers.getContractAt(
      "ERC20",
      await pool.receiptToken0()
    )) as ERC20;
    const recipientToken1 = (await ethers.getContractAt(
      "ERC20",
      await pool.receiptToken1()
    )) as ERC20;
    expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal(
      ethers.utils.parseUnits("10000000", "6").toString()
    );
    expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
      ethers.utils.parseEther("1").toString()
    );
  });

  //   it("should withdraw token 0", async function () {
  //     const depositAmount = ethers.utils.parseUnits("20000000", "6");
  //     const amount = ethers.utils.parseUnits("10000000", "6");
  //     const depositor = await deployer.getAddress();

  //   await pool.deposit(depositAmount, token0);

  //   await expect(
  //     pool.connect(deployer).withdraw(ethers.utils.parseUnits("10000000", "20"), token1, [])
  //   ).to.be.revertedWith("19");

  //   await pool.connect(deployer).withdraw(amount, token0, []);
  //   const recipientToken0 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken0()
  //   )) as ERC20;
  //   const recipientToken1 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken1()
  //   )) as ERC20;
  //   expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal(
  //     ethers.utils.parseUnits("10000000", "6").toString()
  //   );
  //   expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
  //     ethers.utils.parseEther("0").toString()
  //   );
  // });

  //   it("should withdraw token 1", async function () {
  //     const depositAmount = ethers.utils.parseEther("2");
  //     const amount = ethers.utils.parseEther("1");
  //     const depositor = await deployer.getAddress();

  //   await pool.deposit(depositAmount, token1);

  //   await expect(pool.connect(deployer).withdraw(amount, token0, [])).to.be.revertedWith("19");

  //   await pool.connect(deployer).withdraw(amount, token1, []);
  //   const recipientToken1 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken1()
  //   )) as ERC20;
  //   expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
  //     ethers.utils.parseEther("1").toString()
  //   );
  // });

  //   it("should withdraw both token2", async function () {
  //     const amount0 = ethers.utils.parseUnits("10000000", "6");
  //     const amount1 = ethers.utils.parseEther("1");
  //     const depositor = await deployer.getAddress();

  //   await pool.deposit(amount0, token0);
  //   await pool.deposit(amount1, token1);

  //   await pool.connect(deployer).withdraw(amount0, token0, []);
  //   await pool.connect(deployer).withdraw(amount1, token1, []);
  //   const recipientToken0 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken0()
  //   )) as ERC20;
  //   const recipientToken1 = (await ethers.getContractAt(
  //     "ERC20",
  //     await pool.receiptToken1()
  //   )) as ERC20;
  //   expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal("0");
  //   expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal("0");
  // });

  it("should calculate correct recipient token amount", async function () {
    const recipientToken1 = (await ethers.getContractAt(
      "ERC20",
      await pool.receiptToken1()
    )) as ERC20;
    const depositor = await deployer.getAddress();
    const amount1 = ethers.utils.parseEther("1");
    await pool.deposit(amount1, token1);

    const amount2 = ethers.utils.parseEther("1");
    expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
      ethers.utils.parseEther("1")
    );
    await pool.deposit(amount2, token1);
    expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
      ethers.utils.parseEther("2")
    );
  });

  it("should burn correct recipient token amount", async function () {
    const recipientToken1 = (await ethers.getContractAt(
      "ERC20",
      await pool.receiptToken1()
    )) as ERC20;
    const depositor = await deployer.getAddress();
    const amount1 = ethers.utils.parseEther("1");
    await pool.deposit(amount1, token1);

    await pool.deposit(amount1, token1);

    await pool.withdraw(amount1, token1, []);
    expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
      ethers.utils.parseEther("1")
    );
  });

  //   it("should withdraw using recipient token", async function () {
  //     const recipientToken0 = (await ethers.getContractAt(
  //       "ERC20",
  //       await pool.receiptToken0()
  //     )) as ERC20;
  //     const amount0 = ethers.utils.parseUnits("100000000", 6);
  //     const depositor = await deployer.getAddress();
  //     const amount1 = ethers.utils.parseEther("1");

  // await pool.deposit(amount0, token0);
  // await pool.deposit(amount1, token1);

  //     const recipientToken1 = (await ethers.getContractAt(
  //       "ERC20",
  //       await pool.receiptToken1()
  //     )) as ERC20;

  /*
      await expect(
        pool.withdrawUsingReceiptTokens({
          amount0: 0,
          amount1: 0,
        })
      ).to.be.revertedWith("8");

      await pool.withdrawUsingReceiptTokens({
        amount0: amount0,
        amount1: amount1,
      });
      expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal(
        ethers.utils.parseEther("0")
      );
      expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
        ethers.utils.parseEther("0")
      );
      */
  //   });
  // });

  describe("mint", async function () {
    // it("should not allow to mint without liquidity", async function () {
    //   const width = 10;
    //   let strike = tick - 1100;
    //   strike = strike - (strike % 10);

    //   const amount1 = ethers.utils.parseEther("30000");

    //   const numberOfContracts = ethers.utils.parseEther("1");

    //   await expect(pool.deposit(0, token1)).to.be.revertedWith("9");

    //   const tokenId = OptionEncoding.encodeID(poolId, [
    //     {
    //       width,
    //       ratio: 3,
    //       strike,
    //       long: false,
    //       tokenType: 1,
    //       riskPartner: 0,
    //     },
    //   ]);

    //   //await expect(pool.mintOptions([tokenId], numberOfContracts)).to.be.revertedWith("STF");
    // });
    // it("should not allow to mint undercollaterized position", async function () {
    //   const width = 10;
    //   let strike = tick - 1100;
    //   strike = strike - (strike % 10);

    //   const amount1 = ethers.utils.parseEther("30000");

    //   //3000000000000000000
    //   //30000000000000000000000
    //   const numberOfContracts = ethers.utils.parseEther("1");

    //   await pool.deposit(amount1.div(1000000), token1);

    //   const tokenId = OptionEncoding.encodeID(poolId, [
    //     {
    //       width,
    //       ratio: 3,
    //       strike,
    //       long: false,
    //       tokenType: 1,
    //       riskPartner: 0,
    //     },
    //   ]);

    //   await expect(pool.mintOptions([tokenId], numberOfContracts)).to.be.revertedWith("STF");
    // });

    it("should allow to mint 1 leg short put ETH option", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);
      const recipientToken0 = (await ethers.getContractAt(
        "ERC20",
        await pool.receiptToken0()
      )) as ERC20;
      const recipientToken1 = (await ethers.getContractAt(
        "ERC20",
        await pool.receiptToken1()
      )) as ERC20;
      const amount1 = ethers.utils.parseEther("10");

      const numberOfContracts = ethers.utils.parseEther("1");
      await pool.deposit(amount1, token1);

      const depositor = await deployer.getAddress();
      expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal("0");
      expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
        "10000000000000000000"
      );

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

      const resolved = await pool.mintOptions([tokenId], numberOfContracts);
      const receipt = await resolved.wait();
      console.log(" Gas used = " + receipt.gasUsed.toNumber());

      const notionals = await optionsMath.getTotalNotionalByTokenId(
        tokenId,
        numberOfContracts,
        await uniPool.tickSpacing()
      );
      console.log(
        "numberOfContracts",
        numberOfContracts.toString(),
        "notionalToken0",
        notionals.notionalToken0.toString(),
        "notionalToken1",
        notionals.notionalToken1.toString()
      );
      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, tokenId, 0))[2].toString()).to.equal("0");

      //Healthcheck

      console.log(
        "healthcheck params",
        await deployer.getAddress(),
        tokenId,
        numberOfContracts.toString(),
        tick.toString()
      );

      // const required = await optionsHealth.getPositionCollateralAtTick(
      //   tokenId,
      //   numberOfContracts,
      //   tick,
      //   await uniPool.tickSpacing()
      // );

      // const token0Balance = await recipientToken0.balanceOf(await deployer.getAddress());
      // const token1Balance = await recipientToken1.balanceOf(await deployer.getAddress());

      // console.log(
      //   "balance ",
      //   token0Balance,
      //   required.token0Required,
      //   token1Balance,
      //   required.token1Required
      // );

      // const decimals = await optionsHealth.DECIMALS();
      // const COLLATERAL_MARGIN_RATIO = await optionsHealth.COLLATERAL_MARGIN_RATIO();
      // let status;
      // if (token0Balance.gte(required.token0Required)) {
      //   status = "HEALTHY";
      // } else if (
      //   token0Balance.gte(required.token0Required.mul(COLLATERAL_MARGIN_RATIO).div(decimals))
      // ) {
      //   status = "MARGIN_CALLED";
      // } else {
      //   status = "UNDERWATER";
      // }
      // console.log("status 0:", status);
    });
    return;
    it("should allow to mint 1 leg long put ETH option", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortPutTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, shortPutTokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, shortPutTokenId, 0)).baseLiquidity.toString()).to.equal(
        "0"
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4999999999999999944"
      );

      const longPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions(
        [shortPutTokenId, longPutTokenId],
        numberOfContracts.div(3)
      );
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());

      expect((await pool.positionCounter(depositor)).toString()).to.equal("2");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal(
        numberOfContracts.div(3).toString()
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4666666666666666674"
      );
      //expect((await pool.options(depositor, longPutTokenId, 0)).baseLiquidity.toString()).to.equal("18966480458");
    });

    it("should allow to mint 4 leg short put ETH option", async function () {
      const width = 10;
      let strike = tick - 1000;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("10");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1.mul(4), token1);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike - 100,
          long: false,
          tokenType: 1,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike - 200,
          long: false,
          tokenType: 1,
          riskPartner: 2,
        },
        {
          width,
          ratio: 1,
          strike: strike - 300,
          long: false,
          tokenType: 1,
          riskPartner: 3,
        },
      ]);

      const resolved = await pool.mintOptions([tokenId], numberOfContracts);
      const receipt = await resolved.wait();
      console.log(" Gas used = " + receipt.gasUsed.toNumber());
    });

    it("should allow to mint short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      const resolved = await pool.mintOptions([tokenId], numberOfContracts);
      const receipt = await resolved.wait();
      console.log(" Gas used = " + receipt.gasUsed.toNumber());
    });

    it("should allow to mint 2-leg short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
      ]);

      const resolved = await pool.mintOptions([tokenId], numberOfContracts);
      const receipt = await resolved.wait();
      console.log(" Gas used = " + receipt.gasUsed.toNumber());
    });

    it("should allow to mint 2-leg call USDC option with risk partner", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);
      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, tokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());
    });

    it("should allow to mint long call USDC option", async function () {
      const width = 10;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const longCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, longCallTokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());
    });

    // it("should allow to mint+burn 1 leg long put ETH option", async function () {
    //   const width = 10;
    //   let strike = tick - 1100;
    //   strike = strike - (strike % 10);

    //   const amount1 = ethers.utils.parseEther("50");
    //   const numberOfContracts = ethers.utils.parseEther("5");

    //   await pool.deposit(amount1, token1);

    //   await pool.deposit(amount1, token1);

    //   const shortPutTokenId = OptionEncoding.encodeID(poolId, [
    //     {
    //       width,
    //       ratio: 5,
    //       strike,
    //       long: false,
    //       tokenType: 1,
    //       riskPartner: 0,
    //     },
    //   ]);

    //   await pool.mintOptions([shortPutTokenId], numberOfContracts);

    //   const longPutTokenId = OptionEncoding.encodeID(poolId, [
    //     {
    //       width,
    //       ratio: 1,
    //       strike,
    //       long: true,
    //       tokenType: 1,
    //       riskPartner: 0,
    //     },
    //   ]);

    //   await pool.mintOptions([shortPutTokenId, longPutTokenId], numberOfContracts.div(3));

    //   const depositor = await deployer.getAddress();

    //   expect((await pool.positionCounter(depositor)).toString()).to.equal("2");
    //   expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal(
    //     numberOfContracts.div(3).toString()
    //   );
    //   expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
    //   expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
    //     "4666666666666666674"
    //   );

    //   await pool.burnOptions(longPutTokenId);

    //   expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
    //   expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal("0");
    // });

    it("should allow to mint+burn 4 leg short put ETH option", async function () {
      const width = 10;
      let strike = tick - 1000;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1.mul(4), token1);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike: strike - 100,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike - 200,
          long: false,
          tokenType: 1,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike - 300,
          long: false,
          tokenType: 1,
          riskPartner: 2,
        },
        {
          width,
          ratio: 1,
          strike: strike - 400,
          long: false,
          tokenType: 1,
          riskPartner: 3,
        },
      ]);

      await pool.mintOptions([tokenId], numberOfContracts);

      await pool.burnOptions(tokenId);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("0");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([tokenId], numberOfContracts);
    });

    it("should allow to mint 2-leg short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
      ]);

      await pool.mintOptions([tokenId], numberOfContracts);

      await pool.burnOptions(tokenId);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("0");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn 2-leg call USDC option with risk partner", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);
      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortCallTokenId], numberOfContracts);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortCallTokenId, tokenId], numberOfContracts);

      await pool.burnOptions(tokenId);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn long call USDC option", async function () {
      const width = 10;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortCallTokenId], numberOfContracts);

      const longCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortCallTokenId, longCallTokenId], numberOfContracts);

      await pool.burnOptions(longCallTokenId);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, longCallTokenId)).toString()).to.equal("0");
    });
  });

  describe("burn", async function () {
    it("should allow to mint+burn 1 leg short put ETH option", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);
      const recipientToken0 = (await ethers.getContractAt(
        "ERC20",
        await pool.receiptToken0()
      )) as ERC20;
      const recipientToken1 = (await ethers.getContractAt(
        "ERC20",
        await pool.receiptToken1()
      )) as ERC20;
      const amount1 = ethers.utils.parseEther("10");

      const numberOfContracts = ethers.utils.parseEther("1");
      await pool.deposit(amount1, token1);

      const depositor = await deployer.getAddress();
      expect((await recipientToken0.balanceOf(depositor)).toString()).to.equal("0");
      expect((await recipientToken1.balanceOf(depositor)).toString()).to.equal(
        "10000000000000000000"
      );

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

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, tokenId, 0))[2].toString()).to.equal("0");

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());

      expect((await pool.positionCounter(depositor)).toString()).to.equal("0");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn 1 leg long put ETH option", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortPutTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const longPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions(
        [shortPutTokenId, longPutTokenId],
        numberOfContracts.div(3)
      );
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("2");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal(
        numberOfContracts.div(3).toString()
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4666666666666666674"
      );

      resolved = await pool.burnOptions(longPutTokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      console.log(" Gas used = " + gas.toNumber());

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn 4 leg short put ETH option", async function () {
      const width = 10;
      let strike = tick - 1000;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1.mul(4), token1);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike: strike - 100,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike - 200,
          long: false,
          tokenType: 1,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike - 300,
          long: false,
          tokenType: 1,
          riskPartner: 2,
        },
        {
          width,
          ratio: 1,
          strike: strike - 400,
          long: false,
          tokenType: 1,
          riskPartner: 3,
        },
      ]);

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("0");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");

      console.log(" Gas used = " + gas.toNumber());
    });

    it("should allow to mint+burn short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();

      console.log(" Gas used = " + receipt.gasUsed.toNumber());
    });

    it("should allow to mint 2-leg short call USDC option", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
      ]);

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      console.log(" Gas used = " + gas.toNumber());

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("0");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn 2-leg call USDC option with risk partner", async function () {
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0.mul(2), token0);
      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike: strike + 50,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 1,
        },
        {
          width,
          ratio: 1,
          strike: strike + 50,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, tokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      console.log(" Gas used = " + gas.toNumber());

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, tokenId)).toString()).to.equal("0");
    });

    it("should allow to mint+burn long call USDC option", async function () {
      const width = 10;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const longCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, longCallTokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      resolved = await pool.burnOptions(longCallTokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      console.log(" Gas used = " + gas.toNumber());

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, longCallTokenId)).toString()).to.equal("0");
    });
  });

  describe("QA tests short put", async function () {
    // it("should swap x amount of token0 to cover desired price range ", async function () {
    //   const liquidity = await uniPool.liquidity();

    //   // TODO : calculate tick from target price using formula : i = log1.0001 p(i)
    //   // currently we are just setting target tick arbitrarly
    //   console.log("tick", tick);
    //   const pa = UniswapV3.priceFromTick(tick);
    //   console.log("initial price=", 10 ** (decimalWETH - decimalUSDC) / pa);

    //   // calculate amount of token0 to cover price range
    //   let amount0 = UniswapV3.getAmount0ForPriceRange(liquidity, tick, tick + 1);

    //   // bring token amount to deployer address
    //   const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
    //   const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);
    //   await grantTokens(USDC_ADDRESS, await deployer.getAddress(), USDC_SLOT, amount0);

    //   // swap
    //   const swapRouter = (await ethers.getContractAt(
    //     "ISwapRouter",
    //     SWAP_ROUTER_ADDRESS
    //   )) as ISwapRouter;

    //   console.log(
    //     "init usdc balance=",
    //     (await usdc.balanceOf(await deployer.getAddress())).toString()
    //   );

    //   await usdc.approve(swapRouter.address, ethers.constants.MaxUint256);

    //   const params: ISwapRouter.ExactInputSingleParamsStruct = {
    //     tokenIn: USDC_ADDRESS,
    //     tokenOut: WETH_ADDRESS,
    //     fee: await uniPool.fee(),
    //     recipient: await deployer.getAddress(),
    //     deadline: 1759448473,
    //     amountIn: amount0,
    //     amountOutMinimum: ethers.utils.parseEther("1"),
    //     sqrtPriceLimitX96: 0,
    //   };

    //   const resolved = await swapRouter.exactInputSingle(params);
    //   const receipt = await resolved.wait();

    //   const slot0_ = await uniPool.slot0();
    //   const newPrice = Math.pow(1.0001, slot0_.tick);
    //   console.log("new price =", 10 ** (decimalWETH - decimalUSDC) / newPrice);
    //   console.log("new tick =", slot0_.tick);

    //   console.log(" Gas used = " + receipt.gasUsed.toNumber());
    // });

    it("should allow to mint short put with minimum width", async function () {
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortPutTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, shortPutTokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, shortPutTokenId, 0)).baseLiquidity.toString()).to.equal(
        "0"
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4999999999999999995"
      );

      console.log(" Gas used = " + gas.toNumber());
    });

    it("should allow to mint short put with maximum width", async function () {
      const width = 1000;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50000");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortPutTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, shortPutTokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, shortPutTokenId, 0)).baseLiquidity.toString()).to.equal(
        "0"
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4999999999999999995"
      );

      console.log(" Gas used = " + gas.toNumber());
    });

    it("should mint short put with strike higher than spot ", async function () {
      const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
      const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);

      const init_balance = await usdc.balanceOf(await deployer.getAddress());

      ///////// MINT OPTION
      const width = 10;
      let strike = tick + 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("10");

      const numberOfContracts = ethers.utils.parseEther("1");
      await pool.deposit(amount1, token1);

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

      await expect(pool.mintOptions([tokenId], numberOfContracts)).to.be.revertedWith("STF");
    });

    it("should burns put with minimum range factor then collect fee ", async function () {
      const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
      const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);

      const init_balance = await usdc.balanceOf(await deployer.getAddress());

      ///////// MINT OPTION
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("10");

      const numberOfContracts = ethers.utils.parseEther("1");
      await pool.deposit(amount1, token1);

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

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      ///////// SWAP
      const liquidity = await uniPool.liquidity();

      const pa = UniswapV3.priceFromTick(tick);
      //console.log("initial price=", 10 ** (decimalWETH - decimalUSDC) / pa);

      let amount = UniswapV3.getAmount0ForPriceRange(liquidity, tick, tick + 10);

      await grantTokens(USDC_ADDRESS, await swapper.getAddress(), USDC_SLOT, amount);

      const swapRouter = (await ethers.getContractAt(
        "ISwapRouter",
        SWAP_ROUTER_ADDRESS
      )) as ISwapRouter;

      await usdc.connect(swapper).approve(swapRouter.address, ethers.constants.MaxUint256);

      const params: ISwapRouter.ExactInputSingleParamsStruct = {
        tokenIn: USDC_ADDRESS,
        tokenOut: WETH_ADDRESS,
        fee: await uniPool.fee(),
        recipient: await deployer.getAddress(),
        deadline: 1759448473,
        amountIn: amount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      resolved = await swapRouter.connect(swapper).exactInputSingle(params);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      ///////// BURN OPTIONS

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());

      let final_balance = await usdc.balanceOf(await deployer.getAddress());
    });

    it("shouldn't mint when position is unhealthy ", async function () {
      const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
      const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);

      ///////// MINT OPTION
      const width = 10;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token1);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await pool.connect(optionWriter).deposit(amount0, token1);

      await expect(
        pool.connect(optionWriter).mintOptions([tokenId], numberOfContracts)
      ).to.be.revertedWith("Not healthy");
    });
  });
  describe("QA tests short call", async function () {
    it("should allow to mint short call with minimum width", async function () {
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortPutTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, shortPutTokenId)).toString()).to.equal(
        numberOfContracts.toString()
      );
      expect((await pool.options(depositor, shortPutTokenId, 0)).baseLiquidity.toString()).to.equal(
        "0"
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "4999999999999999995"
      );

      console.log(" Gas used = " + gas.toNumber());
    });
    it("shouldn't mint short call with strike lower than spot ", async function () {
      const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
      const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);

      const init_balance = await weth.balanceOf(await deployer.getAddress());

      ///////// MINT OPTION
      const width = 10;
      let strike = tick - 100;
      strike = strike - (strike % 10);

      const amount = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount, token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await expect(pool.mintOptions([tokenId], numberOfContracts)).to.be.revertedWith("STF");
    });

    it("should mint short call with minimum width and collect fees ", async function () {
      const usdc = await ERC20__factory.connect(USDC_ADDRESS, deployer);
      const weth = await ERC20__factory.connect(WETH_ADDRESS, deployer);

      const init_balance = await weth.balanceOf(await deployer.getAddress());

      // console.log("init  balance", init_balance.toString());

      ///////// MINT OPTION
      const width = 2;
      let strike = tick + 100;
      strike = strike - (strike % 10);

      // console.log(
      //   "init usdc balance=",
      //   (await usdc.balanceOf(await deployer.getAddress())).toString()
      // );

      const amount0 = BigNumber.from(100000e6);

      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const tokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([tokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      let after_mint_balance = await usdc.balanceOf(await deployer.getAddress());
      // console.log("after_mint_balance", after_mint_balance.toString());

      ///////// SWAP
      const liquidity = await uniPool.liquidity();

      const pa = UniswapV3.priceFromTick(tick);
      // console.log("initial price=", 10 ** (decimalWETH - decimalUSDC) / pa);

      let amount = UniswapV3.getAmount1ForPriceRange(liquidity, tick, tick + 10);

      // console.log("amount to swap", amount.toString());
      await grantTokens(WETH_ADDRESS, await swapper.getAddress(), WETH_SLOT, amount);

      const swapRouter = (await ethers.getContractAt(
        "ISwapRouter",
        SWAP_ROUTER_ADDRESS
      )) as ISwapRouter;

      await weth.connect(swapper).approve(swapRouter.address, ethers.constants.MaxUint256);

      const params: ISwapRouter.ExactInputSingleParamsStruct = {
        tokenIn: WETH_ADDRESS,
        tokenOut: USDC_ADDRESS,
        fee: await uniPool.fee(),
        recipient: await deployer.getAddress(),
        deadline: 1759448473,
        amountIn: amount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      resolved = await swapRouter.connect(swapper).exactInputSingle(params);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);

      const slot0_ = await uniPool.slot0();
      const newPrice = Math.pow(1.0001, slot0_.tick);
      // console.log("new price =", 10 ** (decimalWETH - decimalUSDC) / newPrice);
      // console.log("new tick", slot0_.tick);

      ///////// BURN OPTIONS

      resolved = await pool.burnOptions(tokenId);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());

      let final_balance = await weth.balanceOf(await deployer.getAddress());
      // console.log("final  balance", final_balance.toString());
      // console.log("trading gains:", final_balance.sub(init_balance).toString());
    });

    it("should allow to mint short call when pool doesnt have enough liquidity ", async function () {
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("4");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      await pool.connect(optionWriter).deposit(ethers.utils.parseEther("0.00001"), token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await expect(
        pool.connect(optionWriter).mintOptions([shortPutTokenId], numberOfContracts)
      ).to.be.revertedWith("STF");
    });
    it("should allow to mint short call when position is not healthy ", async function () {
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("5");

      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await expect(
        pool.connect(optionWriter).mintOptions([shortPutTokenId], numberOfContracts)
      ).to.be.revertedWith("Not healthy");
    });
  });

  describe("QA tests long put", async function () {
    it("should allow to mint&burn long put option", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1, token1);

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortPutTokenId], numberOfContracts);

      const longPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortPutTokenId, longPutTokenId], numberOfContracts.div(3));

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("2");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal(
        numberOfContracts.div(3).toString()
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "23333333333333333371"
      );

      await pool.burnOptions(longPutTokenId);

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal("0");
    });
    it("should allow to mint&burn long put option with minimum width", async function () {
      const width = 2;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1, token1);

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortPutTokenId], numberOfContracts);

      const longPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await pool.mintOptions([shortPutTokenId, longPutTokenId], numberOfContracts.div(3));

      const depositor = await deployer.getAddress();

      expect((await pool.positionCounter(depositor)).toString()).to.equal("2");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal(
        numberOfContracts.div(3).toString()
      );
      expect((await pool.poolBalances()).totalToken0InAMM.toString()).to.equal("0");
      expect((await pool.poolBalances()).totalToken1InAMM.toString()).to.equal(
        "23333333333333333335"
      );

      await pool.burnOptions(longPutTokenId);

      expect((await pool.positionCounter(depositor)).toString()).to.equal("1");
      expect((await pool.positionBalance(depositor, longPutTokenId)).toString()).to.equal("0");
    });
    it("should allow to mint long put option with strike higher than spot", async function () {
      const width = 2;
      let strike = tick + 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("50");
      const numberOfContracts = ethers.utils.parseEther("5");

      await pool.deposit(amount1, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await expect(pool.mintOptions([shortPutTokenId], numberOfContracts)).to.be.revertedWith(
        "STF"
      );
    });
    it("should allow to mint long put option when position is not healthy", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("5");
      const numberOfContracts = ethers.utils.parseEther("5");

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await expect(pool.mintOptions([shortPutTokenId], numberOfContracts)).to.be.revertedWith(
        "Not healthy"
      );
    });
    it("should allow to mint long put option when not enough liquidity in pool", async function () {
      const width = 10;
      let strike = tick - 1100;
      strike = strike - (strike % 10);

      const amount1 = ethers.utils.parseEther("3");
      const numberOfContracts = ethers.utils.parseEther("1");

      await pool.deposit(amount1, token1);

      await pool.connect(optionWriter).deposit(numberOfContracts, token1);

      const shortPutTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 1,
          riskPartner: 0,
        },
      ]);

      await expect(pool.mintOptions([shortPutTokenId], numberOfContracts)).to.be.revertedWith(
        "STF"
      );
    });
  });

  describe("QA tests long call", async function () {
    it("should allow to mint long call ", async function () {
      const width = 10;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const longCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, longCallTokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());
    });
    it("should allow to mint long call with minimum width", async function () {
      const width = 2;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      let resolved = await pool.mintOptions([shortCallTokenId], numberOfContracts);
      let receipt = await resolved.wait();
      let gas = receipt.gasUsed;

      const longCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 1,
          strike,
          long: true,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      resolved = await pool.mintOptions([shortCallTokenId, longCallTokenId], numberOfContracts);
      receipt = await resolved.wait();
      gas = gas.add(receipt.gasUsed);
      console.log(" Gas used = " + gas.toNumber());
    });
    it("should allow to mint long call with strike lower than spot", async function () {
      const width = 2;
      let strike = tick - 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      await pool.deposit(amount0, token0);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);

      await expect(pool.mintOptions([shortCallTokenId], numberOfContracts)).to.be.revertedWith(
        "STF"
      );
    });
    it("should allow to mint long call when position is unhealthy", async function () {
      const width = 2;
      let strike = tick + 1000;
      strike = strike - (strike % 10);

      const amount0 = BigNumber.from(50000e6);
      const numberOfContracts = BigNumber.from(10e6);

      const shortCallTokenId = OptionEncoding.encodeID(poolId, [
        {
          width,
          ratio: 5,
          strike,
          long: false,
          tokenType: 0,
          riskPartner: 0,
        },
      ]);
      await expect(pool.mintOptions([shortCallTokenId], numberOfContracts)).to.be.revertedWith(
        "Not healthy"
      );
    });
    // it("should allow to mint long call when not enough liquidity in pool", async function () {
    //   const width = 2;
    //   let strike = tick + 1000;
    //   strike = strike - (strike % 10);

    //   const amount0 = BigNumber.from(50000e6);
    //   const numberOfContracts = BigNumber.from(10e6);

    //   await pool.deposit(numberOfContracts, token0);

    //   await pool.connect(optionWriter).deposit(numberOfContracts, token0);

    //   const shortCallTokenId = OptionEncoding.encodeID(poolId, [
    //     {
    //       width,
    //       ratio: 5,
    //       strike,
    //       long: false,
    //       tokenType: 0,
    //       riskPartner: 0,
    //     },
    //   ]);
    //   await expect(
    //     pool.connect(optionWriter).mintOptions([shortCallTokenId], numberOfContracts)
    //   ).to.be.revertedWith("STF");
    // });
  });
});
