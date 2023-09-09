// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

// This contract is mockup for testing
// [DO NOT USE ON PRODUCTION]
//
contract PriceFeedStoreMock is Ownable {
    address public xOracle;
    string public name;
    uint256 public tokenIndex;
    uint256 public decimals;

    // price store
    struct PriceData {
        uint256 price;
        uint256 latestPrice;
        uint256 timestamp;
    }
    mapping(uint256 => PriceData) public pricesData;
    uint256 public latestRound;
    uint256 public latestTimestamp;

    modifier onlyXOracle() {
        require(xOracle == msg.sender, "xOracle: forbidden");
        _;
    }

    constructor(address _xOracle, string memory _name, uint256 _tokenIndex, uint256 _decimals) {
        require(_xOracle != address(0), "address invalid");
        xOracle = _xOracle;
        name = _name;
        tokenIndex = _tokenIndex;
        decimals = _decimals;
    }

    // ------------------------------
    // xOracle setPrice
    // ------------------------------
    function setPrice(uint256 _price, uint256 _timestamp) external onlyXOracle { 
        latestRound++;
        pricesData[latestRound] = PriceData({
            price: _price,
            latestPrice: _price,
            timestamp: _timestamp
        });
    }

    // ------------------------------
    // view function
    // ------------------------------
    function getLastPrice() external view returns (uint256, uint256, uint256, uint256) {
        PriceData memory priceData = pricesData[latestRound];
        return (
            latestRound, 
            priceData.price, 
            priceData.latestPrice, 
            priceData.timestamp
        );
    }

    function getPrice(uint256 _roundId) external view returns (uint256, uint256, uint256, uint256) {
        PriceData memory priceData = pricesData[_roundId];
        return (
            _roundId, 
            priceData.price, 
            priceData.latestPrice, 
            priceData.timestamp
        );
    }
}