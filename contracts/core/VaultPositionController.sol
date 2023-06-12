// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IVaultPositionController.sol";

contract VaultPositionController is ReentrancyGuard, IVaultPositionController {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Position {
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryFundingRate;
        uint256 reserveAmount;
        int256 realisedPnl;
        uint256 lastIncreasedTime;
    }

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant PRICE_PRECISION = 10 ** 30;

    bool public override isInitialized;

    IVault public vault;

    address public override gov;

    // positions tracks all open positions
    mapping (bytes32 => Position) public positions;

    event IncreasePosition(
        bytes32 key,
        address account,
        address collateralToken,
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        uint256 price,
        uint256 fee
    );
    event DecreasePosition(
        bytes32 key,
        address account,
        address collateralToken,
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        uint256 price,
        uint256 fee
    );
    event LiquidatePosition(
        bytes32 key,
        address account,
        address collateralToken,
        address indexToken,
        bool isLong,
        uint256 size,
        uint256 collateral,
        uint256 reserveAmount,
        int256 realisedPnl,
        uint256 markPrice
    );
    event UpdatePosition(
        bytes32 key,
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        int256 realisedPnl,
        uint256 markPrice
    );
    event ClosePosition(
        bytes32 key,
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        int256 realisedPnl
    );

    event UpdatePnl(bytes32 key, bool hasProfit, uint256 delta);

    // once the parameters are verified to be working correctly,
    // gov should be set to a timelock contract or a governance contract
    constructor() public {
        gov = msg.sender;
    }

    function initialize(
        IVault _vault
    ) external {
        // apply error code first
        vault = _vault;
        
        _onlyGov();
        _validate(!isInitialized, 1);
        isInitialized = true;
    }

    function setGov(address _gov) external {
        _onlyGov();
        gov = _gov;
    }

    function increasePosition(address _account, address _collateralToken, address _indexToken, uint256 _sizeDelta, bool _isLong) external override nonReentrant {
        _validate(vault.isLeverageEnabled(), 28);
        _validateGasPrice();
        _validateRouter(_account);
        _validateTokens(_collateralToken, _indexToken, _isLong);

        vault.updateCumulativeFundingRate(_collateralToken, _indexToken);

        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position storage position = positions[key];

        uint256 price = _isLong ? vault.getMaxPrice(_indexToken, true) : vault.getMinPrice(_indexToken, true);

        if (position.size == 0) {
            position.averagePrice = price;
        }

        if (position.size > 0 && _sizeDelta > 0) {
            position.averagePrice = getNextAveragePrice(_indexToken, position.size, position.averagePrice, _isLong, price, _sizeDelta, position.lastIncreasedTime, true);
        }

        uint256 fee = vault.collectMarginFees(_account, _collateralToken, _indexToken, _isLong, _sizeDelta, position.size, position.entryFundingRate);
        uint256 collateralDelta = vault.transferIn(_collateralToken);
        uint256 collateralDeltaUsd = vault.tokenToUsdMin(_collateralToken, collateralDelta);

        position.collateral = position.collateral.add(collateralDeltaUsd);
        _validate(position.collateral >= fee, 29);

        position.collateral = position.collateral.sub(fee);
        position.entryFundingRate = vault.getEntryFundingRate(_collateralToken, _indexToken, _isLong);
        position.size = position.size.add(_sizeDelta);
        position.lastIncreasedTime = block.timestamp;

        _validate(position.size > 0, 30);
        _validatePosition(position.size, position.collateral);
        validateLiquidation(_account, _collateralToken, _indexToken, _isLong, true);

        // reserve tokens to pay profits on the position
        uint256 reserveDelta = vault.usdToTokenMax(_collateralToken, _sizeDelta);
        position.reserveAmount = position.reserveAmount.add(reserveDelta);
        vault.increaseReservedAmount(_collateralToken, reserveDelta);

        if (_isLong) {
            // guaranteedUsd stores the sum of (position.size - position.collateral) for all positions
            // if a fee is charged on the collateral then guaranteedUsd should be increased by that fee amount
            // since (position.size - position.collateral) would have increased by `fee`
            vault.increaseGuaranteedUsd(_collateralToken, _sizeDelta.add(fee));
            vault.decreaseGuaranteedUsd(_collateralToken, collateralDeltaUsd);
            // treat the deposited collateral as part of the pool
            vault.increasePoolAmount(_collateralToken, collateralDelta);
            // fees need to be deducted from the pool since fees are deducted from position.collateral
            // and collateral is treated as part of the pool
            vault.decreasePoolAmount(_collateralToken, vault.usdToTokenMin(_collateralToken, fee));
        } else {
            if (vault.globalShortSizes(_indexToken) == 0) {
                vault.setGlobalShortAveragePrices(_indexToken, price);
            } else {
                vault.setGlobalShortAveragePrices(_indexToken, getNextGlobalShortAveragePrice(_indexToken, price, _sizeDelta));
            }

            vault.increaseGlobalShortSize(_indexToken, _sizeDelta);
        }

        emit IncreasePosition(key, _account, _collateralToken, _indexToken, collateralDeltaUsd, _sizeDelta, _isLong, price, fee);
        emit UpdatePosition(key, position.size, position.collateral, position.averagePrice, position.entryFundingRate, position.reserveAmount, position.realisedPnl, price);
    }

    function decreasePosition(address _account, address _collateralToken, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, address _receiver) external override nonReentrant returns (uint256) {
        _validateGasPrice();
        _validateRouter(_account);
        return _decreasePosition(_account, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, _receiver);
    }

    function _decreasePosition(address _account, address _collateralToken, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, address _receiver) private returns (uint256) {
        vault.updateCumulativeFundingRate(_collateralToken, _indexToken);

        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position storage position = positions[key];
        _validate(position.size > 0, 31);
        _validate(position.size >= _sizeDelta, 32);
        _validate(position.collateral >= _collateralDelta, 33);

        uint256 collateral = position.collateral;
        // scrop variables to avoid stack too deep errors
        {
        uint256 reserveDelta = position.reserveAmount.mul(_sizeDelta).div(position.size);
        position.reserveAmount = position.reserveAmount.sub(reserveDelta);
        vault.decreaseReservedAmount(_collateralToken, reserveDelta);
        }

        (uint256 usdOut, uint256 usdOutAfterFee) = _reduceCollateral(_account, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong);

        uint256 price;
        if (position.size != _sizeDelta) {
            position.entryFundingRate = vault.getEntryFundingRate(_collateralToken, _indexToken, _isLong);
            position.size = position.size.sub(_sizeDelta);

            _validatePosition(position.size, position.collateral);
            validateLiquidation(_account, _collateralToken, _indexToken, _isLong, true);

            if (_isLong) {
                vault.increaseGuaranteedUsd(_collateralToken, collateral.sub(position.collateral));
                vault.decreaseGuaranteedUsd(_collateralToken, _sizeDelta);
            }

            price = _isLong ? vault.getMinPrice(_indexToken, true) : vault.getMaxPrice(_indexToken, true);
            emit DecreasePosition(key, _account, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, price, usdOut.sub(usdOutAfterFee));
            emit UpdatePosition(key, position.size, position.collateral, position.averagePrice, position.entryFundingRate, position.reserveAmount, position.realisedPnl, price);
        } else {
            if (_isLong) {
                vault.increaseGuaranteedUsd(_collateralToken, collateral);
                vault.decreaseGuaranteedUsd(_collateralToken, _sizeDelta);
            }

            price = _isLong ? vault.getMinPrice(_indexToken, true) : vault.getMaxPrice(_indexToken, true);
            emit DecreasePosition(key, _account, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, price, usdOut.sub(usdOutAfterFee));
            emit ClosePosition(key, position.size, position.collateral, position.averagePrice, position.entryFundingRate, position.reserveAmount, position.realisedPnl);

            delete positions[key];
        }

        if (!_isLong) {
            // fix: update globalShortAveragePrices
            vault.setGlobalShortAveragePrices(_indexToken, getNextGlobalShortAveragePrice(_indexToken, price, _sizeDelta));
            vault.decreaseGlobalShortSize(_indexToken, _sizeDelta);
        }

        if (usdOut > 0) {
            if (_isLong) {
                uint256 amountOut = vault.usdToTokenMin(_collateralToken, usdOut);
                vault.decreasePoolAmount(_collateralToken, amountOut);
            }
            uint256 amountOutAfterFees = vault.usdToTokenMin(_collateralToken, usdOutAfterFee);
            vault.transferOut(_collateralToken, amountOutAfterFees, _receiver);
            return amountOutAfterFees;
        }

        return 0;
    }

    function liquidatePosition(address _account, address _collateralToken, address _indexToken, bool _isLong, address _feeReceiver) external override nonReentrant {
        if (vault.inPrivateLiquidationMode()) {
            _validate(vault.isLiquidator(msg.sender), 34);
        }

        // set includeAmmPrice to false to prevent manipulated liquidations
        vault.setIncludeAmmPrice(false);

        vault.updateCumulativeFundingRate(_collateralToken, _indexToken);

        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position memory position = positions[key];
        _validate(position.size > 0, 35);

        (uint256 liquidationState, uint256 marginFees) = validateLiquidation(_account, _collateralToken, _indexToken, _isLong, false);
        _validate(liquidationState != 0, 36);
        if (liquidationState == 2) {
            // max leverage exceeded but there is collateral remaining after deducting losses so decreasePosition instead
            _decreasePosition(_account, _collateralToken, _indexToken, 0, position.size, _isLong, _account);
            vault.setIncludeAmmPrice(true);
            return;
        }

        vault.collectLiquidateMarginFees(_collateralToken, marginFees);

        vault.decreaseReservedAmount(_collateralToken, position.reserveAmount);
        if (_isLong) {
            vault.decreaseGuaranteedUsd(_collateralToken, position.size.sub(position.collateral));
            vault.decreasePoolAmount(_collateralToken, vault.usdToTokenMin(_collateralToken, marginFees));
        }

        uint256 markPrice = _isLong ? vault.getMinPrice(_indexToken, true) : vault.getMaxPrice(_indexToken, true);
        emit LiquidatePosition(key, _account, _collateralToken, _indexToken, _isLong, position.size, position.collateral, position.reserveAmount, position.realisedPnl, markPrice);

        if (!_isLong && marginFees < position.collateral) {
            uint256 remainingCollateral = position.collateral.sub(marginFees);
            vault.increasePoolAmount(_collateralToken, vault.usdToTokenMin(_collateralToken, remainingCollateral));
        }

        if (!_isLong) {
            // fix: update globalShortAveragePrices
            vault.setGlobalShortAveragePrices(_indexToken, getNextGlobalShortAveragePrice(_indexToken, markPrice, position.size));
            vault.decreaseGlobalShortSize(_indexToken, position.size);
        }

        delete positions[key];

        // pay the fee receiver using the pool, we assume that in general the liquidated amount should be sufficient to cover
        // the liquidation fees
        vault.decreasePoolAmount(_collateralToken, vault.usdToTokenMin(_collateralToken, vault.liquidationFeeUsd()));
        vault.transferOut(_collateralToken, vault.usdToTokenMin(_collateralToken, vault.liquidationFeeUsd()), _feeReceiver);

        vault.setIncludeAmmPrice(true);
    }

    function validateLiquidation(address _account, address _collateralToken, address _indexToken, bool _isLong, bool _raise) public view returns (uint256, uint256) {
        Position memory position;
        {
            (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, /* reserveAmount */, /* realisedPnl */, /* hasProfit */, uint256 lastIncreasedTime) = getPosition(_account, _collateralToken, _indexToken, _isLong);
            position.size = size;
            position.collateral = collateral;
            position.averagePrice = averagePrice;
            position.entryFundingRate = entryFundingRate;
            position.lastIncreasedTime = lastIncreasedTime;
        }

        (bool hasProfit, uint256 delta) = getDelta(_indexToken, position.size, position.averagePrice, _isLong, position.lastIncreasedTime, true);
        uint256 marginFees = vault.getFundingFee(_account, _collateralToken, _indexToken, _isLong, position.size, position.entryFundingRate);
        marginFees = marginFees.add(vault.getPositionFee(_account, _collateralToken, _indexToken, _isLong, position.size));

        if (!hasProfit && position.collateral < delta) {
            if (_raise) { revert("Vault: losses exceed collateral"); }
            return (1, marginFees);
        }

        uint256 remainingCollateral = position.collateral;
        if (!hasProfit) {
            remainingCollateral = position.collateral.sub(delta);
        }

        if (remainingCollateral < marginFees) {
            if (_raise) { revert("Vault: fees exceed collateral"); }
            // cap the fees to the remainingCollateral
            return (1, remainingCollateral);
        }

        if (remainingCollateral < marginFees.add(vault.liquidationFeeUsd())) {
            if (_raise) { revert("Vault: liquidation fees exceed collateral"); }
            return (1, marginFees);
        }

        if (remainingCollateral.mul(vault.maxLeverage()) < position.size.mul(BASIS_POINTS_DIVISOR)) {
            if (_raise) { revert("Vault: maxLeverage exceeded"); }
            return (2, marginFees);
        }

        return (0, marginFees);
    }

    function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) public override view returns (uint256, uint256, uint256, uint256, uint256, uint256, bool, uint256) {
        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position memory position = positions[key];
        uint256 realisedPnl = position.realisedPnl > 0 ? uint256(position.realisedPnl) : uint256(-position.realisedPnl);
        return (
            position.size, // 0
            position.collateral, // 1
            position.averagePrice, // 2
            position.entryFundingRate, // 3
            position.reserveAmount, // 4
            realisedPnl, // 5
            position.realisedPnl >= 0, // 6
            position.lastIncreasedTime // 7
        );
    }

    function getPositionKey(address _account, address _collateralToken, address _indexToken, bool _isLong) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            _account,
            _collateralToken,
            _indexToken,
            _isLong
        ));
    }

    function getPositionLeverage(address _account, address _collateralToken, address _indexToken, bool _isLong) public view returns (uint256) {
        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position memory position = positions[key];
        _validate(position.collateral > 0, 37);
        return position.size.mul(BASIS_POINTS_DIVISOR).div(position.collateral);
    }

    // for longs: nextAveragePrice = (nextPrice * nextSize)/ (nextSize + delta)
    // for shorts: nextAveragePrice = (nextPrice * nextSize) / (nextSize - delta)
    function getNextAveragePrice(address _indexToken, uint256 _size, uint256 _averagePrice, bool _isLong, uint256 _nextPrice, uint256 _sizeDelta, uint256 _lastIncreasedTime, bool _validatePrice) public view returns (uint256) {
        (bool hasProfit, uint256 delta) = getDelta(_indexToken, _size, _averagePrice, _isLong, _lastIncreasedTime, _validatePrice);
        uint256 nextSize = _size.add(_sizeDelta);
        uint256 divisor;
        if (_isLong) {
            divisor = hasProfit ? nextSize.add(delta) : nextSize.sub(delta);
        } else {
            divisor = hasProfit ? nextSize.sub(delta) : nextSize.add(delta);
        }
        return _nextPrice.mul(nextSize).div(divisor);
    }

    // for longs: nextAveragePrice = (nextPrice * nextSize)/ (nextSize + delta)
    // for shorts: nextAveragePrice = (nextPrice * nextSize) / (nextSize - delta)
    function getNextGlobalShortAveragePrice(address _indexToken, uint256 _nextPrice, uint256 _sizeDelta) public view returns (uint256) {
        uint256 size = vault.globalShortSizes(_indexToken);
        uint256 averagePrice = vault.globalShortAveragePrices(_indexToken);
        uint256 priceDelta = averagePrice > _nextPrice ? averagePrice.sub(_nextPrice) : _nextPrice.sub(averagePrice);
        uint256 delta = size.mul(priceDelta).div(averagePrice);
        bool hasProfit = averagePrice > _nextPrice;

        uint256 nextSize = size.add(_sizeDelta);
        uint256 divisor = hasProfit ? nextSize.sub(delta) : nextSize.add(delta);

        return _nextPrice.mul(nextSize).div(divisor);
    }

    function getGlobalShortDelta(address _token) external view returns (bool, uint256) {
        uint256 size = vault.globalShortSizes(_token);
        if (size == 0) { return (false, 0); }

        uint256 nextPrice = vault.getMaxPrice(_token, false);
        uint256 averagePrice = vault.globalShortAveragePrices(_token);
        uint256 priceDelta = averagePrice > nextPrice ? averagePrice.sub(nextPrice) : nextPrice.sub(averagePrice);
        uint256 delta = size.mul(priceDelta).div(averagePrice);
        bool hasProfit = averagePrice > nextPrice;

        return (hasProfit, delta);
    }

    function getPositionDelta(address _account, address _collateralToken, address _indexToken, bool _isLong) external view returns (bool, uint256) {
        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position memory position = positions[key];
        return getDelta(_indexToken, position.size, position.averagePrice, _isLong, position.lastIncreasedTime, false);
    }

    function getDelta(address _indexToken, uint256 _size, uint256 _averagePrice, bool _isLong, uint256 _lastIncreasedTime, bool _validatePrice) public override view returns (bool, uint256) {
        _validate(_averagePrice > 0, 38);
        uint256 price = _isLong ? vault.getMinPrice(_indexToken, _validatePrice) : vault.getMaxPrice(_indexToken, _validatePrice);
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
        uint256 minBps = block.timestamp > _lastIncreasedTime.add(vault.minProfitTime()) ? 0 : vault.minProfitBasisPoints(_indexToken);
        if (hasProfit && delta.mul(BASIS_POINTS_DIVISOR) <= _size.mul(minBps)) {
            delta = 0;
        }

        return (hasProfit, delta);
    }

    function _reduceCollateral(address _account, address _collateralToken, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong) private returns (uint256, uint256) {
        bytes32 key = getPositionKey(_account, _collateralToken, _indexToken, _isLong);
        Position storage position = positions[key];

        uint256 fee = vault.collectMarginFees(_account, _collateralToken, _indexToken, _isLong, _sizeDelta, position.size, position.entryFundingRate);
        bool hasProfit;
        uint256 adjustedDelta;

        // scope variables to avoid stack too deep errors
        {
        (bool _hasProfit, uint256 delta) = getDelta(_indexToken, position.size, position.averagePrice, _isLong, position.lastIncreasedTime, true);
        hasProfit = _hasProfit;
        // get the proportional change in pnl
        adjustedDelta = _sizeDelta.mul(delta).div(position.size);
        }

        uint256 usdOut;
        // transfer profits out
        if (hasProfit && adjustedDelta > 0) {
            usdOut = adjustedDelta;
            position.realisedPnl = position.realisedPnl + int256(adjustedDelta);

            // pay out realised profits from the pool amount for short positions
            if (!_isLong) {
                uint256 tokenAmount = vault.usdToTokenMin(_collateralToken, adjustedDelta);
                vault.decreasePoolAmount(_collateralToken, tokenAmount);
            }
        }

        if (!hasProfit && adjustedDelta > 0) {
            position.collateral = position.collateral.sub(adjustedDelta);

            // transfer realised losses to the pool for short positions
            // realised losses for long positions are not transferred here as
            // _increasePoolAmount was already called in increasePosition for longs
            if (!_isLong) {
                uint256 tokenAmount = vault.usdToTokenMin(_collateralToken, adjustedDelta);
                vault.increasePoolAmount(_collateralToken, tokenAmount);
            }

            position.realisedPnl = position.realisedPnl - int256(adjustedDelta);
        }

        // reduce the position's collateral by _collateralDelta
        // transfer _collateralDelta out
        if (_collateralDelta > 0) {
            usdOut = usdOut.add(_collateralDelta);
            position.collateral = position.collateral.sub(_collateralDelta);
        }

        // if the position will be closed, then transfer the remaining collateral out
        if (position.size == _sizeDelta) {
            usdOut = usdOut.add(position.collateral);
            position.collateral = 0;
        }

        // if the usdOut is more than the fee then deduct the fee from the usdOut directly
        // else deduct the fee from the position's collateral
        // with re-write to avoid stack too deep
        emit UpdatePnl(key, hasProfit, adjustedDelta);
        if (usdOut > fee) {
            return (usdOut, usdOut.sub(fee));
        } else {
            position.collateral = position.collateral.sub(fee);
            if (_isLong) {
                uint256 feeTokens = vault.usdToTokenMin(_collateralToken, fee);
                vault.decreasePoolAmount(_collateralToken, feeTokens);
            }
            return (usdOut, usdOut);
        }
    }

    function _validatePosition(uint256 _size, uint256 _collateral) private view {
        if (_size == 0) {
            _validate(_collateral == 0, 39);
            return;
        }
        _validate(_size >= _collateral, 40);
    }

    function _validateRouter(address _account) private view {
        if (msg.sender == _account) { return; }
        if (msg.sender == vault.router()) { return; }
        _validate(vault.approvedRouters(_account, msg.sender), 41);
    }

    function _validateTokens(address _collateralToken, address _indexToken, bool _isLong) private view {
        if (_isLong) {
            _validate(_collateralToken == _indexToken, 42);
            _validate(vault.whitelistedTokens(_collateralToken), 43);
            _validate(!vault.stableTokens(_collateralToken), 44);
            return;
        }

        _validate(vault.whitelistedTokens(_collateralToken), 45);
        _validate(vault.stableTokens(_collateralToken), 46);
        _validate(!vault.stableTokens(_indexToken), 47);
        _validate(vault.shortableTokens(_indexToken), 48);
    }

    // we have this validation as a function instead of a modifier to reduce contract size
    function _onlyGov() private view {
        _validate(msg.sender == gov, 53);
    }

    // we have this validation as a function instead of a modifier to reduce contract size
    function _validateGasPrice() private view {
        if (vault.maxGasPrice() == 0) { return; }
        _validate(tx.gasprice <= vault.maxGasPrice(), 55);
    }

    function _validate(bool _condition, uint256 _errorCode) private view {
        require(_condition, vault.errors(_errorCode));
    }
}