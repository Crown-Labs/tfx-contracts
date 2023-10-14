// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract RewardManager is Governable {
    bool public isInitialized;
    ITimelock public timelock;
    address public rewardRouter;
    address public xlpManager;
    address public feeXlpTracker;

    function initialize(
        ITimelock _timelock,
        address _rewardRouter,
        address _xlpManager,
        address _feeXlpTracker
    ) external onlyGov {
        require(!isInitialized, "RewardManager: already initialized");
        isInitialized = true;
        timelock = _timelock;
        rewardRouter = _rewardRouter;
        xlpManager = _xlpManager;
        feeXlpTracker = _feeXlpTracker;
    }

    function enableRewardRouter() external onlyGov {
        timelock.managedSetHandler(xlpManager, rewardRouter, true);
        timelock.managedSetHandler(feeXlpTracker, rewardRouter, true);
    }
}
