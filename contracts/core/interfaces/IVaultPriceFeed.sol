// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IVaultPriceFeed {
    function setSpreadBasisPoints(address _token, uint256 _spreadBasisPoints) external;
    function setPriceSampleSpaceTime(uint256 _priceSampleSpaceTime) external;
    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external;
    function getPrice(address _token, bool _maximise, bool _validate) external view returns (uint256);
    function getPrimaryPrice(address _token, bool _maximise, bool _validate) external view returns (uint256);
    function setTokenConfig(address _token, address _priceFeed, uint256 _priceDecimals, bool _isStrictStable) external;
}
