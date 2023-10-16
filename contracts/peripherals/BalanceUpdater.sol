// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../libraries/token/IERC20.sol";
import "../libraries/math/SafeMath.sol";
import "../core/interfaces/IVault.sol";

contract BalanceUpdater {
    using SafeMath for uint256;

    function updateBalance(
        address _vault,
        address _token,
        address _usdx,
        uint256 _usdxAmount
    ) public {
        IVault vault = IVault(_vault);
        IERC20 token = IERC20(_token);
        uint256 poolAmount = vault.poolAmounts(_token);
        uint256 fee = vault.feeReserves(_token);
        uint256 balance = token.balanceOf(_vault);

        uint256 transferAmount = poolAmount.add(fee).sub(balance);
        token.transferFrom(msg.sender, _vault, transferAmount);
        IERC20(_usdx).transferFrom(msg.sender, _vault, _usdxAmount);

        vault.sellUSDX(_token, msg.sender);
    }
}
