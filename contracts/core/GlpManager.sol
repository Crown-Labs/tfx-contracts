// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IGlpManager.sol";
import "../tokens/interfaces/IUSDG.sol";
import "../tokens/interfaces/IMintable.sol";
import "../access/Governable.sol";

interface IFulfillController {
    function requestOracle(bytes memory _data, address _account, bytes memory _revertHandler) external;
    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external;
}

pragma solidity 0.6.12;

contract GlpManager is ReentrancyGuard, Governable, IGlpManager {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant USDG_DECIMALS = 18;
    uint256 public constant MAX_COOLDOWN_DURATION = 48 hours;

    IVault public vault;
    address public usdg;
    address public glp;
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
        uint256 aumInUsdg,
        uint256 glpSupply,
        uint256 usdgAmount,
        uint256 mintAmount
    );

    event RemoveLiquidity(
        address account,
        address token,
        uint256 glpAmount,
        uint256 aumInUsdg,
        uint256 glpSupply,
        uint256 usdgAmount,
        uint256 amountOut
    );

    constructor(address _vault, address _usdg, address _glp, uint256 _cooldownDuration) public {
        gov = msg.sender;
        vault = IVault(_vault);
        usdg = _usdg;
        glp = _glp;
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
        require(_cooldownDuration <= MAX_COOLDOWN_DURATION, "GlpManager: invalid _cooldownDuration");
        cooldownDuration = _cooldownDuration;
    }

    function setAumAdjustment(uint256 _aumAddition, uint256 _aumDeduction) external onlyGov {
        aumAddition = _aumAddition;
        aumDeduction = _aumDeduction;
    }

    function addLiquidity(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external override nonReentrant returns (uint256) {
        if (inPrivateMode) { revert("GlpManager: action not enabled"); }

        require(_amount > 0, "GlpManager: invalid _amount");
        IERC20(_token).safeTransferFrom(msg.sender, fulfillController, _amount); 

        // request oracle
        bytes memory data = abi.encodeWithSignature("handlerAddLiquidity(address,address,address,uint256,uint256,uint256)", fulfillController, msg.sender, _token, _amount, _minUsdg, _minGlp);
        IFulfillController(fulfillController).requestOracleWithToken(data, msg.sender, _token, _amount, false, "");
    }

    function removeLiquidity(address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) external override nonReentrant returns (uint256) {
        if (inPrivateMode) { revert("GlpManager: action not enabled"); }

        require(_glpAmount > 0, "GlpManager: invalid _glpAmount");
        require(lastAddedAt[msg.sender].add(cooldownDuration) <= block.timestamp, "GlpManager: cooldown duration not yet passed");

        // request oracle
        bytes memory data = abi.encodeWithSignature("handlerRemoveLiquidity(address,address,address,uint256,uint256)", msg.sender, _receiver, _tokenOut, _glpAmount, _minOut);
        IFulfillController(fulfillController).requestOracle(data, msg.sender, "");
    }

    function handlerAddLiquidity(address _account, address _receiver, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external override returns (uint256) {
        _validateHandler();

        uint256 amount = _addLiquidity(_account, _receiver, _token, _amount, _minUsdg, _minGlp);
        require(amount > 0, "GlpManager: fulfill revert");
        return amount;
    }

    function handlerRemoveLiquidity(address _account, address _receiver, address _tokenOut, uint256 _glpAmount, uint256 _minOut) external override returns (uint256) {
        _validateHandler();

        uint256 amount = _removeLiquidity(_account, _tokenOut, _glpAmount, _minOut, _receiver);
        require(amount > 0, "GlpManager: fulfill revert");
        return amount;
    }

    function getAums() external view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = getAum(true, false);
        amounts[1] = getAum(false, false);
        return amounts;
    }

    function getAumInUsdg(bool maximise) public view returns (uint256) {
        uint256 aum = getAum(maximise, true);
        return aum.mul(10 ** USDG_DECIMALS).div(PRICE_PRECISION);
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

    function _addLiquidity(address _fundingAccount, address _account, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) private returns (uint256) {
        require(_amount > 0, "GlpManager: invalid _amount");

        // calculate aum before buyUSDG
        uint256 aumInUsdg = getAumInUsdg(true);
        uint256 glpSupply = IERC20(glp).totalSupply();

        IERC20(_token).safeTransferFrom(_fundingAccount, address(vault), _amount); 
        uint256 usdgAmount = vault.buyUSDG(_token, address(this));
        require(usdgAmount >= _minUsdg, "GlpManager: insufficient USDG output");

        uint256 mintAmount = aumInUsdg == 0 ? usdgAmount : usdgAmount.mul(glpSupply).div(aumInUsdg);
        require(mintAmount >= _minGlp, "GlpManager: insufficient GLP output");

        IMintable(glp).mint(_account, mintAmount);

        lastAddedAt[_account] = block.timestamp;

        emit AddLiquidity(_account, _token, _amount, aumInUsdg, glpSupply, usdgAmount, mintAmount);

        return mintAmount;
    }

    function _removeLiquidity(address _account, address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) private returns (uint256) {
        require(_glpAmount > 0, "GlpManager: invalid _glpAmount");
        require(lastAddedAt[_account].add(cooldownDuration) <= block.timestamp, "GlpManager: cooldown duration not yet passed");

        // calculate aum before sellUSDG
        uint256 aumInUsdg = getAumInUsdg(false);
        uint256 glpSupply = IERC20(glp).totalSupply();

        uint256 usdgAmount = _glpAmount.mul(aumInUsdg).div(glpSupply);
        uint256 usdgBalance = IERC20(usdg).balanceOf(address(this));
        if (usdgAmount > usdgBalance) {
            IUSDG(usdg).mint(address(this), usdgAmount.sub(usdgBalance));
        }

        IMintable(glp).burn(_account, _glpAmount);

        IERC20(usdg).transfer(address(vault), usdgAmount);
        uint256 amountOut = vault.sellUSDG(_tokenOut, _receiver);
        require(amountOut >= _minOut, "GlpManager: insufficient output");

        emit RemoveLiquidity(_account, _tokenOut, _glpAmount, aumInUsdg, glpSupply, usdgAmount, amountOut);

        return amountOut;
    }

    function _validateHandler() private view {
        require(isHandler[msg.sender], "GlpManager: forbidden");
    }
}
