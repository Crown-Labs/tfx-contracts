# TFX Contracts

Contracts for TFX.

Docs at https://tfx-market.gitbook.io/tfx/transparency/contracts

## Install Dependencies

If npx is not installed yet:
`npm install -g npx`

Install packages:
`npm i`

## Compile Contracts

`npx hardhat compile`

## Run Tests

`npx hardhat test`

## Deploy Script

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

// referral
yarn deploy scripts/deploy/core/setTiersReferralStorage.js
yarn deploy scripts/deploy/peripherals/deployBatchSender.js

// update Reward V2: please change token in this file (scripts/deploy/staking/updateRewardsV2.js)
// deposit WBNB
yarn deploy scripts/deploy/staking/updateRewardsV2.js
```
