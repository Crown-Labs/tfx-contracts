// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IXlpManager {
    function cooldownDuration() external returns (uint256);
    function lastAddedAt(address _account) external returns (uint256);
    function addLiquidity(address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external returns (uint256);
    // function addLiquidityForAccount(address _fundingAccount, address _account, address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external returns (uint256);
    function removeLiquidity(address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external returns (uint256);
    // function removeLiquidityForAccount(address _account, address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external returns (uint256);
    function handlerAddLiquidity(address _account, address _receiver, address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external returns (uint256);
    function handlerRemoveLiquidity(address _account, address _receiver, address _tokenOut, uint256 _xlpAmount, uint256 _minOut) external returns (uint256);
}
