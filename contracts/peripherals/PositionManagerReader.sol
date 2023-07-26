// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/math/SafeMath.sol";
import "../libraries/utils/IterableMapping.sol";

interface IVault {
    function usdg() external view returns (address);
    function adjustForDecimals(uint256 _amount, address _tokenDiv, address _tokenMul) external view returns (uint256);
    function tokenDecimals(address _token) external view returns (uint256);
    function minProfitTime() external view returns (uint256);
    function minProfitBasisPoints(address _token) external view returns (uint256);
    function getFundingFee(address _account, address _collateralToken, address _indexToken, bool _isLong, uint256 _size, uint256 _entryFundingRate) external view returns (uint256);
    function getPositionFee(address _account, address _collateralToken, address _indexToken, bool _isLong, uint256 _sizeDelta) external view returns (uint256);
    function liquidationFeeUsd() external view returns (uint256);
    function maxLeverage() external view returns (uint256);
    function vaultPositionController() external view returns (address);
}

interface IVaultPositionController {
    function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, bool, uint256);
}

interface IOrderBookOpenOrder {
    function orderList() external view returns (bytes memory);
    function getOrderListSize() external view returns(uint256);
    function getOrderListIterateStart() external view returns(uint256);
    function getOrderListIterateValid(uint256 _index) external view returns(bool);
    function getOrderListIterateNext(uint256 _index) external view returns(uint256);
    function getOrderListIterateGet(uint256 _index) external view returns(uint256 key, Orders memory value);
}

interface IOrderBook {
    function vault() external view returns (address);
    function vaultPositionController() external view returns (address);
    function orderBookOpenOrder() external view returns (address);

    function getSwapOrder(address _account, uint256 _orderIndex) external view returns (
        address path0, 
        address path1,
        address path2,
        uint256 amountIn,
        uint256 minOut,
        uint256 triggerRatio,
        bool triggerAboveThreshold,
        bool shouldUnwrap,
        uint256 executionFee
    );

    function getIncreaseOrder(address _account, uint256 _orderIndex) external view returns (
        address purchaseToken, 
        uint256 purchaseTokenAmount,
        address collateralToken,
        address indexToken,
        uint256 sizeDelta,
        bool isLong,
        uint256 triggerPrice,
        bool triggerAboveThreshold,
        uint256 executionFee
    );

    function getDecreaseOrder(address _account, uint256 _orderIndex) external view returns (
        address collateralToken,
        uint256 collateralDelta,
        address indexToken,
        uint256 sizeDelta,
        bool isLong,
        uint256 triggerPrice,
        bool triggerAboveThreshold,
        uint256 executionFee
    );
}

