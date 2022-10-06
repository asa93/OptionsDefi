type OptionConfig = {
  width: number;
  strike: number;
  riskPartner: number;
  ratio: number;
  tokenType: number;
  long: boolean;
};
export const convertStrike = (n: number) => {
  if (n < 0) {
    // 3 bytes because strike is int24
    return 16777216 + n;
  } else {
    return n;
  }
};

export const encodeID = (poolId: bigint, data: OptionConfig[]) =>
  data.reduce((acc, { width, strike, riskPartner, tokenType, long, ratio }, i) => {
    const _tmp = i * 40;
    return (
      acc +
      (BigInt(width) << BigInt(_tmp + 124)) +
      (BigInt(convertStrike(strike)) << BigInt(_tmp + 100)) +
      (BigInt(riskPartner) << BigInt(_tmp + 98)) +
      (BigInt(tokenType) << BigInt(_tmp + 97)) +
      (BigInt(long ? 1 : 0) << BigInt(_tmp + 96)) +
      (BigInt(ratio) << BigInt(4 * i + 80))
    );
  }, poolId);
