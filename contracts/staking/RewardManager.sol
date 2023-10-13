// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract RewardManager is Governable {

    bool public isInitialized;

    ITimelock public timelock;
    address public rewardRouter;

    address public xlpManager;

    // address public stakedGmxTracker;
    // address public bonusGmxTracker;
    // address public feeGmxTracker;

    address public feeXlpTracker;
    // address public stakedXlpTracker;

    // address public stakedGmxDistributor;
    // address public stakedXlpDistributor;

    // address public esGmx;
    // address public bnGmx;

    // address public gmxVester;
    // address public xlpVester;

    function initialize(
        ITimelock _timelock,
        address _rewardRouter,
        address _xlpManager,
        // address _stakedGmxTracker,
        // address _bonusGmxTracker,
        // address _feeGmxTracker,
        address _feeXlpTracker
        // address _stakedXlpTracker,
        // address _stakedGmxDistributor,
        // address _stakedXlpDistributor,
        // address _esGmx,
        // address _bnGmx,
        // address _gmxVester,
        // address _xlpVester
    ) external onlyGov {
        require(!isInitialized, "RewardManager: already initialized");
        isInitialized = true;

        timelock = _timelock;
        rewardRouter = _rewardRouter;

        xlpManager = _xlpManager;

        // stakedGmxTracker = _stakedGmxTracker;
        // bonusGmxTracker = _bonusGmxTracker;
        // feeGmxTracker = _feeGmxTracker;

        feeXlpTracker = _feeXlpTracker;
        // stakedXlpTracker = _stakedXlpTracker;

        // stakedGmxDistributor = _stakedGmxDistributor;
        // stakedXlpDistributor = _stakedXlpDistributor;

        // esGmx = _esGmx;
        // bnGmx = _bnGmx;

        // gmxVester = _gmxVester;
        // xlpVester = _xlpVester;
    }

    // function updateEsGmxHandlers() external onlyGov {
    //     timelock.managedSetHandler(esGmx, rewardRouter, true);

    //     timelock.managedSetHandler(esGmx, stakedGmxDistributor, true);
    //     timelock.managedSetHandler(esGmx, stakedXlpDistributor, true);

    //     timelock.managedSetHandler(esGmx, stakedGmxTracker, true);
    //     timelock.managedSetHandler(esGmx, stakedXlpTracker, true);

    //     timelock.managedSetHandler(esGmx, gmxVester, true);
    //     timelock.managedSetHandler(esGmx, xlpVester, true);
    // }

    function enableRewardRouter() external onlyGov {
        timelock.managedSetHandler(xlpManager, rewardRouter, true);

        // timelock.managedSetHandler(stakedGmxTracker, rewardRouter, true);
        // timelock.managedSetHandler(bonusGmxTracker, rewardRouter, true);
        // timelock.managedSetHandler(feeGmxTracker, rewardRouter, true);

        timelock.managedSetHandler(feeXlpTracker, rewardRouter, true);
        // timelock.managedSetHandler(stakedXlpTracker, rewardRouter, true);

        // timelock.managedSetHandler(esGmx, rewardRouter, true);

        // timelock.managedSetMinter(bnGmx, rewardRouter, true);

        // timelock.managedSetMinter(esGmx, gmxVester, true);
        // timelock.managedSetMinter(esGmx, xlpVester, true);

        // timelock.managedSetHandler(gmxVester, rewardRouter, true);
        // timelock.managedSetHandler(xlpVester, rewardRouter, true);

        // timelock.managedSetHandler(feeGmxTracker, gmxVester, true);
        // timelock.managedSetHandler(stakedXlpTracker, xlpVester, true);
    }
}
