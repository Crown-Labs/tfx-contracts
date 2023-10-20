// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";
import "./interfaces/IRewardTracker.sol";
import "../tokens/interfaces/IMintable.sol";
import "../tokens/interfaces/IWETH.sol";
import "../core/interfaces/IXlpManager.sol";
import "../access/Governable.sol";

interface IFulfillController {
    function requestOracle(bytes memory _data, address _account, bytes memory _revertHandler) external;
    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external;
}

contract RewardRouterV3 is ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    bool public isInitialized;
    address public weth;
    address public xlp; // TFX Liquidity Provider token
    address public feeXlpTracker;
    address public xlpManager;
    address public fulfillController;

    mapping (address => address) public pendingReceivers;

    uint256 public minRewardCompound;

    modifier onlyFulfillController() {
        require(msg.sender == fulfillController, "FulfillController: forbidden");
        _;
    }

    event StakeXlp(address account, uint256 amount);
    event UnstakeXlp(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        address _xlp,
        address _feeXlpTracker,
        address _xlpManager,
        uint256 _minRewardCompound
    ) external onlyGov {
        require(!isInitialized, "RewardRouter: already initialized");
        isInitialized = true;
        weth = _weth;
        xlp = _xlp;
        feeXlpTracker = _feeXlpTracker;
        xlpManager = _xlpManager;
        minRewardCompound = _minRewardCompound;
    }

    function setFulfillController(address _fulfillController) external onlyGov {
        require(_fulfillController != address(0), "address invalid");
        fulfillController = _fulfillController;
    }

    function setMinRewardCompound(uint256 _minRewardCompound) external onlyGov {
        minRewardCompound = _minRewardCompound;
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function mintAndStakeXlp(address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external nonReentrant /* returns (uint256) */ {
        require(_amount > 0, "RewardRouter: invalid _amount");
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount); 
        IERC20(_token).approve(fulfillController, _amount);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillMintAndStakeXlp(address,address,uint256,uint256,uint256)", msg.sender, _token, _amount, _minUsdx, _minXlp);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _token, _amount, false, "");
    }

    function mintAndStakeXlpETH(uint256 _minUsdx, uint256 _minXlp) external payable nonReentrant /* returns (uint256) */ {
        require(msg.value > 0, "RewardRouter: invalid msg.value");
        uint256 amount = msg.value;
        IWETH(weth).deposit{value: amount}();
        IERC20(weth).approve(fulfillController, amount);

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillMintAndStakeXlp(address,address,uint256,uint256,uint256)", msg.sender, weth, amount, _minUsdx, _minXlp);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, weth, amount, true, "");
    }

    function unstakeAndRedeemXlp(address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external nonReentrant /* returns (uint256) */ {
        require(_xlpAmount > 0, "RewardRouter: invalid _xlpAmount");

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillUnstakeAndRedeemXlp(address,address,uint256,uint256,address)", msg.sender, _tokenOut, _xlpAmount, _minOut, _receiver);
        IFulfillController(fulfillController).requestOracle(data, msg.sender, "");
    }

    function unstakeAndRedeemXlpETH(uint256 _xlpAmount, uint256 _minOut, address _receiver) external nonReentrant /* returns (uint256) */ {
        require(_xlpAmount > 0, "RewardRouter: invalid _xlpAmount");

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillUnstakeAndRedeemXlpETH(address,uint256,uint256,address)", msg.sender, _xlpAmount, _minOut, _receiver);
        IFulfillController(fulfillController).requestOracle(data, msg.sender, "");
    }

    function fulfillMintAndStakeXlp(address _account, address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external onlyFulfillController returns (uint256) {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount); 
        IERC20(_token).approve(xlpManager, _amount); 

        uint256 xlpAmount = IXlpManager(xlpManager).handlerAddLiquidity(address(this), _account, _token, _amount, _minUsdx, _minXlp);
        IRewardTracker(feeXlpTracker).stakeForAccount(_account, _account, xlp, xlpAmount);

        emit StakeXlp(_account, xlpAmount);

        return xlpAmount;
    }

    function fulfillUnstakeAndRedeemXlp(address _account, address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external onlyFulfillController returns (uint256) {
        IRewardTracker(feeXlpTracker).unstakeForAccount(_account, xlp, _xlpAmount, _account);

        uint256 amountOut = IXlpManager(xlpManager).handlerRemoveLiquidity(_account, _receiver, _tokenOut, _xlpAmount, _minOut);
        
        emit UnstakeXlp(_account, _xlpAmount);

        return amountOut;
    }

    function fulfillUnstakeAndRedeemXlpETH(address _account, uint256 _xlpAmount, uint256 _minOut, address payable _receiver) external onlyFulfillController returns (uint256) {
        IRewardTracker(feeXlpTracker).unstakeForAccount(_account, xlp, _xlpAmount, _account);

        uint256 amountOut = IXlpManager(xlpManager).handlerRemoveLiquidity(_account, address(this), weth, _xlpAmount, _minOut);

        IWETH(weth).withdraw(amountOut);
        _receiver.sendValue(amountOut);

        emit UnstakeXlp(_receiver, _xlpAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;
        IRewardTracker(feeXlpTracker).claimForAccount(account, account);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
    }

    function _compound(address _account) private {
        uint256 rewardAmount = IRewardTracker(feeXlpTracker).claimable(_account);
        require(rewardAmount > minRewardCompound, "RewardRouter: reward to compound too small");

        // request oracle
        bytes memory data = abi.encodeWithSignature("fulfillCompound(address)", _account);
        IFulfillController(fulfillController).requestOracle(data, msg.sender, "");
    }

    function fulfillCompound(address _account) external onlyFulfillController {
        uint256 rewardAmount = IRewardTracker(feeXlpTracker).claimForAccount(_account, address(this));

        if (rewardAmount > 0) {
            IERC20(weth).approve(xlpManager, rewardAmount); 
            uint256 xlpAmount = IXlpManager(xlpManager).handlerAddLiquidity(address(this), _account, weth, rewardAmount, 0, 0);

            IRewardTracker(feeXlpTracker).stakeForAccount(_account, _account, xlp, xlpAmount);

            emit StakeXlp(_account, xlpAmount);
        }
    }

    function handleRewards(bool _shouldConvertWethToEth) external nonReentrant {
        address account = msg.sender;

        if (_shouldConvertWethToEth) {
            uint256 wethAmount = IRewardTracker(feeXlpTracker).claimForAccount(account, address(this));
            IWETH(weth).withdraw(wethAmount);

            payable(account).sendValue(wethAmount);
        } else {
            IRewardTracker(feeXlpTracker).claimForAccount(account, account);
        }
    }

    function signalTransfer(address _receiver) external nonReentrant {
        _validateReceiver(_receiver);
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "RewardRouter: transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        
        uint256 xlpAmount = IRewardTracker(feeXlpTracker).depositBalances(_sender, xlp);
        if (xlpAmount > 0) {
            IRewardTracker(feeXlpTracker).unstakeForAccount(_sender, xlp, xlpAmount, _sender);
            IRewardTracker(feeXlpTracker).stakeForAccount(_sender, receiver, xlp, xlpAmount);
        }
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker(feeXlpTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeXlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeXlpTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeXlpTracker.cumulativeRewards > 0");
    }
}
