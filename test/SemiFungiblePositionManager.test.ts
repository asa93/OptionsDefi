import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import {
  SemiFungiblePositionManager,
  Token,
  MockUniswapV3Pool,
  MockUniswapV3Pool__factory,
} from "../types";
import * as OptionEncoding from "./libraries/OptionEncoding";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { initPoolAddress } from "./utils";

describe("SemiFungiblePositionManager", function () {
  let positionManager: SemiFungiblePositionManager;
  let token0: Token;
  let token1: Token;
  let pool: MockUniswapV3Pool;
  let users: SignerWithAddress[];
  const SFPMContractName = "SemiFungiblePositionManager";
  const Token0DeploymentName = "Token0";
  const Token0ContractName = "Token";
  const Token1DeploymentName = "Token1";
  const Token1ContractName = "Token";
  const UniswapV3MockPoolDeploymentName = "MockUniswapV3Pool";
  const UniswapV3MockPoolContractName = "MockUniswapV3Pool";

  before(async () => {
    await deployments.fixture([
      "OptionEncoding",
      "OptionsMath",
      SFPMContractName,
      UniswapV3MockPoolDeploymentName,
    ]);
    const { address: sfpmAddress } = await deployments.get(SFPMContractName);
    const { address: uniswapV3PoolAddress } = await deployments.get(
      UniswapV3MockPoolDeploymentName
    );
    const { address: token0Address } = await deployments.get(Token0DeploymentName);
    const { address: token1Address } = await deployments.get(Token1DeploymentName);
    positionManager = (await ethers.getContractAt(
      SFPMContractName,
      sfpmAddress
    )) as SemiFungiblePositionManager;
    token0 = (await ethers.getContractAt(Token0ContractName, token0Address)) as Token;
    token1 = (await ethers.getContractAt(Token1ContractName, token1Address)) as Token;
    pool = (await ethers.getContractAt(
      UniswapV3MockPoolContractName,
      uniswapV3PoolAddress
    )) as MockUniswapV3Pool;

    users = await ethers.getSigners();

    // mock pool address for unit tests
    await initPoolAddress(
      positionManager.address,
      String(pool.address.slice(0, 22).toLowerCase()),
      4,
      pool.address
    );
  });

  it("option mint fails: invalid pool 0 address", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(BigInt(0), [
      { width: 1, strike: 0, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
    ]);
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid pool=0");
  });

  it("option mint fails: invalid pool id", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(BigInt(1), [
      { width: 1, strike: 0, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
    ]);
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: pool not initialized");
  });

  it("option mint fails: zero ratio position 0", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 0, strike: 0, riskPartner: 0, ratio: 0, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid ratio at position0");
  });

  it("option mint fails: invalid ratio", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 0, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 0, riskPartner: 0, ratio: 0, tokenType: 1, long: true },
        { width: 1, strike: 0, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid ratio");
  });

  it("option mint fails: invalid ratio", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 5, strike: 1, riskPartner: 0, ratio: 1, tokenType: 1, long: false },
        { width: 5, strike: 2, riskPartner: 1, ratio: 0, tokenType: 1, long: false },
        { width: 5, strike: 3, riskPartner: 2, ratio: 1, tokenType: 1, long: false },
        { width: 5, strike: 4, riskPartner: 3, ratio: 1, tokenType: 1, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid ratio");
  });

  it("option mint fails: invalid width", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 0, strike: 1, riskPartner: 0, ratio: 9, tokenType: 1, long: false }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid width");
  });

  it("option mint fails: invalid strike", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 887272, riskPartner: 0, ratio: 9, tokenType: 1, long: false }]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid strike");
  });

  it("option mint fails: invalid strike + width", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 4095, strike: 1, riskPartner: 0, ratio: 9, tokenType: 1, long: false }]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid strike + width");
  });

  it("option mint fails: invalid risk partner", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 1, riskPartner: 2, ratio: 9, tokenType: 1, long: true }]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid risk partner");
  });

  it("option mint fails: invalid risk partner pair", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 1, riskPartner: 2, ratio: 9, tokenType: 1, long: false },
        { width: 1, strike: 1, riskPartner: 1, ratio: 9, tokenType: 1, long: false },
        { width: 1, strike: 1, riskPartner: 0, ratio: 9, tokenType: 1, long: false },
      ]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid risk partner");
  });

  it("option mint fails: invalid risk partner pair different ratio or different tokenType", async () => {
    const [alice] = users;
    const numberOfContracts = 3;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 1, riskPartner: 1, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 1, riskPartner: 0, ratio: 9, tokenType: 1, long: false },
        { width: 1, strike: 1, riskPartner: 2, ratio: 1, tokenType: 1, long: false },
      ]
    );
    await expect(
      // wrong ratio
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid risk partner");
    const tokenId2 = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 1, riskPartner: 1, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 1, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 1, strike: 1, riskPartner: 2, ratio: 1, tokenType: 1, long: false },
      ]
    );
    await expect(
      // wrong tokenType
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId2, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid risk partner");

    const tokenId3 = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 1, riskPartner: 1, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 1, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 1, riskPartner: 2, ratio: 1, tokenType: 1, long: false },
      ]
    );
    await expect(
      // same long value
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId3, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: invalid risk partner");

    const tokenId4 = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 1, strike: 1, riskPartner: 1, ratio: 1, tokenType: 1, long: true },
        { width: 1, strike: 1, riskPartner: 0, ratio: 1, tokenType: 1, long: false },
        { width: 1, strike: 1, riskPartner: 2, ratio: 1, tokenType: 1, long: false },
      ]
    );
    await expect(
      // success
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId4.toString(), numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");
  });

  it("option mint fails: 0 options", async () => {
    const [alice] = users;
    const numberOfContracts = 0;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 1, riskPartner: 0, ratio: 9, tokenType: 1, long: true }]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: zero number of options");
  });

  it("option mint succeeds", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");
  });

  //it("option count after mint", async () => {
  //  const [alice] = users;

  //  const tokenId = OptionEncoding.encodeID(
  //    BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
  //    [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: true, long: true }]
  //  );

  //  expect((await positionManager.getOptions(alice.address, tokenId)).length).to.equal(1);
  //});

  it("option mint fails: no option minted", async () => {
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 0, riskPartner: 0, ratio: 9, tokenType: 1, long: true }]
    );

    await expect(
      positionManager.connect(alice).mintTokenizedPosition(tokenId, 0, users[0].address)
    ).to.revertedWith("SFPM: zero number of options");
  });

  it("option burn succeeds", async () => {
    const [alice] = users;
    const numberOfContracts = 3;
    const poolId = pool.address.slice(0, 22).toLowerCase();

    const tokenId = OptionEncoding.encodeID(
      BigInt(poolId), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 0, long: false }]
    );
    positionManager
      .connect(alice)
      .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address);

    await expect(positionManager.connect(alice).burnTokenizedPosition(tokenId, users[0].address))
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .withArgs(users[0].address, tokenId, numberOfContracts);
  });

  //it("option count after burn", async () => {
  //  const [alice] = users;

  //  const tokenId = OptionEncoding.encodeID(
  //    BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
  //    [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: true, long: true }]
  //  );

  //  expect((await positionManager.getOptions(alice.address, tokenId)).length).to.equal(0);
  //});

  it("rollPosition: different poolId", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    const MockUniswapV3Pool__factory = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool2 = await MockUniswapV3Pool__factory.deploy(token0.address, token1.address, 0);

    // mock pool address for unit tests
    await initPoolAddress(
      positionManager.address,
      String(pool2.address.slice(0, 22).toLowerCase()),
      4,
      pool2.address
    );

    const newTokenId = OptionEncoding.encodeID(
      BigInt(pool2.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 3, strike: 4, riskPartner: 0, ratio: 5, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: one leg, same poolId", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 4, riskPartner: 0, ratio: 5, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    ).to.be.revertedWith("SFPM: not an option roll");

    newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 4, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: two legs, same poolId", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 4094, strike: 0, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 10, strike: 1000, riskPartner: 1, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 4094, strike: 0, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 10, strike: 500, riskPartner: 1, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: three legs, same poolId", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 10, strike: 1000, riskPartner: 1, ratio: 1, tokenType: 0, long: false },
        { width: 3, strike: 10000, riskPartner: 2, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 100, strike: -1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 10, strike: 1000, riskPartner: 1, ratio: 1, tokenType: 0, long: false },
        { width: 40, strike: -10000, riskPartner: 2, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: two legs, riskPartners, one-leg roll", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: 500, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: four legs, riskPartners, two-leg wings roll", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 6000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 33, strike: 10000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: 500, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 6000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 3, strike: 8000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: four legs, riskPartners, two-leg guts roll", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 6000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 33, strike: 10000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: -900, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 9000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 3, strike: 10000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: four legs, riskPartners, three-leg roll", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 6000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 33, strike: 10000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: -1000, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: -900, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 9000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 3, strike: 95000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("rollPosition: four legs, riskPartners, four-leg roll", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 10, strike: 100, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 10, strike: 1000, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 33, strike: 6000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 33, strike: 10000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId, numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");

    let newTokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [
        { width: 2, strike: 1, riskPartner: 1, ratio: 1, tokenType: 0, long: true },
        { width: 3, strike: 6767, riskPartner: 0, ratio: 1, tokenType: 0, long: false },
        { width: 4, strike: 9000, riskPartner: 3, ratio: 4, tokenType: 0, long: false },
        { width: 4094, strike: 95000, riskPartner: 2, ratio: 4, tokenType: 0, long: true },
      ]
    );
    await expect(
      positionManager
        .connect(alice)
        .rollPosition(tokenId.toString(), newTokenId.toString(), users[0].address)
    )
      .to.emit(positionManager, "TokenizedPositionMinted")
      .to.emit(positionManager, "TokenizedPositionBurnt")
      .to.emit(positionManager, "TokenizedPositionRolled");
  });

  it("uniswapV3MintCallback permission check", async () => {
    const [alice] = users;
    const encoded_data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint24", "address"],
      [token0.address, token1.address, 0, alice.address]
    );

    await expect(
      positionManager.connect(alice).uniswapV3MintCallback(100, 100, encoded_data)
    ).to.be.revertedWith("");
  });

  it("erc1155 not transferable", async () => {
    const numberOfContracts = 3;
    const [alice, bob] = users;

    const tokenId = OptionEncoding.encodeID(
      BigInt(pool.address.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.emit(positionManager, "TokenizedPositionMinted");
    expect(await positionManager.balanceOf(alice.address, tokenId.toString())).to.be.equal("3");
    await expect(
      positionManager.safeTransferFrom(alice.address, bob.address, tokenId.toString(), 1, [])
    ).to.be.revertedWith("SFPM: transfer is not allowed");
    await expect(
      positionManager.safeBatchTransferFrom(
        alice.address,
        bob.address,
        [tokenId.toString()],
        [1],
        []
      )
    ).to.be.revertedWith("SFPM: transfer is not allowed");
  });

  it("initialize pool", async () => {
    const numberOfContracts = 3;
    const [alice] = users;

    const ETH_USDC_POOL_ADDRESS = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
    const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

    const tokenId = OptionEncoding.encodeID(
      BigInt(ETH_USDC_POOL_ADDRESS.slice(0, 22).toLowerCase()), // extract first 10 bytes for pool id
      [{ width: 1, strike: 2, riskPartner: 0, ratio: 4, tokenType: 1, long: true }]
    );

    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.revertedWith("SFPM: pool not initialized");

    // initialize the pool
    await positionManager.initializePool({ token0: USDC_ADDRESS, token1: WETH_ADDRESS, fee: 500 });

    // passes pool id check
    await expect(
      positionManager
        .connect(alice)
        .mintTokenizedPosition(tokenId.toString(), numberOfContracts, users[0].address)
    ).to.revertedWith("LS");
  });
});
