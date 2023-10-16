// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IOrderBookOpenOrder {
    function addToOpenOrders(address _account, uint256 _index, uint8 _type) external;
    function removeFromOpenOrders(address _account, uint256 _index, uint8 _type) external;
    function getShouldExecuteOrderList(bool _returnFirst) external view returns (bool ,uint160[] memory);
}
