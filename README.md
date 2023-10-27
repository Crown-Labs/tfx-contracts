# TFX Contracts

TFX is a decentralized spot and perpetual exchange that supports low swap fees and zero price impact trades.

Docs at https://tfx-market.gitbook.io/tfx/

##  ⚙️ Local Development
Require node version >= 16.20

Local Setup Steps:
1. git clone https://github.com/Crown-Labs/tfx-contracts
2. Install dependencies: `yarn install` 
3. Compile Contracts: `yarn compile`
4. Run Tests: `yarn test`

## Deployed Contracts

### Linea Testnet
|Contract       | Addresss                                                                                                            |
|:-------------:|:-------------------------------------------------------------------------------------------------------------------:|
|TokenManager            |[0x364163be4DeaBc64B31EC26F88A015BfB62bcb7d](https://goerli.lineascan.build/address/0x364163be4DeaBc64B31EC26F88A015BfB62bcb7d)|
|Vault            |[0x09dcCC142890feF5e67Ff1a04D159168B43B42a9](https://goerli.lineascan.build/address/0x09dcCC142890feF5e67Ff1a04D159168B43B42a9)|
|VaultPositionController            |[0xdDdCe2482D834E12b1199Ce7cd1E581EB43473B6](https://goerli.lineascan.build/address/0xdDdCe2482D834E12b1199Ce7cd1E581EB43473B6)|
|USDX            |[0x0033e9D9CE314CA55de33796c1D4f8a86CBa3F0a](https://goerli.lineascan.build/address/0x0033e9D9CE314CA55de33796c1D4f8a86CBa3F0a)|
|Router            |[0x79ae64811233D750b9F3069f7973670e20758649](https://goerli.lineascan.build/address/0x79ae64811233D750b9F3069f7973670e20758649)|
|VaultPriceFeed            |[0x12F82C1BB4723C3d5463Be56dfbA5C1f6b05DB24](https://goerli.lineascan.build/address/0x12F82C1BB4723C3d5463Be56dfbA5C1f6b05DB24)|
|XLP            |[0x8b9173d89897AD59eCf9dcb7B82902Dea1538080](https://goerli.lineascan.build/address/0x8b9173d89897AD59eCf9dcb7B82902Dea1538080)|
|XlpManager            |[0xB6Ac4D3B40cD3377e9A6674F232758c8C00777aC](https://goerli.lineascan.build/address/0xB6Ac4D3B40cD3377e9A6674F232758c8C00777aC)|
|VaultErrorController            |[0xaDaE30FcE74bbaa74924df21486A8bA9500Ba1C7](https://goerli.lineascan.build/address/0xaDaE30FcE74bbaa74924df21486A8bA9500Ba1C7)|
|PositionRouter            |[0xa1EDD44B97D3bF4F73d979FA22EC39329E5A3f1F](https://goerli.lineascan.build/address/0xa1EDD44B97D3bF4F73d979FA22EC39329E5A3f1F)|
|OrderBook            |[0xFF8d01068d33d21A1Ed9BC099C6C4B7CB151E151](https://goerli.lineascan.build/address/0xFF8d01068d33d21A1Ed9BC099C6C4B7CB151E151)|
|OrderBookOpenOrder            |[0xB7370d593332f6Ed1b9c373E2435e81f7C59aa4e](https://goerli.lineascan.build/address/0xB7370d593332f6Ed1b9c373E2435e81f7C59aa4e)|
|PositionManager            |[0xf89A6379E483D5f5E9AbCcC76a965DD8917fD8b9](https://goerli.lineascan.build/address/0xf89A6379E483D5f5E9AbCcC76a965DD8917fD8b9)|
|fXLP (Fee XLP)            |[0x9a5953a5Bff39e67710482886D7dCDa3A0b8EC67](https://goerli.lineascan.build/address/0x9a5953a5Bff39e67710482886D7dCDa3A0b8EC67)|
|feeXlpDistributor            |[0xccEaEC4b4DBaB09E58beB4aCF6CAd6Ad7E338797](https://goerli.lineascan.build/address/0xccEaEC4b4DBaB09E58beB4aCF6CAd6Ad7E338797)|
|RewardRouterV3            |[0x4c89F5c6E676994D22bE1EE88E2e380644455E51](https://goerli.lineascan.build/address/0x4c89F5c6E676994D22bE1EE88E2e380644455E51)|
|FulfillController            |[0x33a0fcCC68F10D4C5f8f93AE94086c8422d73877](https://goerli.lineascan.build/address/0x33a0fcCC68F10D4C5f8f93AE94086c8422d73877)|
|Timelock            |[0xea237f67Fa61E6B8ED0B0e0b5EF4A4B3564272B9](https://goerli.lineascan.build/address/0xea237f67Fa61E6B8ED0B0e0b5EF4A4B3564272B9)|
|OrderBookReader            |[0x0E171dea36889c2DE1d9320f6d56725c57e16716](https://goerli.lineascan.build/address/0x0E171dea36889c2DE1d9320f6d56725c57e16716)|
|RewardReader            |[0x2588F64e3cAC218E673662552Ce4Ac719dE9d138](https://goerli.lineascan.build/address/0x2588F64e3cAC218E673662552Ce4Ac719dE9d138)|
|VaultReader            |[0x679AEB540d18a291C7e0Cf88E3e3471C25d4e852](https://goerli.lineascan.build/address/0x679AEB540d18a291C7e0Cf88E3e3471C25d4e852)|
|Reader            |[0x764E2EFf3A61EDc3bAAf6Ceb1761b46d5ab7c011](https://goerli.lineascan.build/address/0x764E2EFf3A61EDc3bAAf6Ceb1761b46d5ab7c011)|
|PositionManagerReader            |[0x586CB2cCd204C7D0b30cc050313CE91Ab96B9ec5](https://goerli.lineascan.build/address/0x586CB2cCd204C7D0b30cc050313CE91Ab96B9ec5)|
|XLPManagerReader            |[0x0E171dea36889c2DE1d9320f6d56725c57e16716](https://goerli.lineascan.build/address/0x0E171dea36889c2DE1d9320f6d56725c57e16716)|

## Deploy Scripts

```
// token
yarn deploy scripts/deploy/tokens/deployTokens.js
yarn deploy scripts/deploy/access/deployTokenManager.js

// core
yarn deploy scripts/deploy/core/deployVault.js
yarn deploy scripts/deploy/core/deployReferralStorage.js
yarn deploy scripts/deploy/core/deployPositionRouter.js
yarn deploy scripts/deploy/core/deployOrderBookPositionManager.js

// stake
yarn deploy scripts/deploy/staking/deployRewardRouterV3.js

// oracle
yarn deploy scripts/deploy/oracle/deployFulfillController.js

// timelock
yarn deploy scripts/deploy/peripherals/deployTimelock.js

// reader
yarn deploy scripts/deploy/peripherals/deployOrderBookReader.js
yarn deploy scripts/deploy/peripherals/deployRewardReader.js
yarn deploy scripts/deploy/peripherals/deployVaultReader.js
yarn deploy scripts/deploy/peripherals/deployReader.js
yarn deploy scripts/deploy/peripherals/deployXLPManagerReader.js
yarn deploy scripts/deploy/core/deployReferralReader.js

// others
yarn deploy scripts/deploy/core/setTiersReferralStorage.js
yarn deploy scripts/deploy/peripherals/deployBatchSender.js
```