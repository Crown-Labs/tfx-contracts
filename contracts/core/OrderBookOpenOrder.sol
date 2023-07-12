// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/utils/IterableMapping.sol";
import "./interfaces/IVaultPositionController.sol";
import "./interfaces/IOrderBook.sol";
import "./interfaces/IOrderBookOpenOrder.sol";
import "../libraries/math/SafeMath.sol";

contract OrderBookOpenOrder is IOrderBookOpenOrder {
    using SafeMath for uint256;
    // Apply library functions to the data type.
    using IterableMapping for itmap;

    address public orderBook;
    address public vaultPositionController;

    itmap public orderList;

    modifier onlyOrderBook() {
        require(msg.sender == orderBook, "OrderBookList: forbidden");
        _;
    }

    constructor(address _orderBook, address _vaultPositionController) public {
        orderBook = _orderBook;
        vaultPositionController = _vaultPositionController;
    }

    function addToOpenOrders(address _account, uint256 _index, uint8 _type) external override onlyOrderBook {
        uint256 orderKey = getOrderKey(_account,  _index,  _type);
        Orders memory order = Orders(
            _account,
            _index,
            _type // 0 = SWAP, 1 = INCREASE, 2 = DECREASE
        );
        orderList.insert(orderKey,order);
    }

    function removeFromOpenOrders(address _account, uint256 _index, uint8 _type) external override onlyOrderBook {
        uint256 orderKey = getOrderKey(_account,  _index,  _type);
        orderList.remove(orderKey);
    }

    function getOrderKey(address _account, uint256 _index, uint8 _type) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_account, _index, _type)));
    }

    function getOrderListSize() public view returns(uint256) {
        return orderList.size;
    }

    function getOrderListIterateStart() public view returns(uint256) {
        return orderList.iterate_start();
    }

    function getOrderListIterateValid(uint256 _index) public view returns(bool) {
        return orderList.iterate_valid(_index);
    }

    function getOrderListIterateNext(uint256 _index) public view returns(uint256) {
        return orderList.iterate_next(_index);
    }

    function getOrderListIterateGet(uint256 _index) public view returns(uint256 key, Orders memory value) {
        return orderList.iterate_get(_index);
    }

    function getShouldExecuteOrderList(bool _returnFirst) external override view returns (bool ,uint160[] memory) {
        uint256 orderListSize = getOrderListSize();
        uint160[] memory shouldExecuteOrders = new uint160[](orderListSize*3);
        uint256 shouldExecuteIndex = 0;

        if (orderListSize > 0){
            for (uint i = getOrderListIterateStart(); getOrderListIterateValid(i); i = getOrderListIterateNext(i)) {
                (, Orders memory order) = getOrderListIterateGet(i);
                bool shouldExecute = false;

                // 0 = SWAP, 1 = INCREASE, 2 = DECREASE
                if (order.orderType == 0) { // SWAP
                    (
                        address path0,
                        address path1,
                        address path2,
                        /* uint256 amountIn */,
                        /* uint256 minOut */,
                        uint256 triggerRatio,
                        /* bool triggerAboveThreshold */,
                        /* bool shouldUnwrap */,
                    ) = IOrderBook(orderBook).getSwapOrder(order.account, order.orderIndex);

                    address[] memory path;
                    if (path1 == address(0)) {
                        path = new address[](1);
                        path[0] = path0;
                    } else if (path2 == address(0)) {
                        path = new address[](2);
                        path[0] = path0;
                        path[1] = path1;
                    } else {
                        path = new address[](3);
                        path[0] = path0;
                        path[1] = path1;
                        path[2] = path2;
                    }
                    shouldExecute = !IOrderBook(orderBook).validateSwapOrderPriceWithTriggerAboveThreshold(path, triggerRatio);
                } else if (order.orderType == 1) { // INCREASE
                    (
                        /* address purchaseToken */,
                        /* uint256 purchaseTokenAmount */,
                        /* address collateralToken */,
                        address indexToken,
                        /* uint256 sizeDelta */,
                        bool isLong,
                        uint256 triggerPrice,
                        bool triggerAboveThreshold,
                        /* uint256 executionFee */
                    ) = IOrderBook(orderBook).getIncreaseOrder(order.account, order.orderIndex);
                    (, shouldExecute) = IOrderBook(orderBook).validatePositionOrderPrice(triggerAboveThreshold, triggerPrice, indexToken, isLong, false);
                } else if (order.orderType == 2) { // DECREASE
                    (
                        address collateralToken,
                        uint256 collateralDelta,
                        address indexToken,
                        uint256 sizeDelta,
                        bool isLong,
                        uint256 triggerPrice,
                        bool triggerAboveThreshold,
                        /* uint256 executionFee */
                    ) = IOrderBook(orderBook).getDecreaseOrder(order.account, order.orderIndex);
                    (uint256 size, uint256 collateral , , , , , , ) = IVaultPositionController(vaultPositionController).getPosition(order.account, collateralToken, indexToken, isLong);
                    if (size > 0 && sizeDelta <= size && collateralDelta <= collateral) { 
                        (, shouldExecute) = IOrderBook(orderBook).validatePositionOrderPrice(triggerAboveThreshold, triggerPrice, indexToken, !isLong, false);
                        if (shouldExecute) {
                            // Order cannot be executed as it would reduce the position's leverage below 1
                            shouldExecute = (size.sub((sizeDelta)) >= collateral.sub(collateralDelta));
                        }
                    }    
                }
                if (shouldExecute) {
                    if(_returnFirst) {
                        return(true,new uint160[](0));
                    }
                    shouldExecuteOrders[shouldExecuteIndex*3] = uint160(order.account);
                    shouldExecuteOrders[shouldExecuteIndex*3+1] = uint160(order.orderIndex);
                    shouldExecuteOrders[shouldExecuteIndex*3+2] = uint160(order.orderType);
                    shouldExecuteIndex++;
                }                
            }
        }

        uint160[] memory returnList = new uint160[](shouldExecuteIndex*3); 

        for (uint256 i = 0; i < shouldExecuteIndex*3; i++) {
            returnList[i]=shouldExecuteOrders[i];
        }
        
        return (shouldExecuteIndex > 0, returnList);
    }
}