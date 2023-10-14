// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IVaultPriceFeed {
    // function adjustmentBasisPoints(address _token) external view returns (uint256);
    // function isAdjustmentAdditive(address _token) external view returns (bool);
    // function setAdjustment(address _token, bool _isAdditive, uint256 _adjustmentBps) external;
    // function setUseV2Pricing(bool _useV2Pricing) external;
    // function setIsAmmEnabled(bool _isEnabled) external;
    // function setIsSecondaryPriceEnabled(bool _isEnabled) external;
    function setSpreadBasisPoints(address _token, uint256 _spreadBasisPoints) external;
    // function setSpreadThresholdBasisPoints(uint256 _spreadThresholdBasisPoints) external;
    // function setFavorPrimaryPrice(bool _favorPrimaryPrice) external;
    function setPriceSampleSpaceTime(uint256 _priceSampleSpaceTime) external;
    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external;
    function getPrice(address _token, bool _maximise, bool _validate) external view returns (uint256);
    // function getAmmPrice(address _token) external view returns (uint256);
    function getPrimaryPrice(address _token, bool _maximise, bool _validate) external view returns (uint256);
    function setTokenConfig(
        address _token,
        address _priceFeed,
        uint256 _priceDecimals,
        bool _isStrictStable
    ) external;

    // function setFulfillController(address _fulfillController) external;
    // function setXOracle(address _xOracle) external;
    // function addTokenIndex(uint256 _tokenIndex) external;
    // function removeTokenIndex(uint256 _tokenIndex) external;
}
