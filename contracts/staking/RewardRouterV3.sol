// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IVester.sol";
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

    // address public gmx;
    // address public esGmx;
    // address public bnGmx;

    address public xlp; // GMX Liquidity Provider token

    // address public stakedGmxTracker;
    // address public bonusGmxTracker;
    // address public feeGmxTracker;

    // address public stakedXlpTracker;
    address public feeXlpTracker;

    address public xlpManager;

    // address public gmxVester;
    // address public xlpVester;

    address public fulfillController;

    mapping (address => address) public pendingReceivers;

    uint256 public minRewardCompound;

    modifier onlyFulfillController() {
        require(msg.sender == fulfillController, "FulfillController: forbidden");
        _;
    }

    // event StakeGmx(address account, address token, uint256 amount);
    // event UnstakeGmx(address account, address token, uint256 amount);

    event StakeXlp(address account, uint256 amount);
    event UnstakeXlp(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        // address _gmx,
        // address _esGmx,
        // address _bnGmx,
        address _xlp,
        // address _stakedGmxTracker,
        // address _bonusGmxTracker,
        // address _feeGmxTracker,
        address _feeXlpTracker,
        // address _stakedXlpTracker,
        address _xlpManager,
        // address _gmxVester,
        // address _xlpVester
        uint256 _minRewardCompound
    ) external onlyGov {
        require(!isInitialized, "RewardRouter: already initialized");
        isInitialized = true;

        weth = _weth;

        // gmx = _gmx;
        // esGmx = _esGmx;
        // bnGmx = _bnGmx;

        xlp = _xlp;

        // stakedGmxTracker = _stakedGmxTracker;
        // bonusGmxTracker = _bonusGmxTracker;
        // feeGmxTracker = _feeGmxTracker;

        feeXlpTracker = _feeXlpTracker;
        // stakedXlpTracker = _stakedXlpTracker;

        xlpManager = _xlpManager;

        // gmxVester = _gmxVester;
        // xlpVester = _xlpVester;
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

    // function batchStakeGmxForAccount(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
    //     address _gmx = gmx;
    //     for (uint256 i = 0; i < _accounts.length; i++) {
    //         _stakeGmx(msg.sender, _accounts[i], _gmx, _amounts[i]);
    //     }
    // }

    // function stakeGmxForAccount(address _account, uint256 _amount) external nonReentrant onlyGov {
    //     _stakeGmx(msg.sender, _account, gmx, _amount);
    // }

    // function stakeGmx(uint256 _amount) external nonReentrant {
    //     _stakeGmx(msg.sender, msg.sender, gmx, _amount);
    // }

    // function stakeEsGmx(uint256 _amount) external nonReentrant {
    //     _stakeGmx(msg.sender, msg.sender, esGmx, _amount);
    // }

    // function unstakeGmx(uint256 _amount) external nonReentrant {
    //     _unstakeGmx(msg.sender, gmx, _amount, true);
    // }

    // function unstakeEsGmx(uint256 _amount) external nonReentrant {
    //     _unstakeGmx(msg.sender, esGmx, _amount, true);
    // }

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
        // IRewardTracker(stakedXlpTracker).stakeForAccount(_account, _account, feeXlpTracker, xlpAmount);

        emit StakeXlp(_account, xlpAmount);

        return xlpAmount;
    }

    function fulfillUnstakeAndRedeemXlp(address _account, address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external onlyFulfillController returns (uint256) {
        // IRewardTracker(stakedXlpTracker).unstakeForAccount(_account, feeXlpTracker, _xlpAmount, _account);
        IRewardTracker(feeXlpTracker).unstakeForAccount(_account, xlp, _xlpAmount, _account);

        uint256 amountOut = IXlpManager(xlpManager).handlerRemoveLiquidity(_account, _receiver, _tokenOut, _xlpAmount, _minOut);
        
        emit UnstakeXlp(_account, _xlpAmount);

        return amountOut;
    }

    function fulfillUnstakeAndRedeemXlpETH(address _account, uint256 _xlpAmount, uint256 _minOut, address payable _receiver) external onlyFulfillController returns (uint256) {
        // IRewardTracker(stakedXlpTracker).unstakeForAccount(_account, feeXlpTracker, _xlpAmount, _account);
        IRewardTracker(feeXlpTracker).unstakeForAccount(_account, xlp, _xlpAmount, _account);

        uint256 amountOut = IXlpManager(xlpManager).handlerRemoveLiquidity(_account, address(this), weth, _xlpAmount, _minOut);

        IWETH(weth).withdraw(amountOut);
        _receiver.sendValue(amountOut);

        emit UnstakeXlp(_receiver, _xlpAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;

        // IRewardTracker(feeGmxTracker).claimForAccount(account, account);
        IRewardTracker(feeXlpTracker).claimForAccount(account, account);

        // IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
        // IRewardTracker(stakedXlpTracker).claimForAccount(account, account);
    }

    // function claimEsGmx() external nonReentrant {
    //     address account = msg.sender;

    //     IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
    //     IRewardTracker(stakedXlpTracker).claimForAccount(account, account);
    // }

    // function claimFees() external nonReentrant {
    //     address account = msg.sender;

    //     IRewardTracker(feeGmxTracker).claimForAccount(account, account);
    //     IRewardTracker(feeXlpTracker).claimForAccount(account, account);
    // }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
    }

    function _compound(address _account) private {
        uint256 rewardAmount = IRewardTracker(feeXlpTracker).claimable(_account);
        require(rewardAmount > 0, "RewardRouter: reward to compound too small");

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
            // IRewardTracker(stakedXlpTracker).stakeForAccount(_account, _account, feeXlpTracker, xlpAmount);

            emit StakeXlp(_account, xlpAmount);
        }
    }

    function handleRewards(
        // bool _shouldClaimGmx,
        // bool _shouldStakeGmx,
        // bool _shouldClaimEsGmx,
        // bool _shouldStakeEsGmx,
        // bool _shouldStakeMultiplierPoints,
        // bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        // uint256 gmxAmount = 0;
        // if (_shouldClaimGmx) {
        //     uint256 gmxAmount0 = IVester(gmxVester).claimForAccount(account, account);
        //     uint256 gmxAmount1 = IVester(xlpVester).claimForAccount(account, account);
        //     gmxAmount = gmxAmount0.add(gmxAmount1);
        // }

        // if (_shouldStakeGmx && gmxAmount > 0) {
        //     _stakeGmx(account, account, gmx, gmxAmount);
        // }

        // uint256 esGmxAmount = 0;
        // if (_shouldClaimEsGmx) {
        //     uint256 esGmxAmount0 = IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
        //     uint256 esGmxAmount1 = IRewardTracker(stakedXlpTracker).claimForAccount(account, account);
        //     esGmxAmount = esGmxAmount0.add(esGmxAmount1);
        // }

        // if (_shouldStakeEsGmx && esGmxAmount > 0) {
        //     _stakeGmx(account, account, esGmx, esGmxAmount);
        // }

        // if (_shouldStakeMultiplierPoints) {
        //     uint256 bnGmxAmount = IRewardTracker(bonusGmxTracker).claimForAccount(account, account);
        //     if (bnGmxAmount > 0) {
        //         IRewardTracker(feeGmxTracker).stakeForAccount(account, account, bnGmx, bnGmxAmount);
        //     }
        // }

        // if (_shouldClaimWeth) {
        //     if (_shouldConvertWethToEth) {
        //         uint256 weth0 = IRewardTracker(feeGmxTracker).claimForAccount(account, address(this));
        //         uint256 weth1 = IRewardTracker(feeXlpTracker).claimForAccount(account, address(this));

        //         uint256 wethAmount = weth0.add(weth1);
        //         IWETH(weth).withdraw(wethAmount);

        //         payable(account).sendValue(wethAmount);
        //     } else {
        //         IRewardTracker(feeGmxTracker).claimForAccount(account, account);
        //         IRewardTracker(feeXlpTracker).claimForAccount(account, account);
        //     }
        // }

        if (_shouldConvertWethToEth) {
            uint256 wethAmount = IRewardTracker(feeXlpTracker).claimForAccount(account, address(this));
            IWETH(weth).withdraw(wethAmount);

            payable(account).sendValue(wethAmount);
        } else {
            IRewardTracker(feeXlpTracker).claimForAccount(account, account);
        }
    }

    // function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
    //     for (uint256 i = 0; i < _accounts.length; i++) {
    //         _compound(_accounts[i]);
    //     }
    // }

    function signalTransfer(address _receiver) external nonReentrant {
        // require(IERC20(gmxVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");
        // require(IERC20(xlpVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");

        _validateReceiver(_receiver);
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        // require(IERC20(gmxVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");
        // require(IERC20(xlpVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");

        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "RewardRouter: transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        // _compound(_sender);

        // uint256 stakedGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, gmx);
        // if (stakedGmx > 0) {
        //     _unstakeGmx(_sender, gmx, stakedGmx, false);
        //     _stakeGmx(_sender, receiver, gmx, stakedGmx);
        // }

        // uint256 stakedEsGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, esGmx);
        // if (stakedEsGmx > 0) {
        //     _unstakeGmx(_sender, esGmx, stakedEsGmx, false);
        //     _stakeGmx(_sender, receiver, esGmx, stakedEsGmx);
        // }

        // uint256 stakedBnGmx = IRewardTracker(feeGmxTracker).depositBalances(_sender, bnGmx);
        // if (stakedBnGmx > 0) {
        //     IRewardTracker(feeGmxTracker).unstakeForAccount(_sender, bnGmx, stakedBnGmx, _sender);
        //     IRewardTracker(feeGmxTracker).stakeForAccount(_sender, receiver, bnGmx, stakedBnGmx);
        // }

        // uint256 esGmxBalance = IERC20(esGmx).balanceOf(_sender);
        // if (esGmxBalance > 0) {
        //     IERC20(esGmx).transferFrom(_sender, receiver, esGmxBalance);
        // }

        uint256 xlpAmount = IRewardTracker(feeXlpTracker).depositBalances(_sender, xlp);
        if (xlpAmount > 0) {
            // IRewardTracker(stakedXlpTracker).unstakeForAccount(_sender, feeXlpTracker, xlpAmount, _sender);
            IRewardTracker(feeXlpTracker).unstakeForAccount(_sender, xlp, xlpAmount, _sender);

            IRewardTracker(feeXlpTracker).stakeForAccount(_sender, receiver, xlp, xlpAmount);
            // IRewardTracker(stakedXlpTracker).stakeForAccount(receiver, receiver, feeXlpTracker, xlpAmount);
        }

        // IVester(gmxVester).transferStakeValues(_sender, receiver);
        // IVester(xlpVester).transferStakeValues(_sender, receiver);
    }

    function _validateReceiver(address _receiver) private view {
        // require(IRewardTracker(stakedGmxTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedGmxTracker.averageStakedAmounts > 0");
        // require(IRewardTracker(stakedGmxTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedGmxTracker.cumulativeRewards > 0");

        // require(IRewardTracker(bonusGmxTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: bonusGmxTracker.averageStakedAmounts > 0");
        // require(IRewardTracker(bonusGmxTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: bonusGmxTracker.cumulativeRewards > 0");

        // require(IRewardTracker(feeGmxTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeGmxTracker.averageStakedAmounts > 0");
        // require(IRewardTracker(feeGmxTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeGmxTracker.cumulativeRewards > 0");

        // require(IVester(gmxVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: gmxVester.transferredAverageStakedAmounts > 0");
        // require(IVester(gmxVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: gmxVester.transferredCumulativeRewards > 0");

        // require(IRewardTracker(stakedXlpTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedXlpTracker.averageStakedAmounts > 0");
        // require(IRewardTracker(stakedXlpTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedXlpTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeXlpTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeXlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeXlpTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeXlpTracker.cumulativeRewards > 0");

        // require(IVester(xlpVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: gmxVester.transferredAverageStakedAmounts > 0");
        // require(IVester(xlpVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: gmxVester.transferredCumulativeRewards > 0");

        // require(IERC20(gmxVester).balanceOf(_receiver) == 0, "RewardRouter: gmxVester.balance > 0");
        // require(IERC20(xlpVester).balanceOf(_receiver) == 0, "RewardRouter: xlpVester.balance > 0");
    }

    // function _compound(address _account) private {
    //     // _compoundGmx(_account);
    //     _compoundXlp(_account);
    // }

    // function _compoundGmx(address _account) private {
    //     uint256 esGmxAmount = IRewardTracker(stakedGmxTracker).claimForAccount(_account, _account);
    //     if (esGmxAmount > 0) {
    //         _stakeGmx(_account, _account, esGmx, esGmxAmount);
    //     }

    //     uint256 bnGmxAmount = IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);
    //     if (bnGmxAmount > 0) {
    //         IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, bnGmx, bnGmxAmount);
    //     }
    // }

    // function _compoundXlp(address _account) private {
    //     uint256 esGmxAmount = IRewardTracker(stakedXlpTracker).claimForAccount(_account, _account);
    //     if (esGmxAmount > 0) {
    //         _stakeGmx(_account, _account, esGmx, esGmxAmount);
    //     }
    // }

    // function _stakeGmx(address _fundingAccount, address _account, address _token, uint256 _amount) private {
    //     require(_amount > 0, "RewardRouter: invalid _amount");

    //     IRewardTracker(stakedGmxTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
    //     IRewardTracker(bonusGmxTracker).stakeForAccount(_account, _account, stakedGmxTracker, _amount);
    //     IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, bonusGmxTracker, _amount);

    //     emit StakeGmx(_account, _token, _amount);
    // }

    // function _unstakeGmx(address _account, address _token, uint256 _amount, bool _shouldReduceBnGmx) private {
    //     require(_amount > 0, "RewardRouter: invalid _amount");

    //     uint256 balance = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);

    //     IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bonusGmxTracker, _amount, _account);
    //     IRewardTracker(bonusGmxTracker).unstakeForAccount(_account, stakedGmxTracker, _amount, _account);
    //     IRewardTracker(stakedGmxTracker).unstakeForAccount(_account, _token, _amount, _account);

    //     if (_shouldReduceBnGmx) {
    //         uint256 bnGmxAmount = IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);
    //         if (bnGmxAmount > 0) {
    //             IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, bnGmx, bnGmxAmount);
    //         }

    //         uint256 stakedBnGmx = IRewardTracker(feeGmxTracker).depositBalances(_account, bnGmx);
    //         if (stakedBnGmx > 0) {
    //             uint256 reductionAmount = stakedBnGmx.mul(_amount).div(balance);
    //             IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bnGmx, reductionAmount, _account);
    //             IMintable(bnGmx).burn(_account, reductionAmount);
    //         }
    //     }

    //     emit UnstakeGmx(_account, _token, _amount);
    // }
}
