// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/Address.sol";

import "../tokens/interfaces/IWETH.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IVaultPositionController.sol";
import "./interfaces/IRouter.sol";

interface IFulfillController {
    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external;
}

contract Router is IRouter {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    address public gov;

    // wrapped BNB / ETH
    address public weth;
    address public usdg;
    address public vault;
    address public vaultPositionController;
    address public fulfillController;

    mapping (address => bool) public plugins;
    mapping (address => mapping (address => bool)) public approvedPlugins;

    event Swap(address account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    modifier onlyGov() {
        require(msg.sender == gov, "Router: forbidden");
        _;
    }

    modifier onlyFulfillController() {
        require(msg.sender == fulfillController, "FulfillController: forbidden");
        _;
    }

    constructor(address _vault, address _vaultPositionController, address _usdg, address _weth) public {
        vault = _vault;
        vaultPositionController = _vaultPositionController;
        usdg = _usdg;
        weth = _weth;

        gov = msg.sender;
    }

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
    }

    function setFulfillController(address _fulfillController) external onlyGov {
        require(_fulfillController != address(0), "address invalid");
        fulfillController = _fulfillController;
    }

    function addPlugin(address _plugin) external override onlyGov {
        plugins[_plugin] = true;
    }

    function removePlugin(address _plugin) external onlyGov {
        plugins[_plugin] = false;
    }

    function approvePlugin(address _plugin) external {
        approvedPlugins[msg.sender][_plugin] = true;
    }

    function denyPlugin(address _plugin) external {
        approvedPlugins[msg.sender][_plugin] = false;
    }

    function pluginTransfer(address _token, address _account, address _receiver, uint256 _amount) external override {
        _validatePlugin(_account);
        IERC20(_token).safeTransferFrom(_account, _receiver, _amount);
    }

    function pluginIncreasePosition(address _account, address _collateralToken, address _indexToken, uint256 _sizeDelta, bool _isLong) external override {
        _validatePlugin(_account);
        IVaultPositionController(vaultPositionController).increasePosition(_account, _collateralToken, _indexToken, _sizeDelta, _isLong);
    }

    function pluginDecreasePosition(address _account, address _collateralToken, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, address _receiver) external override returns (uint256) {
        _validatePlugin(_account);
        return IVaultPositionController(vaultPositionController).decreasePosition(_account, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, _receiver);
    }

    function directPoolDeposit(address _token, uint256 _amount) external {
        IERC20(_token).safeTransferFrom(_sender(), vault, _amount);
        IVault(vault).directPoolDeposit(_token);
    }

    function swap(address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) public override {
        IERC20(_path[0]).safeTransferFrom(_sender(), address(this), _amountIn); 
        IERC20(_path[0]).approve(fulfillController, _amountIn);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillSwap(address,address[],uint256,uint256,address)", msg.sender, _path, _amountIn, _minOut, _receiver);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _path[0], _amountIn, false, "");
    }

    function swapETHToTokens(address[] memory _path, uint256 _minOut, address _receiver) external payable {
        require(_path[0] == weth, "Router: invalid _path");
        uint256 amountIn = msg.value;
        IWETH(weth).deposit{value: amountIn}();
        IERC20(weth).approve(fulfillController, amountIn);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillSwap(address,address[],uint256,uint256,address)", msg.sender, _path, amountIn, _minOut, _receiver);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, weth, amountIn, true, "");
    }

    function swapTokensToETH(address[] memory _path, uint256 _amountIn, uint256 _minOut, address payable _receiver) external {
        require(_path[_path.length - 1] == weth, "Router: invalid _path");
        IERC20(_path[0]).safeTransferFrom(_sender(), address(this), _amountIn); 
        IERC20(_path[0]).approve(fulfillController, _amountIn);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillSwapTokensToETH(address,address[],uint256,uint256,address)", msg.sender, _path, _amountIn, _minOut, _receiver);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _path[0], _amountIn, false, "");
    }

    function fulfillSwap(address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) external onlyFulfillController {
        IERC20(_path[0]).safeTransferFrom(_sender(), vault, _amountIn);
        uint256 amountOut = _swap(_path, _minOut, _receiver);
        emit Swap(_owner, _path[0], _path[_path.length - 1], _amountIn, amountOut);
    }

    function fulfillSwapTokensToETH(address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address payable _receiver) external onlyFulfillController {
        IERC20(_path[0]).safeTransferFrom(_sender(), vault, _amountIn);
        uint256 amountOut = _swap(_path, _minOut, address(this));
        _transferOutETH(amountOut, _receiver);
        emit Swap(_owner, _path[0], _path[_path.length - 1], _amountIn, amountOut);
    }

    function _transferETHToVault() private {
        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).safeTransfer(vault, msg.value);
    }

    function _transferOutETH(uint256 _amountOut, address payable _receiver) private {
        IWETH(weth).withdraw(_amountOut);
        _receiver.sendValue(_amountOut);
    }

    function _swap(address[] memory _path, uint256 _minOut, address _receiver) private returns (uint256) {
        if (_path.length == 2) {
            return _vaultSwap(_path[0], _path[1], _minOut, _receiver);
        }
        if (_path.length == 3) {
            uint256 midOut = _vaultSwap(_path[0], _path[1], 0, address(this));
            IERC20(_path[1]).safeTransfer(vault, midOut);
            return _vaultSwap(_path[1], _path[2], _minOut, _receiver);
        }

        revert("Router: invalid _path.length");
    }

    function _vaultSwap(address _tokenIn, address _tokenOut, uint256 _minOut, address _receiver) private returns (uint256) {
        uint256 amountOut;

        if (_tokenOut == usdg) { // buyUSDG
            amountOut = IVault(vault).buyUSDG(_tokenIn, _receiver);
        } else if (_tokenIn == usdg) { // sellUSDG
            amountOut = IVault(vault).sellUSDG(_tokenOut, _receiver);
        } else { // swap
            amountOut = IVault(vault).swap(_tokenIn, _tokenOut, _receiver);
        }

        require(amountOut >= _minOut, "Router: insufficient amountOut");
        return amountOut;
    }

    function _sender() private view returns (address) {
        return msg.sender;
    }

    function _validatePlugin(address _account) private view {
        require(plugins[msg.sender], "Router: invalid plugin");
        require(approvedPlugins[_account][msg.sender], "Router: plugin not approved");
    }
}
