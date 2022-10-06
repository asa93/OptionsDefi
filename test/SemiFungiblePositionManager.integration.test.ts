import { config, deployments, ethers, network } from "hardhat";
import { expect } from "chai";
import { ERC20, IUniswapV3Pool, IWETH9, SemiFungiblePositionManager } from "../types";
import * as OptionEncoding from "./libraries/OptionEncoding";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { grantTokens } from "./utils";

describe("SemiFungiblePositionManager-integration", function () {
  let positionManager: SemiFungiblePositionManager;
  let token0: ERC20;
  let token1: ERC20;
  let WETH: IWETH9;
  const WETH_SLOT = 3;
  let pool: IUniswapV3Pool;
  let users: SignerWithAddress[];
  let startingBlockNumber = 14822946;
  const SFPMContractName = "SemiFungiblePositionManager";

  beforeEach(async () => {
    users = await ethers.getSigners();
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.hardhat.forking?.url,
            blockNumber: config.networks.hardhat.forking?.blockNumber,
          },
        },
      ],
    });
    await network.provider.send("hardhat_setBalance", [
      users[0].address,
      "0x1000000000000000000000000000",
    ]);
    await deployments.fixture(["OptionEncoding", "PanopticMath", SFPMContractName]);
    const { address: sfpmAddress } = await deployments.get(SFPMContractName);

    positionManager = (await ethers.getContractAt(
      SFPMContractName,
      sfpmAddress
    )) as SemiFungiblePositionManager;

    const ETH_USDC_POOL_ADDRESS = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
    const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

    WETH = (await ethers.getContractAt("IWETH9", WETH_ADDRESS)) as IWETH9;
    token0 = (await ethers.getContractAt("ERC20", USDC_ADDRESS)) as ERC20;
    token1 = (await ethers.getContractAt("ERC20", WETH_ADDRESS)) as ERC20;
    pool = (await ethers.getContractAt("IUniswapV3Pool", ETH_USDC_POOL_ADDRESS)) as IUniswapV3Pool;
    // initialize the pool
    await positionManager.initializePool({
      token0: token0.address,
      token1: token1.address,
      fee: 500,
    });
  });

  it("pay with safeTransferFrom", async () => {
    // exchange for 100 weth
    const [alice] = users;
    await grantTokens(WETH.address, alice.address, WETH_SLOT, ethers.utils.parseEther("100"));
    await WETH.connect(alice).approve(positionManager.address, ethers.utils.parseEther("100"));
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: false }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");
  });

  it("pay with value", async () => {
    // exchange for 100 weth
    const [alice] = users;
    await grantTokens(WETH.address, alice.address, WETH_SLOT, ethers.utils.parseEther("100"));
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: false }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address, {
          value: ethers.utils.parseEther("1"),
        })
    ).to.emit(positionManager, "TokenizedPositionMinted");
    const ethBalance = await ethers.provider.getBalance(positionManager.address);
  });

  it("burn failed: insuficient position", async () => {
    // exchange for 100 weth
    const [alice] = users;
    await grantTokens(WETH.address, alice.address, WETH_SLOT, ethers.utils.parseEther("100"));
    await WETH.connect(alice).approve(positionManager.address, ethers.utils.parseEther("100"));
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.be.revertedWith("LS");
  });

  it("burn successfully after minting", async () => {
    // exchange for 100 weth
    const [alice] = users;
    await grantTokens(WETH.address, alice.address, WETH_SLOT, ethers.utils.parseEther("100"));
    await WETH.connect(alice).approve(positionManager.address, ethers.utils.parseEther("100"));
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: false }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    // remove approval
    await WETH.connect(alice).approve(positionManager.address, ethers.utils.parseEther("0"));

    await expect(
      positionManager.connect(alice).burnTokenizedPosition(tokenId.toString(), alice.address)
    ).to.emit(positionManager, "TokenizedPositionBurnt");
  });

  describe("rollPosition: different pool", async () => {
    const ETH_DAI_POOL_ADDRESS = "0x6c6Bc977E13Df9b0de53b251522280BB72383700";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const DAI_SLOT = 2;

    let nToken0: ERC20;
    let nToken1: ERC20;
    let DAI: ERC20;
    let nPool: IUniswapV3Pool;

    beforeEach(async () => {
      nToken0 = (await ethers.getContractAt("ERC20", DAI_ADDRESS)) as ERC20;
      nToken1 = (await ethers.getContractAt("ERC20", USDC_ADDRESS)) as ERC20;
      DAI = nToken0;
      nPool = (await ethers.getContractAt(
        "IUniswapV3Pool",
        ETH_DAI_POOL_ADDRESS
      )) as IUniswapV3Pool;
      // initialize the pool
      await positionManager.initializePool({
        token0: nToken0.address,
        token1: nToken1.address,
        fee: 500,
      });
    });

    it("one leg: both mint", async () => {
      const [alice] = users;
      await grantTokens(WETH.address, alice.address, WETH_SLOT, ethers.utils.parseEther("100"));
      await WETH.connect(alice).approve(positionManager.address, ethers.utils.parseEther("100"));
      const numberOfContracts = 3;

      const tokenId = OptionEncoding.encodeID(
        BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
        [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: false }]
      );

      await positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address);

      await grantTokens(DAI.address, alice.address, DAI_SLOT, ethers.utils.parseEther("100"));
      await DAI.connect(alice).approve(positionManager.address, ethers.utils.parseEther("100"));

      const newTokenId = OptionEncoding.encodeID(
        BigInt(nPool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
        [{ width: 4000, strike: 10000, riskPartner: 0, ratio: 4, tokenType: 1, long: false }]
      );

      await positionManager.connect(alice).rollPosition(tokenId, newTokenId, alice.address);
    });
  });
});
