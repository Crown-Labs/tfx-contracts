// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IXlpManager.sol";
import "../tokens/interfaces/IUSDX.sol";
import "../tokens/interfaces/IMintable.sol";
import "../access/Governable.sol";

interface IFulfillController {
    function requestOracle(bytes memory _data, address _account, bytes memory _revertHandler) external;
    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external;
}

pragma solidity ^0.8.18;

contract XlpManager is ReentrancyGuard, Governable, IXlpManager {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant USDX_DECIMALS = 18;
    uint256 public constant MAX_COOLDOWN_DURATION = 48 hours;

    IVault public vault;
    address public usdx;
    address public xlp;
    address public fulfillController;

    uint256 public override cooldownDuration;
    mapping (address => uint256) public override lastAddedAt;

    uint256 public aumAddition;
    uint256 public aumDeduction;

    bool public inPrivateMode;
    mapping (address => bool) public isHandler;

    event AddLiquidity(
        address account,
        address token,
        uint256 amount,
        uint256 aumInUsdx,
        uint256 xlpSupply,
        uint256 usdxAmount,
        uint256 mintAmount
    );

    event RemoveLiquidity(
        address account,
        address token,
        uint256 xlpAmount,
        uint256 aumInUsdx,
        uint256 xlpSupply,
        uint256 usdxAmount,
        uint256 amountOut
    );

    constructor(address _vault, address _usdx, address _xlp, uint256 _cooldownDuration) {
        gov = msg.sender;
        vault = IVault(_vault);
        usdx = _usdx;
        xlp = _xlp;
        cooldownDuration = _cooldownDuration;
    }

    function setInPrivateMode(bool _inPrivateMode) external onlyGov {
        inPrivateMode = _inPrivateMode;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
    }

    function setFulfillController(address _fulfillController) external onlyGov {
        require(_fulfillController != address(0), "address invalid");

        isHandler[fulfillController] = false;
        fulfillController = _fulfillController;
        isHandler[fulfillController] = true;
    }

    function setCooldownDuration(uint256 _cooldownDuration) external onlyGov {
        require(_cooldownDuration <= MAX_COOLDOWN_DURATION, "XlpManager: invalid _cooldownDuration");
        cooldownDuration = _cooldownDuration;
    }

    function setAumAdjustment(uint256 _aumAddition, uint256 _aumDeduction) external onlyGov {
        aumAddition = _aumAddition;
        aumDeduction = _aumDeduction;
    }

    function addLiquidity(address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external override nonReentrant {
        if (inPrivateMode) { revert("XlpManager: action not enabled"); }

        require(_amount > 0, "XlpManager: invalid _amount");
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount); 
        IERC20(_token).approve(fulfillController, _amount);

        // request oracle
        bytes memory data = abi.encodeWithSignature("handlerAddLiquidity(address,address,address,uint256,uint256,uint256)", fulfillController, msg.sender, _token, _amount, _minUsdx, _minXlp);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _token, _amount, false, "");
    }

    function removeLiquidity(address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) external override nonReentrant {
        if (inPrivateMode) { revert("XlpManager: action not enabled"); }

        require(_xlpAmount > 0, "XlpManager: invalid _xlpAmount");
        require(lastAddedAt[msg.sender].add(cooldownDuration) <= block.timestamp, "XlpManager: cooldown duration not yet passed");

        // request oracle
        bytes memory data = abi.encodeWithSignature("handlerRemoveLiquidity(address,address,address,uint256,uint256)", msg.sender, _receiver, _tokenOut, _xlpAmount, _minOut);
        IFulfillController(fulfillController).requestOracle(data, msg.sender, "");
    }

    function handlerAddLiquidity(address _account, address _receiver, address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) external override returns (uint256) {
        _validateHandler();

        uint256 amount = _addLiquidity(_account, _receiver, _token, _amount, _minUsdx, _minXlp);
        require(amount > 0, "XlpManager: fulfill revert");
        return amount;
    }

    function handlerRemoveLiquidity(address _account, address _receiver, address _tokenOut, uint256 _xlpAmount, uint256 _minOut) external override returns (uint256) {
        _validateHandler();

        uint256 amount = _removeLiquidity(_account, _tokenOut, _xlpAmount, _minOut, _receiver);
        require(amount > 0, "XlpManager: fulfill revert");
        return amount;
    }

    function getAums() external view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = getAum(true, false);
        amounts[1] = getAum(false, false);
        return amounts;
    }

    function getAumInUsdx(bool maximise) public view returns (uint256) {
        uint256 aum = getAum(maximise, true);
        return aum.mul(10 ** USDX_DECIMALS).div(PRICE_PRECISION);
    }

    function getAum(bool maximise, bool _validatePrice) public view returns (uint256) {
        uint256 length = vault.allWhitelistedTokensLength();
        uint256 aum = aumAddition;
        uint256 shortProfits = 0;

        for (uint256 i = 0; i < length; i++) {
            address token = vault.allWhitelistedTokens(i);
            bool isWhitelisted = vault.whitelistedTokens(token);

            if (!isWhitelisted) {
                continue;
            }

            uint256 price = maximise ? vault.getMaxPrice(token, _validatePrice) : vault.getMinPrice(token, _validatePrice);
            uint256 poolAmount = vault.poolAmounts(token);
            uint256 decimals = vault.tokenDecimals(token);

            if (vault.stableTokens(token)) {
                aum = aum.add(poolAmount.mul(price).div(10 ** decimals));
            } else {
                // add global short profit / loss
                uint256 size = vault.globalShortSizes(token);
                if (size > 0) {
                    uint256 averagePrice = vault.globalShortAveragePrices(token);
                    uint256 priceDelta = averagePrice > price ? averagePrice.sub(price) : price.sub(averagePrice);
                    uint256 delta = size.mul(priceDelta).div(averagePrice);
                    if (price > averagePrice) {
                        // add losses from shorts
                        aum = aum.add(delta);
                    } else {
                        shortProfits = shortProfits.add(delta);
                    }
                }

                aum = aum.add(vault.guaranteedUsd(token));

                uint256 reservedAmount = vault.reservedAmounts(token);
                aum = aum.add(poolAmount.sub(reservedAmount).mul(price).div(10 ** decimals));
            }
        }

        aum = shortProfits > aum ? 0 : aum.sub(shortProfits);
        return aumDeduction > aum ? 0 : aum.sub(aumDeduction);
    }

    function _addLiquidity(address _fundingAccount, address _account, address _token, uint256 _amount, uint256 _minUsdx, uint256 _minXlp) private returns (uint256) {
        require(_amount > 0, "XlpManager: invalid _amount");

        // calculate aum before buyUSDX
        uint256 aumInUsdx = getAumInUsdx(true);
        uint256 xlpSupply = IERC20(xlp).totalSupply();

        IERC20(_token).safeTransferFrom(_fundingAccount, address(vault), _amount); 
        uint256 usdxAmount = vault.buyUSDX(_token, address(this));
        require(usdxAmount >= _minUsdx, "XlpManager: insufficient USDX output");

        uint256 mintAmount = aumInUsdx == 0 ? usdxAmount : usdxAmount.mul(xlpSupply).div(aumInUsdx);
        require(mintAmount >= _minXlp, "XlpManager: insufficient GLP output");

        IMintable(xlp).mint(_account, mintAmount);

        lastAddedAt[_account] = block.timestamp;

        emit AddLiquidity(_account, _token, _amount, aumInUsdx, xlpSupply, usdxAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(address _account, address _tokenOut, uint256 _xlpAmount, uint256 _minOut, address _receiver) private returns (uint256) {
        require(_xlpAmount > 0, "XlpManager: invalid _xlpAmount");
        require(lastAddedAt[_account].add(cooldownDuration) <= block.timestamp, "XlpManager: cooldown duration not yet passed");

        // calculate aum before sellUSDX
        uint256 aumInUsdx = getAumInUsdx(false);
        uint256 xlpSupply = IERC20(xlp).totalSupply();

        uint256 usdxAmount = _xlpAmount.mul(aumInUsdx).div(xlpSupply);
        uint256 usdxBalance = IERC20(usdx).balanceOf(address(this));
        if (usdxAmount > usdxBalance) {
            IUSDX(usdx).mint(address(this), usdxAmount.sub(usdxBalance));
        }

        IMintable(xlp).burn(_account, _xlpAmount);

        IERC20(usdx).transfer(address(vault), usdxAmount);
        uint256 amountOut = vault.sellUSDX(_tokenOut, _receiver);
        require(amountOut >= _minOut, "XlpManager: insufficient output");

        emit RemoveLiquidity(_account, _tokenOut, _xlpAmount, aumInUsdx, xlpSupply, usdxAmount, amountOut);

        return amountOut;
    }

    function _validateHandler() private view {
        require(isHandler[msg.sender], "XlpManager: forbidden");
    }
}
