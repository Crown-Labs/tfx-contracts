// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "./interfaces/IUSDX.sol";
import "./YieldToken.sol";

contract USDX is YieldToken, IUSDX {

    mapping (address => bool) public vaults;

    modifier onlyVault() {
        require(vaults[msg.sender], "USDX: forbidden");
        _;
    }

    constructor(address _vault) YieldToken("TFX USD", "USDX", 0) {
        vaults[_vault] = true;
    }

    function addVault(address _vault) external override onlyGov {
        vaults[_vault] = true;
    }

    function removeVault(address _vault) external override onlyGov {
        vaults[_vault] = false;
    }

    function mint(address _account, uint256 _amount) external override onlyVault {
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external override onlyVault {
        _burn(_account, _amount);
    }
}
