// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFulfillController {
    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external;
}

interface IXOracle {
    function getLastPrice(uint256 _tokenIndex) external view returns (uint256, uint256, uint256);
}

// This contract is mockup for testing
// [DO NOT USE ON PRODUCTION]
//
contract TestSwapMock {
    uint256 public PRICE_RECISION = 1*10**18;
    address public fulfillController;
    address public xOracle;

    mapping (address => bool) public tokens;
    mapping (address => uint256) public mapTokenIndex;

    constructor(address _fulfillController, address _xOracle) {
        fulfillController = _fulfillController;
        xOracle = _xOracle;
    }

    function setToken(address _token, uint256 _tokenIndex, bool _allow) external {
        tokens[_token] = _allow;
        mapTokenIndex[_token] = _tokenIndex;
    }

    function swap(address[] memory _path, uint256 _amountIn, uint256 _minAmountOut) external {
        require(_path.length == 2, "path invalid");
        require(tokens[_path[0]] && tokens[_path[1]], "token not allow");

        IERC20(_path[0]).transferFrom(msg.sender, fulfillController, _amountIn);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillSwap(address,address[],uint256,uint256)", msg.sender, _path, _amountIn, _minAmountOut);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _path[0], _amountIn, false, "");
    }

    function fulfillSwap(address _owner, address[] memory _path, uint256 _amountIn, uint256 _minAmountOut) external {
        uint256 _tokenIndex0 = mapTokenIndex[_path[0]];
        uint256 _tokenIndex1 = mapTokenIndex[_path[1]];

        // function getLastPrice(uint256 _tokenIndex) external view returns (uint256, uint256, uint256)
        (, uint256 price1,) = IXOracle(xOracle).getLastPrice(_tokenIndex0);
        (, uint256 price2,) = IXOracle(xOracle).getLastPrice(_tokenIndex1);

        uint256 _amountOut = price1 * PRICE_RECISION / price2;
        require(_amountOut >= _minAmountOut, "price slippage");

        IERC20(_path[0]).transferFrom(msg.sender, address(this), _amountIn);
        IERC20(_path[1]).transfer(_owner, _amountOut);
    }
}