// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";
import "./interfaces/IVaultPriceFeed.sol";

interface IPriceFeedStore {
    function getPrice(uint256 _roundId) external view returns (uint256, uint256, uint256, uint256);
    function latestRound() external view returns (uint256);
}

pragma solidity ^0.8.18;

contract VaultPriceFeed is IVaultPriceFeed {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant ONE_USD = PRICE_PRECISION;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant MAX_SPREAD_BASIS_POINTS = 50;

    address public gov;
    uint256 public priceSampleSpaceTime = 30; // sec
    uint256 public maxStrictPriceDeviation = 0;

    mapping (address => address) public priceFeeds;
    mapping (address => uint256) public priceDecimals;
    mapping (address => uint256) public spreadBasisPoints;

    // Oracle can return prices for stablecoins
    // that differs from 1 USD by a larger percentage than stableSwapFeeBasisPoints
    // we use strictStableTokens to cap the price to 1 USD
    // this allows us to configure stablecoins like DAI as being a stableToken
    // while not being a strictStableToken
    mapping (address => bool) public strictStableTokens;

    modifier onlyGov() {
        require(msg.sender == gov, "VaultPriceFeed: forbidden");
        _;
    }

    constructor() {
        gov = msg.sender;
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
    }

    function setSpreadBasisPoints(address _token, uint256 _spreadBasisPoints) external override onlyGov {
        require(_spreadBasisPoints <= MAX_SPREAD_BASIS_POINTS, "VaultPriceFeed: invalid _spreadBasisPoints");
        spreadBasisPoints[_token] = _spreadBasisPoints;
    }

    function setPriceSampleSpaceTime(uint256 _priceSampleSpaceTime) external override onlyGov {
        require(_priceSampleSpaceTime > 0, "VaultPriceFeed: invalid _priceSampleSpaceTime");
        priceSampleSpaceTime = _priceSampleSpaceTime;
    }

    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external override onlyGov {
        maxStrictPriceDeviation = _maxStrictPriceDeviation;
    }

    function setTokenConfig(
        address _token,
        address _priceFeed,
        uint256 _priceDecimals,
        bool _isStrictStable
    ) external override onlyGov {
        priceFeeds[_token] = _priceFeed;
        priceDecimals[_token] = _priceDecimals;
        strictStableTokens[_token] = _isStrictStable;
    }

    function getPrice(address _token, bool _maximise, bool _validate) public override view returns (uint256) {
        uint256 price = getPrimaryPrice(_token, _maximise, _validate);

        if (strictStableTokens[_token]) {
            uint256 delta = price > ONE_USD ? price.sub(ONE_USD) : ONE_USD.sub(price);
            if (delta <= maxStrictPriceDeviation) {
                return ONE_USD;
            }

            // if _maximise and price is e.g. 1.02, return 1.02
            if (_maximise && price > ONE_USD) {
                return price;
            }

            // if !_maximise and price is e.g. 0.98, return 0.98
            if (!_maximise && price < ONE_USD) {
                return price;
            }

            return ONE_USD;
        }

        uint256 _spreadBasisPoints = spreadBasisPoints[_token];

        if (_maximise) {
            return price.mul(BASIS_POINTS_DIVISOR.add(_spreadBasisPoints)).div(BASIS_POINTS_DIVISOR);
        }

        return price.mul(BASIS_POINTS_DIVISOR.sub(_spreadBasisPoints)).div(BASIS_POINTS_DIVISOR);
    }
    
    function getPrimaryPrice(address _token, bool _maximise, bool _validate) public override view returns (uint256) {
        IPriceFeedStore priceFeed = IPriceFeedStore(priceFeeds[_token]);
        uint256 lastRound = priceFeed.latestRound();
        uint256 price;

        // find from last until out of priceSampleSpaceTime
        for (uint256 round = lastRound; ; round--) {
            (, uint256 p, , uint256 timestamp) = priceFeed.getPrice(round);
            if (_validate && (timestamp < block.timestamp - priceSampleSpaceTime)) {
                break;
            }

            if ((price == 0) ||             // init first
                (_maximise && p > price) || // find greater than
                (!_maximise && p < price)   // find less than
            ) {
                price = p;
            }

            // use last price without validate or end of round
            if (!_validate || round == 0) {
                break;
            }
        }

        require(price > 0, "VaultPriceFeed: price expired");

        // normalise price precision
        uint256 _priceDecimals = priceDecimals[_token];
        return price.mul(PRICE_PRECISION).div(10 ** _priceDecimals);
    }
}