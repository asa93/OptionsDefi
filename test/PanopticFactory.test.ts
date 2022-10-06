import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { OptionsFactory } from "../types";

describe("OptionsFactory", function () {
  const contractName = "OptionsFactory";
  let factory: OptionsFactory;

  before(async () => {
    await deployments.fixture([
      contractName,
      "OptionEncoding",
      "OptionsMath",
      "OptionsHealth",
      "SemiFungiblePositionManager",
    ]);
    const { address } = await deployments.get(contractName);

    factory = (await ethers.getContractAt(contractName, address)) as OptionsFactory;
  });

  it("should deploy the factory", async function () {
    expect(factory.address).to.be.not.undefined;
  });
});
