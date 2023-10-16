// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../tokens/MintableBaseToken.sol";

contract XLP is MintableBaseToken {
    constructor() MintableBaseToken("TFX LP", "XLP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "XLP";
    }
}
