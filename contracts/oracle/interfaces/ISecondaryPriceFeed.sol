// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface ISecondaryPriceFeed {
    function getPrice(address _token, uint256 _referencePrice, bool _maximise) external view returns (uint256);
}
