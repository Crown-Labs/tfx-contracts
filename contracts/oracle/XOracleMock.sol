// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceFeedStore {
    function tokenIndex() external view returns (uint256);
    function decimals() external view returns (uint256);
    function getLastPrice() external view returns (uint256, uint256, uint256, uint256);
    function getPrice(uint256 _roundId) external view returns (uint256, uint256, uint256, uint256);
    function latestRound() external view returns (uint256);
    function setPrice(uint256 _price, uint256 _timestamp) external;
}

interface IXOracle {
    function xOracleCall(uint256 reqId, bool priceUpdate, bytes memory payload) external;
}

// This contract is mockup for testing
// [DO NOT USE ON PRODUCTION]
//
contract XOracleMock {
    // request store
    struct Request {
        address owner;
        bytes payload;
        uint256 expiration;
    }
    mapping(uint256 => Request) public requests;
    uint256 public reqId;

    // request fee
    IERC20 public weth; // payment with WETH
    uint256 public fulfillFee;
    uint256 public minFeeBalance;

    struct Data {
        uint256 price;
        uint256 lastUpdate;
        uint256 tokenIndex;
    }

    mapping(uint256 => address) public priceFeedStores;

    constructor(address _weth) {
        require(_weth != address(0), "address invalid");
        weth = IERC20(_weth);
    }

    function requestPrices(bytes memory _payload, uint256 _expiration) external returns (uint256) {
        // check request fee balance
        require(paymentAvailable(msg.sender), "insufficient request fee");
        
        reqId++;

        // add request
        requests[reqId] = Request({
            owner: msg.sender,
            payload: _payload,
            expiration: _expiration 
        });

        return reqId;
    }

    function fulfillRequest(Data[] memory _data, uint256 _reqId) external {
        if (_reqId == 0) {
            // default last reqId
            _reqId = reqId;
        }

        // set prices
        for (uint256 i = 0; i < _data.length; i++) {
            uint256 _tokenIndex = _data[i].tokenIndex;
            uint256 _price = _data[i].price;
            uint256 _timestamp = _data[i].lastUpdate == 0 ? block.timestamp : _data[i].lastUpdate;

            IPriceFeedStore(priceFeedStores[_tokenIndex]).setPrice(_price, _timestamp);
        }

        // callback
        Request storage request = requests[_reqId];
        IXOracle(request.owner).xOracleCall(_reqId, true, request.payload);
    }

    function setPriceFeedStore(address _priceFeedStore, uint256 _tokenIndex) external {
        priceFeedStores[_tokenIndex] = _priceFeedStore;
    }

    function refreshLastPrice(uint256[] memory _tokenIndexes, uint256 _spaceTime, uint256 _count) external {
        // refresh all last price with to current timestamp
        for (uint256 i = 0; i < _tokenIndexes.length; i++) {
            IPriceFeedStore priceFeed = IPriceFeedStore(priceFeedStores[_tokenIndexes[i]]);
            uint256 roundId = priceFeed.latestRound();
            if (roundId == 0) {
                continue;
            }

            (uint256 backword, uint256 total) = (roundId > _count) ? (_count, _count) : (roundId, roundId);
            for (uint256 j = 0; j < total; j++) {
                (, uint256 price, , uint256 timestamp) = priceFeed.getPrice(priceFeed.latestRound() + 1 - backword);
                uint256 adjust = ((total - j - 1) * _spaceTime);
                uint256 newTimestamp = block.timestamp - adjust;
                if (newTimestamp < timestamp) {
                    newTimestamp = timestamp;
                }
                
                // copy to last round
                priceFeed.setPrice(price, newTimestamp);
            }
        }
    } 

    function setFulfillFee(uint256 _fulfillFee) external {
        fulfillFee = _fulfillFee;
    }

    function setMinFeeBalance(uint256 _minFeeBalance) external {
        minFeeBalance = _minFeeBalance;
    }

    // ------------------------------
    // view function
    // ------------------------------
    function getLastPrice(uint256 _tokenIndex) external view returns (uint256, uint256, uint256, uint256) {
        return IPriceFeedStore(priceFeedStores[_tokenIndex]).getLastPrice();
    }

    function getPrice(uint256 _tokenIndex, uint256 _roundId) external view returns (uint256, uint256, uint256, uint256) {
        return IPriceFeedStore(priceFeedStores[_tokenIndex]).getPrice(_roundId);
    }

    function latestRound(uint256 _tokenIndex) external view returns (uint256) {
        return IPriceFeedStore(priceFeedStores[_tokenIndex]).latestRound();
    }

    function getDecimals(uint256 _tokenIndex) external view returns (uint256) {
        return IPriceFeedStore(priceFeedStores[_tokenIndex]).decimals();
    }

    function getPriceFeed(uint256 _tokenIndex) external view returns (address) {
        return priceFeedStores[_tokenIndex];
    }

    function paymentAvailable(address _owner) private view returns (bool) {
        return ( 
            weth.allowance(_owner, address(this)) > minFeeBalance && 
            weth.balanceOf(_owner) > minFeeBalance
        );
    }
}