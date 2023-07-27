// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IVaultPriceFeed {
    function updatePrices() external;
    function getTokenIndexs() external returns(uint256[] memory);
    function mapTokenIndex(uint256 tokenIndex) external view returns(address);
}

// This contract is mockup for testing
// [DO NOT USE ON PRODUCTION]
//
contract FulfillControllerMock_Unused {
    address public vaultPricefeed;
    address public xOracle;

    // simulate PriceFeedStore
    struct PriceData {
        uint256 price;
        uint256 lastUpdate;
        uint256 tokenIndex;
    }
    // instead roundId with tokenIndex
    mapping(uint256 => PriceData) public pricesData;

    // for restore price
    mapping(uint256 => uint256[]) public logPrice;

    constructor(address _vaultPricefeed) {
        vaultPricefeed = _vaultPricefeed;
        xOracle = address(this);
    }

    function setPrice(uint256 tokenIndex, uint256 price, uint256 timestamp) external {
        pricesData[tokenIndex] = PriceData({
            tokenIndex: tokenIndex,
            price: price,
            lastUpdate: timestamp == 0 ? block.timestamp : timestamp
        });

        // log
        if (timestamp == 0) {
            logPrice[tokenIndex].push(price);
        }
    }

    function getLastPrice(uint256 tokenIndex) external view returns (uint256, uint256, uint256) {
        return (
            0, // fixed roundId
            pricesData[tokenIndex].price, 
            pricesData[tokenIndex].lastUpdate
        );
    }

    function restorePrice() external {
        uint256[] memory tokenIndexs = IVaultPriceFeed(vaultPricefeed).getTokenIndexs();
        for (uint256 i = 0; i < tokenIndexs.length; i++) {
            uint256 tokenIndex = tokenIndexs[i];
            address token = IVaultPriceFeed(vaultPricefeed).mapTokenIndex(tokenIndex);
            if (token == address(0)) {
                continue;
            }

            // restore from last 3 prices
            uint256 count = 3;
            uint256[] memory log = logPrice[tokenIndex];
            uint256 index = log.length < 3 ? 0 : log.length - 3;

            while (count != 0 && index < log.length) {
                pricesData[tokenIndex] = PriceData({
                    tokenIndex: tokenIndex,
                    price: log[index],
                    lastUpdate: block.timestamp - (10 * (count - 1))
                });
                IVaultPriceFeed(vaultPricefeed).updatePrices();

                // console.log("tokenIndex: %s, price: %s, lastUpdate: %s", tokenIndex, pricesData[tokenIndex].price, pricesData[tokenIndex].lastUpdate);
                count--;
                index++;
            }
        }
    }
}