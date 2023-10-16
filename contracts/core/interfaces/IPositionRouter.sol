// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IPositionRouter {
    function executeIncreasePositions(uint256 _count, address payable _executionFeeReceiver) external;
    function executeDecreasePositions(uint256 _count, address payable _executionFeeReceiver) external;
}