contract PositionManagerReader {
    using SafeMath for uint256;
    // Apply library functions to the data type.
    using IterableMapping for itmap;

    uint256 public constant PRICE_PRECISION = 1e30;
    uint256 public constant USDG_PRECISION = 1e18;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    struct LastPrice {
        address token;
        uint256 price;
    }

    struct Position {
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryFundingRate;
        uint256 reserveAmount;
        int256 realisedPnl;
        uint256 lastIncreasedTime;
    }

    function validateLiquidation(address account, address collateralToken, address indexToken, bool isLong, /* bool _raise, */ address vault, LastPrice[] memory lastPrice) external view returns (uint256, uint256) {
        Position memory position = getPosition(account, collateralToken, indexToken, isLong, vault);
        if (position.size == 0) {
            // position is colsed
            return (3, 0);
        }

        (bool hasProfit, uint256 delta, uint256 marginFees) = getPositionDelta(position, account, collateralToken, indexToken, isLong, vault, lastPrice);

        if (!hasProfit && position.collateral < delta) {
            // if (_raise) { revert("Vault: losses exceed collateral"); }
            return (1, marginFees);
        }

        uint256 remainingCollateral = position.collateral;
        if (!hasProfit) {
            remainingCollateral = position.collateral.sub(delta);
        }

        if (remainingCollateral < marginFees) {
            // if (_raise) { revert("Vault: fees exceed collateral"); }
            // cap the fees to the remainingCollateral
            return (1, remainingCollateral);
        }

        if (remainingCollateral < marginFees.add(IVault(vault).liquidationFeeUsd())) {
            // if (_raise) { revert("Vault: liquidation fees exceed collateral"); }
            return (1, marginFees);
        }

        if (remainingCollateral.mul(IVault(vault).maxLeverage()) < position.size.mul(BASIS_POINTS_DIVISOR)) {
            // if (_raise) { revert("Vault: maxLeverage exceeded"); }
            return (2, marginFees);
        }

        return (0, marginFees);
    }

    function getPosition(address account, address collateralToken, address indexToken, bool isLong, address vault) private view returns(Position memory position) {
        address vaultPositionController = IVault(vault).vaultPositionController();
        (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, /* reserveAmount */, /* realisedPnl */, /* hasProfit */, uint256 lastIncreasedTime) = 
        IVaultPositionController(vaultPositionController).getPosition(account, collateralToken, indexToken, isLong);
        position.size = size;
        position.collateral = collateral;
        position.averagePrice = averagePrice;
        position.entryFundingRate = entryFundingRate;
        position.lastIncreasedTime = lastIncreasedTime;
    }

    function getPositionDelta(Position memory position, address account, address collateralToken, address indexToken, bool isLong, address vault, LastPrice[] memory lastPrice) private view returns(bool hasProfit, uint256 delta, uint256 marginFees) {
        uint256 size = position.size;
        uint256 averagePrice = position.averagePrice;
        uint256 lastIncreasedTime = position.lastIncreasedTime;
        uint256 entryFundingRate = position.entryFundingRate;
        
        (hasProfit, delta) = getDelta(indexToken, size, averagePrice, isLong, lastIncreasedTime, /* true, */ vault, lastPrice);
        marginFees = IVault(vault).getFundingFee(account, collateralToken, indexToken, isLong, size, entryFundingRate);
        marginFees = marginFees.add(IVault(vault).getPositionFee(account, collateralToken, indexToken, isLong, size));
    }

    function getDelta(address _indexToken, uint256 _size, uint256 _averagePrice, bool _isLong, uint256 _lastIncreasedTime, /* bool _validatePrice, */ address vault, LastPrice[] memory lastPrice) private view returns (bool, uint256) {
        // _validate(_averagePrice > 0, 38);
        uint256 price = getPrice(lastPrice, _indexToken); // _isLong ? vault.getMinPrice(_indexToken, _validatePrice) : vault.getMaxPrice(_indexToken, _validatePrice);
        uint256 priceDelta = _averagePrice > price ? _averagePrice.sub(price) : price.sub(_averagePrice);
        uint256 delta = _size.mul(priceDelta).div(_averagePrice);

        bool hasProfit;

        if (_isLong) {
            hasProfit = price > _averagePrice;
        } else {
            hasProfit = _averagePrice > price;
        }

        // if the minProfitTime has passed then there will be no min profit threshold
        // the min profit threshold helps to prevent front-running issues
        uint256 minBps = block.timestamp > _lastIncreasedTime.add(IVault(vault).minProfitTime()) ? 0 : IVault(vault).minProfitBasisPoints(_indexToken);
        if (hasProfit && delta.mul(BASIS_POINTS_DIVISOR) <= _size.mul(minBps)) {
            delta = 0;
        }

        return (hasProfit, delta);
    }

    function getShouldExecuteOrderList(bool _returnFirst, address _orderBook, LastPrice[] memory lastPrice) external view returns (bool ,uint160[] memory) {
        // avoid stack to deep
        address orderBook = _orderBook;
        address orderBookOpenOrder = IOrderBook(orderBook).orderBookOpenOrder();
        
        uint256 orderListSize = IOrderBookOpenOrder(orderBookOpenOrder).getOrderListSize();
        uint160[] memory shouldExecuteOrders = new uint160[](orderListSize*3);
        uint256 shouldExecuteIndex = 0;

        if (orderListSize > 0) {
            for (
                uint i = IOrderBookOpenOrder(orderBookOpenOrder).getOrderListIterateStart(); 
                IOrderBookOpenOrder(orderBookOpenOrder).getOrderListIterateValid(i); 
                i = IOrderBookOpenOrder(orderBookOpenOrder).getOrderListIterateNext(i)
            ) {
                (, Orders memory order) = IOrderBookOpenOrder(orderBookOpenOrder).getOrderListIterateGet(i);
                bool shouldExecute = false;

                // 0 = SWAP, 1 = INCREASE, 2 = DECREASE
                if (order.orderType == 0) { // SWAP
                    shouldExecute = validateSwapOrder(order, orderBook, lastPrice);
                } else if (order.orderType == 1) { // INCREASE
                    shouldExecute = validateIncreaseOrder(order, orderBook, lastPrice);
                } else if (order.orderType == 2) { // DECREASE
                    shouldExecute = validateDecreaseOrder(order, orderBook, lastPrice);
                }

                if (shouldExecute) {
                    if(_returnFirst) {
                        return(true, new uint160[](0));
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
            returnList[i] = shouldExecuteOrders[i];
        }
        
        return (shouldExecuteIndex > 0, returnList);
    }

    function validateSwapOrder(Orders memory order, address orderBook, LastPrice[] memory lastPrice) private view returns(bool) {
        address[] memory path;
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
        
        address vault = IOrderBook(orderBook).vault(); // avoid stack too deep
        return !validateSwapOrderPriceWithTriggerAboveThreshold(path, triggerRatio, vault, lastPrice);
    }

    function validateIncreaseOrder(Orders memory order, address orderBook, LastPrice[] memory lastPrice) private view returns(bool shouldExecute) {
        (
            /* address purchaseToken */,
            /* uint256 purchaseTokenAmount */,
            /* address collateralToken */,
            address indexToken,
            /* uint256 sizeDelta */,
            /* bool isLong */,
            uint256 triggerPrice,
            bool triggerAboveThreshold,
            /* uint256 executionFee */
        ) = IOrderBook(orderBook).getIncreaseOrder(order.account, order.orderIndex);

        address vault = IOrderBook(orderBook).vault(); // avoid stack too deep
        (, shouldExecute) = validatePositionOrderPrice(triggerAboveThreshold, triggerPrice, indexToken, /* isLong, false, */ vault, lastPrice);
    }

    function validateDecreaseOrder(Orders memory order, address orderBook, LastPrice[] memory lastPrice) private view returns(bool shouldExecute) {
        (
            address collateralToken,
            /* uint256 collateralDelta */,
            address indexToken,
            /* uint256 sizeDelta */,
            bool isLong,
            uint256 triggerPrice,
            bool triggerAboveThreshold,
            /* uint256 executionFee */
        ) = IOrderBook(orderBook).getDecreaseOrder(order.account, order.orderIndex);
        address vaultPositionController = IOrderBook(orderBook).vaultPositionController();
        (uint256 size, , , , , , , ) = IVaultPositionController(vaultPositionController).getPosition(order.account, collateralToken, indexToken, isLong);
        if (size > 0) {
            address vault = IOrderBook(orderBook).vault(); // avoid stack too deep
            (, shouldExecute) = validatePositionOrderPrice(triggerAboveThreshold, triggerPrice, indexToken, /* isLong, false, */ vault, lastPrice);
            if (shouldExecute) {
                // avoid stack too deep
                shouldExecute = validateDecreaseOrderSize(order, orderBook);
            }
        }  
    }

    function validateDecreaseOrderSize(Orders memory order, address orderBook) private view returns(bool) {
        (
            address collateralToken,
            uint256 collateralDelta,
            address indexToken,
            uint256 sizeDelta,
            bool isLong,
            /* uint256 triggerPrice */,
            /* bool triggerAboveThreshold */,
            /* uint256 executionFee */
        ) = IOrderBook(orderBook).getDecreaseOrder(order.account, order.orderIndex);

        address vaultPositionController = IOrderBook(orderBook).vaultPositionController();
        (uint256 size, uint256 collateral, , , , , , ) = IVaultPositionController(vaultPositionController).getPosition(order.account, collateralToken, indexToken, isLong);

        if (size > 0 && sizeDelta <= size && collateralDelta <= collateral) { 
            // Order cannot be executed as it would reduce the position's leverage below 1
            return (size == sizeDelta) || (size.sub((sizeDelta)) >= collateral.sub(collateralDelta));
        }
        return false;
    }

    function validateSwapOrderPriceWithTriggerAboveThreshold(address[] memory _path, uint256 _triggerRatio, address vault, LastPrice[] memory lastPrice) private view returns (bool) {
        require(_path.length == 2 || _path.length == 3, "OrderBook: invalid _path.length");

        // limit orders don't need this validation because minOut is enough
        // so this validation handles scenarios for stop orders only
        // when a user wants to swap when a price of tokenB increases relative to tokenA
        address tokenA = _path[0];
        address tokenB = _path[_path.length - 1];
        uint256 tokenAPrice;
        uint256 tokenBPrice;

        // 1. USDG doesn't have a price feed so we need to calculate it based on redepmtion amount of a specific token
        // That's why USDG price in USD can vary depending on the redepmtion token
        // 2. In complex scenarios with path=[USDG, BNB, BTC] we need to know how much BNB we'll get for provided USDG
        // to know how much BTC will be received
        // That's why in such scenario BNB should be used to determine price of USDG
        if (tokenA == IVault(vault).usdg()) {
            // with both _path.length == 2 or 3 we need usdg price against _path[1]
            tokenAPrice = getUsdgMinPrice(_path[1], vault, lastPrice);
        } else {
            tokenAPrice = getPrice(lastPrice, tokenA);
        }

        if (tokenB == IVault(vault).usdg()) {
            tokenBPrice = PRICE_PRECISION;
        } else {
            tokenBPrice = getPrice(lastPrice, tokenB);
        }

        uint256 currentRatio = tokenBPrice.mul(PRICE_PRECISION).div(tokenAPrice);

        bool isValid = currentRatio > _triggerRatio;
        return isValid;
    }

    function validatePositionOrderPrice(
        bool _triggerAboveThreshold,
        uint256 _triggerPrice,
        address _indexToken,
        /* bool _maximizePrice, */
        /* bool _raise, */
        address /* vault */, 
        LastPrice[] memory lastPrice
    ) private pure returns (uint256, bool) {
        uint256 currentPrice = getPrice(lastPrice, _indexToken);
        bool isPriceValid = _triggerAboveThreshold ? currentPrice > _triggerPrice : currentPrice < _triggerPrice;
        // if (_raise) {
        //     require(isPriceValid, "OrderBook: invalid price for execution");
        // }
        return (currentPrice, isPriceValid);
    }

    function getUsdgMinPrice(address _otherToken, address vault, LastPrice[] memory lastPrice) private view returns (uint256) {
        uint256 otherTokenPrice = getPrice(lastPrice, _otherToken); 
        uint256 redemptionAmount = getRedemptionAmount(_otherToken, USDG_PRECISION, vault, otherTokenPrice);
        uint256 otherTokenDecimals = IVault(vault).tokenDecimals(_otherToken);
        return redemptionAmount.mul(otherTokenPrice).div(10**otherTokenDecimals);
    }

    function getRedemptionAmount(address _token, uint256 _usdgAmount, address vault, uint256 price) private view returns (uint256) {
        uint256 redemptionAmount = _usdgAmount.mul(PRICE_PRECISION).div(price);
        return IVault(vault).adjustForDecimals(redemptionAmount, IVault(vault).usdg(), _token);
    }

    function getPrice(LastPrice[] memory lastPrice, address token) private pure returns(uint256) {
        for (uint256 i = 0; i < lastPrice.length; i++) {
            if (lastPrice[i].token == token) {
                return lastPrice[i].price;
            }
        }
        return 0;
    }
}