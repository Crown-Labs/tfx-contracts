# GMX Contracts

Contracts for GMX.

Docs at https://gmxio.gitbook.io/gmx/contracts.

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
yarn deploy scripts/tfx_deploy/tokens/deployTokens.js
yarn deploy scripts/tfx_deploy/access/deployTokenManager.js

// core
yarn deploy scripts/tfx_deploy/core/deployVault.js
yarn deploy scripts/tfx_deploy/core/deployReferralStorage.js
yarn deploy scripts/tfx_deploy/core/deployPositionRouter.js
yarn deploy scripts/tfx_deploy/core/deployOrderBookPositionManager.js

// stake
yarn deploy scripts/tfx_deploy/staking/deployRewardRouterV2.js

// oracle
yarn deploy scripts/tfx_deploy/oracle/deployFulfillController.js

// timelock
yarn deploy scripts/tfx_deploy/peripherals/deployTimelock.js

// reader
yarn deploy scripts/tfx_deploy/peripherals/deployOrderBookReader.js
yarn deploy scripts/tfx_deploy/peripherals/deployRewardReader.js
yarn deploy scripts/tfx_deploy/peripherals/deployVaultReader.js
yarn deploy scripts/tfx_deploy/peripherals/deployReader.js
yarn deploy scripts/tfx_deploy/peripherals/deployGLPManagerReader.js
yarn deploy scripts/tfx_deploy/core/deployReferralReader.js

// referral
yarn deploy scripts/tfx_deploy/core/setTiersReferralStorage.js
yarn deploy scripts/tfx_deploy/peripherals/deployBatchSender.js

// update Reward V2: please change token in this file (scripts/tfx_deploy/staking/updateRewardsV2.js)
// deposit WBNB
yarn deploy scripts/tfx_deploy/staking/updateRewardsV2.js
```
