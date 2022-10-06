import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { PanopticFactory } from "../types";

describe("PanopticFactory", function () {
  const contractName = "PanopticFactory";
  let factory: PanopticFactory;

  before(async () => {
    await deployments.fixture([
      contractName,
      "OptionEncoding",
      "PanopticMath",
      "PanopticHealth",
      "SemiFungiblePositionManager",
    ]);
    const { address } = await deployments.get(contractName);

    factory = (await ethers.getContractAt(contractName, address)) as PanopticFactory;
  });

  it("should deploy the factory", async function () {
    expect(factory.address).to.be.not.undefined;
  });
});
