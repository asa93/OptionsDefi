# Options Finance

[![Coverage Status](https://coveralls.io/repos/github/advancedblockchain/Options/badge.svg?t=Nrsw6V)](https://coveralls.io/github/advancedblockchain/Options)

Options is a governance-minimized options trading protocol. It enables the permissionless trading of perpetual options on top of any asset pool in the Uniswap v3 ecosystem. The Options protocol is noncustodial, has no counterparty risk, offers instantaneous settlement, and is designed to remain fully-collateralized at all time.

```mermaid
graph TD;
    classDef user fill:#f96;
    classDef options fill:#038cfc;
    classDef uni fill:#fc039d;
    PLP(Options LP):::user --> |deposit/withdraw| PP1
    PLP & POT & REG --> |deploy for univ3 pool| PF
    PF[Options Factory]:::options --> |deploy for univ3 pool| PP1
    POT(Options Options Trader):::user -->|mint/burn options| PP1[Options token0-token1 pool]:::options
    REG(UniV3 LP):::user --> |mint/burn| SFPM
    PP1 --> |mint/burn| SFPM[Semi fungible position manager]:::options

    SFPM --> |mint/burn| UNI1[UniV3 token0-token1 pool]:::uni
```

# How to run

This is an ongoing development and documentation and functionalities will be added soon.

Currently, you can compile the contracts by doing

```shell
npx hardhat compile

```

or directly

```shell
yarn compile
```

For running tests

```shell
NODE_URL=<URL to archive node> yarn test
```

