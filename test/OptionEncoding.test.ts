import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { OptionEncoding, OptionEncoding__factory } from "../types";
import * as OptionEncodingHelper from "./libraries/OptionEncoding";

describe("OptionEncoding", function () {
  const OptionEncodingLibContractName = "OptionEncoding";
  let optionEncodingLib: OptionEncoding;

  before(async () => {
    await deployments.fixture([OptionEncodingLibContractName]);
    const { address: optionEncodingLibAddress } = await deployments.get(
      OptionEncodingLibContractName
    );
    const LibFactory = (await ethers.getContractFactory("MockOptionEncoding", {
      libraries: {
        OptionEncoding: optionEncodingLibAddress,
      },
    })) as OptionEncoding__factory;

    optionEncodingLib = await LibFactory.deploy();
  });

  it("option encoding: encode and decode", async () => {
    const tokenId = OptionEncodingHelper.encodeID(BigInt(10), [
      { width: 100, strike: 200006, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
    ]);

    const encodedTokenId = await optionEncodingLib.encodeID(
      [
        {
          width: 100,
          strike: 200006,
          riskPartner: 0,
          tokenType: 1,
          long: 1,
          ratio: 1,
        },
      ],
      BigInt(10)
    );
    expect(tokenId.toString()).to.equal(encodedTokenId.toString());

    const decodedToken = await optionEncodingLib.decodeID(tokenId);
    expect(decodedToken.pool_id).to.be.equal(BigInt(10));
    expect(decodedToken.optionData[0].tokenType).to.be.equal(1);
    expect(decodedToken.optionData[0].long).to.be.equal(1);
    expect(decodedToken.optionData[0].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[0].strike).to.be.equal(200006);
    expect(decodedToken.optionData[0].width).to.be.equal(100);
    expect(decodedToken.optionData[0].ratio).to.be.equal(1);

    expect(decodedToken.optionData[1].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[1].long).to.be.equal(0);
    expect(decodedToken.optionData[1].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[1].strike).to.be.equal(0);
    expect(decodedToken.optionData[1].width).to.be.equal(0);
    expect(decodedToken.optionData[1].ratio).to.be.equal(0);

    expect(decodedToken.optionData[2].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[2].long).to.be.equal(0);
    expect(decodedToken.optionData[2].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[2].strike).to.be.equal(0);
    expect(decodedToken.optionData[2].width).to.be.equal(0);
    expect(decodedToken.optionData[2].ratio).to.be.equal(0);

    expect(decodedToken.optionData[3].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[3].long).to.be.equal(0);
    expect(decodedToken.optionData[3].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[3].strike).to.be.equal(0);
    expect(decodedToken.optionData[3].width).to.be.equal(0);
    expect(decodedToken.optionData[3].ratio).to.be.equal(0);
  });

  it("option encoding: negative strike", async () => {
    const tokenId = OptionEncodingHelper.encodeID(BigInt(10), [
      { width: 100, strike: -1000, riskPartner: 0, ratio: 1, tokenType: 1, long: true },
    ]);

    const encodedTokenId = await optionEncodingLib.encodeID(
      [
        {
          width: 100,
          strike: -1000,
          riskPartner: 0,
          tokenType: 1,
          long: 1,
          ratio: 1,
        },
      ],
      BigInt(10)
    );
    expect(tokenId.toString()).to.equal(encodedTokenId.toString());

    const decodedToken = await optionEncodingLib.decodeID(tokenId);
    expect(decodedToken.pool_id).to.be.equal(BigInt(10));
    expect(decodedToken.optionData[0].tokenType).to.be.equal(1);
    expect(decodedToken.optionData[0].long).to.be.equal(1);
    expect(decodedToken.optionData[0].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[0].strike).to.be.equal(-1000);
    expect(decodedToken.optionData[0].width).to.be.equal(100);
    expect(decodedToken.optionData[0].ratio).to.be.equal(1);

    expect(decodedToken.optionData[1].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[1].long).to.be.equal(0);
    expect(decodedToken.optionData[1].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[1].strike).to.be.equal(0);
    expect(decodedToken.optionData[1].width).to.be.equal(0);
    expect(decodedToken.optionData[1].ratio).to.be.equal(0);

    expect(decodedToken.optionData[2].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[2].long).to.be.equal(0);
    expect(decodedToken.optionData[2].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[2].strike).to.be.equal(0);
    expect(decodedToken.optionData[2].width).to.be.equal(0);
    expect(decodedToken.optionData[2].ratio).to.be.equal(0);

    expect(decodedToken.optionData[3].tokenType).to.be.equal(0);
    expect(decodedToken.optionData[3].long).to.be.equal(0);
    expect(decodedToken.optionData[3].riskPartner).to.be.equal(0);
    expect(decodedToken.optionData[3].strike).to.be.equal(0);
    expect(decodedToken.optionData[3].width).to.be.equal(0);
    expect(decodedToken.optionData[3].ratio).to.be.equal(0);
  });
});
