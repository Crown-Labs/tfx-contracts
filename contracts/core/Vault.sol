// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../tokens/interfaces/IUSDX.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IVaultPriceFeed.sol";

contract Vault is ReentrancyGuard, IVault {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant FUNDING_RATE_PRECISION = 1000000;
    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant MIN_LEVERAGE = 10000; // 1x
    uint256 public constant USDX_DECIMALS = 18;
    uint256 public constant MAX_FEE_BASIS_POINTS = 500; // 5%
    uint256 public constant MAX_LIQUIDATION_FEE_USD = 100 * PRICE_PRECISION; // 100 USD
    uint256 public constant MIN_FUNDING_RATE_INTERVAL = 1 hours;
    uint256 public constant MAX_FUNDING_RATE_FACTOR = 10000; // 1%

    bool public override isInitialized;
    bool public override isSwapEnabled = true;
    bool public override isLeverageEnabled = true;

    address public override vaultPositionController;

    address public errorController;

    address public override router;
    address public override priceFeed;

    address public override usdx;
    address public override gov;

    uint256 public override whitelistedTokenCount;

    uint256 public override maxLeverage = 50 * 10000; // 50x

    uint256 public override liquidationFeeUsd;
    uint256 public override taxBasisPoints = 50; // 0.5%
    uint256 public override stableTaxBasisPoints = 20; // 0.2%
    uint256 public override mintBurnFeeBasisPoints = 30; // 0.3%
    uint256 public override swapFeeBasisPoints = 30; // 0.3%
    uint256 public override stableSwapFeeBasisPoints = 4; // 0.04%
    uint256 public override marginFeeBasisPoints = 10; // 0.1%

    uint256 public override minProfitTime;
    bool public override hasDynamicFees = false;

    uint256 public override fundingInterval = 8 hours;
    uint256 public override fundingRateFactor;
    uint256 public override stableFundingRateFactor;
    uint256 public override totalTokenWeights;

    bool public includeAmmPrice = true;
    bool public useSwapPricing = false;

    bool public override inManagerMode = false;
    bool public override inPrivateLiquidationMode = false;

    uint256 public override maxGasPrice;

    mapping (address => mapping (address => bool)) public override approvedRouters;
    mapping (address => bool) public override isLiquidator;
    mapping (address => bool) public override isManager;

    address[] public override allWhitelistedTokens;

    mapping (address => bool) public override whitelistedTokens;
    mapping (address => uint256) public override tokenDecimals;
    mapping (address => uint256) public override minProfitBasisPoints;
    mapping (address => bool) public override stableTokens;
    mapping (address => bool) public override shortableTokens;

    // tokenBalances is used only to determine _transferIn values
    mapping (address => uint256) public override tokenBalances;

    // tokenWeights allows customisation of index composition
    mapping (address => uint256) public override tokenWeights;

    // usdxAmounts tracks the amount of USDX debt for each whitelisted token
    mapping (address => uint256) public override usdxAmounts;

    // maxUsdxAmounts allows setting a max amount of USDX debt for a token
    mapping (address => uint256) public override maxUsdxAmounts;

    // poolAmounts tracks the number of received tokens that can be used for leverage
    // this is tracked separately from tokenBalances to exclude funds that are deposited as margin collateral
    mapping (address => uint256) public override poolAmounts;

    // reservedAmounts tracks the number of tokens reserved for open leverage positions
    mapping (address => uint256) public override reservedAmounts;

    // bufferAmounts allows specification of an amount to exclude from swaps
    // this can be used to ensure a certain amount of liquidity is available for leverage positions
    mapping (address => uint256) public override bufferAmounts;

    // guaranteedUsd tracks the amount of USD that is "guaranteed" by opened leverage positions
    // this value is used to calculate the redemption values for selling of USDX
    // this is an estimated amount, it is possible for the actual guaranteed value to be lower
    // in the case of sudden price decreases, the guaranteed value should be corrected
    // after liquidations are carried out
    mapping (address => uint256) public override guaranteedUsd;

    // cumulativeFundingRates tracks the funding rates based on utilization
    mapping (address => uint256) public override cumulativeFundingRates;
    // lastFundingTimes tracks the last time funding was updated for a token
    mapping (address => uint256) public override lastFundingTimes;

    // feeReserves tracks the amount of fees per token
    mapping (address => uint256) public override feeReserves;

    mapping (address => uint256) public override globalShortSizes;
    mapping (address => uint256) public override globalShortAveragePrices;
    mapping (address => uint256) public override maxGlobalShortSizes;

    mapping (uint256 => string) public override errors;

    event BuyUSDX(address account, address token, uint256 tokenAmount, uint256 usdxAmount, uint256 feeBasisPoints);
    event SellUSDX(address account, address token, uint256 usdxAmount, uint256 tokenAmount, uint256 feeBasisPoints);
    event Swap(address account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 amountOutAfterFees, uint256 feeBasisPoints);

    event UpdateFundingRate(address token, uint256 fundingRate);

    event CollectSwapFees(address token, uint256 feeUsd, uint256 feeTokens);
    event CollectMarginFees(address token, uint256 feeUsd, uint256 feeTokens);

    event DirectPoolDeposit(address token, uint256 amount);
    event IncreasePoolAmount(address token, uint256 amount);
    event DecreasePoolAmount(address token, uint256 amount);
    event IncreaseUsdxAmount(address token, uint256 amount);
    event DecreaseUsdxAmount(address token, uint256 amount);
    event IncreaseReservedAmount(address token, uint256 amount);
    event DecreaseReservedAmount(address token, uint256 amount);
    event IncreaseGuaranteedUsd(address token, uint256 amount);
    event DecreaseGuaranteedUsd(address token, uint256 amount);

    // once the parameters are verified to be working correctly,
    // gov should be set to a timelock contract or a governance contract
    constructor() {
        gov = msg.sender;
    }

    function initialize(
        address _vaultPositionController,
        address _router,
        address _usdx,
        address _priceFeed,
        uint256 _liquidationFeeUsd,
        uint256 _fundingRateFactor,
        uint256 _stableFundingRateFactor
    ) external {
        _onlyGov();
        _validate(!isInitialized, 1);
        isInitialized = true;

        vaultPositionController = _vaultPositionController;
        router = _router;
        usdx = _usdx;
        priceFeed = _priceFeed;
        liquidationFeeUsd = _liquidationFeeUsd;
        fundingRateFactor = _fundingRateFactor;
        stableFundingRateFactor = _stableFundingRateFactor;
    }

    function setErrorController(address _errorController) external {
        _onlyGov();
        errorController = _errorController;
    }

    function setError(uint256 _errorCode, string calldata _error) external override {
        require(msg.sender == errorController, "Vault: invalid errorController");
        errors[_errorCode] = _error;
    }

    function allWhitelistedTokensLength() external override view returns (uint256) {
        return allWhitelistedTokens.length;
    }

    function setInManagerMode(bool _inManagerMode) external override {
        _onlyGov();
        inManagerMode = _inManagerMode;
    }

    function setManager(address _manager, bool _isManager) external override {
        _onlyGov();
        isManager[_manager] = _isManager;
    }

    function setInPrivateLiquidationMode(bool _inPrivateLiquidationMode) external override {
        _onlyGov();
        inPrivateLiquidationMode = _inPrivateLiquidationMode;
    }

    function setLiquidator(address _liquidator, bool _isActive) external override {
        _onlyGov();
        isLiquidator[_liquidator] = _isActive;
    }

    function setIsSwapEnabled(bool _isSwapEnabled) external override {
        _onlyGov();
        isSwapEnabled = _isSwapEnabled;
    }

    function setIsLeverageEnabled(bool _isLeverageEnabled) external override {
        _onlyGov();
        isLeverageEnabled = _isLeverageEnabled;
    }

    function setMaxGasPrice(uint256 _maxGasPrice) external override {
        _onlyGov();
        maxGasPrice = _maxGasPrice;
    }

    function setGov(address _gov) external {
        _onlyGov();
        gov = _gov;
    }

    function setPriceFeed(address _priceFeed) external override {
        _onlyGov();
        priceFeed = _priceFeed;
    }

    function setMaxLeverage(uint256 _maxLeverage) external override {
        _onlyGov();
        _validate(_maxLeverage > MIN_LEVERAGE, 2);
        maxLeverage = _maxLeverage;
    }

    function setBufferAmount(address _token, uint256 _amount) external override {
        _onlyGov();
        bufferAmounts[_token] = _amount;
    }

    function setMaxGlobalShortSize(address _token, uint256 _amount) external override {
        _onlyGov();
        maxGlobalShortSizes[_token] = _amount;
    }

    function setFees(
        uint256 _taxBasisPoints,
        uint256 _stableTaxBasisPoints,
        uint256 _mintBurnFeeBasisPoints,
        uint256 _swapFeeBasisPoints,
        uint256 _stableSwapFeeBasisPoints,
        uint256 _marginFeeBasisPoints,
        uint256 _liquidationFeeUsd,
        uint256 _minProfitTime,
        bool _hasDynamicFees
    ) external override {
        _onlyGov();
        _validate(_taxBasisPoints <= MAX_FEE_BASIS_POINTS, 3);
        _validate(_stableTaxBasisPoints <= MAX_FEE_BASIS_POINTS, 4);
        _validate(_mintBurnFeeBasisPoints <= MAX_FEE_BASIS_POINTS, 5);
        _validate(_swapFeeBasisPoints <= MAX_FEE_BASIS_POINTS, 6);
        _validate(_stableSwapFeeBasisPoints <= MAX_FEE_BASIS_POINTS, 7);
        _validate(_marginFeeBasisPoints <= MAX_FEE_BASIS_POINTS, 8);
        _validate(_liquidationFeeUsd <= MAX_LIQUIDATION_FEE_USD, 9);
        taxBasisPoints = _taxBasisPoints;
        stableTaxBasisPoints = _stableTaxBasisPoints;
        mintBurnFeeBasisPoints = _mintBurnFeeBasisPoints;
        swapFeeBasisPoints = _swapFeeBasisPoints;
        stableSwapFeeBasisPoints = _stableSwapFeeBasisPoints;
        marginFeeBasisPoints = _marginFeeBasisPoints;
        liquidationFeeUsd = _liquidationFeeUsd;
        minProfitTime = _minProfitTime;
        hasDynamicFees = _hasDynamicFees;
    }

    function setFundingRate(uint256 _fundingInterval, uint256 _fundingRateFactor, uint256 _stableFundingRateFactor) external override {
        _onlyGov();
        _validate(_fundingInterval >= MIN_FUNDING_RATE_INTERVAL, 10);
        _validate(_fundingRateFactor <= MAX_FUNDING_RATE_FACTOR, 11);
        _validate(_stableFundingRateFactor <= MAX_FUNDING_RATE_FACTOR, 12);
        fundingInterval = _fundingInterval;
        fundingRateFactor = _fundingRateFactor;
        stableFundingRateFactor = _stableFundingRateFactor;
    }

    function setTokenConfig(
        address _token,
        uint256 _tokenDecimals,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdxAmount,
        bool _isStable,
        bool _isShortable
    ) external override {
        _onlyGov();
        // increment token count for the first time
        if (!whitelistedTokens[_token]) {
            whitelistedTokenCount = whitelistedTokenCount.add(1);
            allWhitelistedTokens.push(_token);
        }

        uint256 _totalTokenWeights = totalTokenWeights;
        _totalTokenWeights = _totalTokenWeights.sub(tokenWeights[_token]);

        whitelistedTokens[_token] = true;
        tokenDecimals[_token] = _tokenDecimals;
        tokenWeights[_token] = _tokenWeight;
        minProfitBasisPoints[_token] = _minProfitBps;
        maxUsdxAmounts[_token] = _maxUsdxAmount;
        stableTokens[_token] = _isStable;
        shortableTokens[_token] = _isShortable;

        totalTokenWeights = _totalTokenWeights.add(_tokenWeight);
    }

    function clearTokenConfig(address _token) external {
        _onlyGov();
        _validate(whitelistedTokens[_token], 13);
        totalTokenWeights = totalTokenWeights.sub(tokenWeights[_token]);
        delete whitelistedTokens[_token];
        delete tokenDecimals[_token];
        delete tokenWeights[_token];
        delete minProfitBasisPoints[_token];
        delete maxUsdxAmounts[_token];
        delete stableTokens[_token];
        delete shortableTokens[_token];
        whitelistedTokenCount = whitelistedTokenCount.sub(1);
    }

    function withdrawFees(address _token, address _receiver) external override returns (uint256) {
        _onlyGov();
        uint256 amount = feeReserves[_token];
        if(amount == 0) { return 0; }
        feeReserves[_token] = 0;
        _transferOut(_token, amount, _receiver);
        return amount;
    }

    function addRouter(address _router) external {
        approvedRouters[msg.sender][_router] = true;
    }

    function removeRouter(address _router) external {
        approvedRouters[msg.sender][_router] = false;
    }

    function setUsdxAmount(address _token, uint256 _amount) external override {
        _onlyGov();

        uint256 usdxAmount = usdxAmounts[_token];
        if (_amount > usdxAmount) {
            _increaseUsdxAmount(_token, _amount.sub(usdxAmount));
            return;
        }

        _decreaseUsdxAmount(_token, usdxAmount.sub(_amount));
    }

    // the governance controlling this function should have a timelock
    function upgradeVault(address _newVault, address _token, uint256 _amount) external {
        _onlyGov();
        IERC20(_token).safeTransfer(_newVault, _amount);
    }

    // deposit into the pool without minting USDX tokens
    // useful in allowing the pool to become over-collaterised
    function directPoolDeposit(address _token) external override nonReentrant {
        _validate(whitelistedTokens[_token], 14);
        uint256 tokenAmount = _transferIn(_token);
        _validate(tokenAmount > 0, 15);
        _increasePoolAmount(_token, tokenAmount);
        emit DirectPoolDeposit(_token, tokenAmount);
    }

    function buyUSDX(address _token, address _receiver) external override nonReentrant returns (uint256) {
        _validateManager();
        _validate(whitelistedTokens[_token], 16);
        useSwapPricing = true;

        uint256 tokenAmount = _transferIn(_token);
        _validate(tokenAmount > 0, 17);

        updateCumulativeFundingRate(_token, _token);

        uint256 price = getMinPrice(_token, true);

        uint256 usdxAmount = tokenAmount.mul(price).div(PRICE_PRECISION);
        usdxAmount = adjustForDecimals(usdxAmount, _token, usdx);
        _validate(usdxAmount > 0, 18);

        uint256 feeBasisPoints = getBuyUsdxFeeBasisPoints(_token, usdxAmount);
        uint256 amountAfterFees = _collectSwapFees(_token, tokenAmount, feeBasisPoints);
        uint256 mintAmount = amountAfterFees.mul(price).div(PRICE_PRECISION);
        mintAmount = adjustForDecimals(mintAmount, _token, usdx);

        _increaseUsdxAmount(_token, mintAmount);
        _increasePoolAmount(_token, amountAfterFees);

        IUSDX(usdx).mint(_receiver, mintAmount);

        emit BuyUSDX(_receiver, _token, tokenAmount, mintAmount, feeBasisPoints);

        useSwapPricing = false;
        return mintAmount;
    }

    function sellUSDX(address _token, address _receiver) external override nonReentrant returns (uint256) {
        _validateManager();
        _validate(whitelistedTokens[_token], 19);
        useSwapPricing = true;

        uint256 usdxAmount = _transferIn(usdx);
        _validate(usdxAmount > 0, 20);

        updateCumulativeFundingRate(_token, _token);

        uint256 redemptionAmount = getRedemptionAmount(_token, usdxAmount, true);
        _validate(redemptionAmount > 0, 21);

        _decreaseUsdxAmount(_token, usdxAmount);
        _decreasePoolAmount(_token, redemptionAmount);

        IUSDX(usdx).burn(address(this), usdxAmount);

        // the _transferIn call increased the value of tokenBalances[usdx]
        // usually decreases in token balances are synced by calling _transferOut
        // however, for usdx, the tokens are burnt, so _updateTokenBalance should
        // be manually called to record the decrease in tokens
        _updateTokenBalance(usdx);

        uint256 feeBasisPoints = getSellUsdxFeeBasisPoints(_token, usdxAmount);
        uint256 amountOut = _collectSwapFees(_token, redemptionAmount, feeBasisPoints);
        _validate(amountOut > 0, 22);

        _transferOut(_token, amountOut, _receiver);

        emit SellUSDX(_receiver, _token, usdxAmount, amountOut, feeBasisPoints);

        useSwapPricing = false;
        return amountOut;
    }

    function swap(address _tokenIn, address _tokenOut, address _receiver) external override nonReentrant returns (uint256) {
        _validate(isSwapEnabled, 23);
        _validate(whitelistedTokens[_tokenIn], 24);
        _validate(whitelistedTokens[_tokenOut], 25);
        _validate(_tokenIn != _tokenOut, 26);

        useSwapPricing = true;

        updateCumulativeFundingRate(_tokenIn, _tokenIn);
        updateCumulativeFundingRate(_tokenOut, _tokenOut);

        uint256 amountIn = _transferIn(_tokenIn);
        _validate(amountIn > 0, 27);

        uint256 priceIn = getMinPrice(_tokenIn, true);
        uint256 priceOut = getMaxPrice(_tokenOut, true);

        uint256 amountOut = amountIn.mul(priceIn).div(priceOut);
        amountOut = adjustForDecimals(amountOut, _tokenIn, _tokenOut);

        // adjust usdxAmounts by the same usdxAmount as debt is shifted between the assets
        uint256 usdxAmount = amountIn.mul(priceIn).div(PRICE_PRECISION);
        usdxAmount = adjustForDecimals(usdxAmount, _tokenIn, usdx);

        uint256 feeBasisPoints = getSwapFeeBasisPoints(_tokenIn, _tokenOut, usdxAmount);
        uint256 amountOutAfterFees = _collectSwapFees(_tokenOut, amountOut, feeBasisPoints);

        _increaseUsdxAmount(_tokenIn, usdxAmount);
        _decreaseUsdxAmount(_tokenOut, usdxAmount);

        _increasePoolAmount(_tokenIn, amountIn);
        _decreasePoolAmount(_tokenOut, amountOut);

        _validateBufferAmount(_tokenOut);

        _transferOut(_tokenOut, amountOutAfterFees, _receiver);

        emit Swap(_receiver, _tokenIn, _tokenOut, amountIn, amountOut, amountOutAfterFees, feeBasisPoints);

        useSwapPricing = false;
        return amountOutAfterFees;
    }

    function getMaxPrice(address _token, bool _validate_) public override view returns (uint256) {
        return IVaultPriceFeed(priceFeed).getPrice(_token, true, _validate_);
    }

    function getMinPrice(address _token, bool _validate_) public override view returns (uint256) {
        return IVaultPriceFeed(priceFeed).getPrice(_token, false, _validate_);
    }

    function getRedemptionAmount(address _token, uint256 _usdxAmount, bool _validatePrice) public override view returns (uint256) {
        uint256 price = getMaxPrice(_token, _validatePrice);
        uint256 redemptionAmount = _usdxAmount.mul(PRICE_PRECISION).div(price);
        return adjustForDecimals(redemptionAmount, usdx, _token);
    }

    function getRedemptionCollateral(address _token) public view returns (uint256) {
        if (stableTokens[_token]) {
            return poolAmounts[_token];
        }
        uint256 collateral = usdToTokenMin(_token, guaranteedUsd[_token]);
        return collateral.add(poolAmounts[_token]).sub(reservedAmounts[_token]);
    }

    function getRedemptionCollateralUsd(address _token) public view returns (uint256) {
        return tokenToUsdMin(_token, getRedemptionCollateral(_token));
    }

    function adjustForDecimals(uint256 _amount, address _tokenDiv, address _tokenMul) public override view returns (uint256) {
        uint256 decimalsDiv = _tokenDiv == usdx ? USDX_DECIMALS : tokenDecimals[_tokenDiv];
        uint256 decimalsMul = _tokenMul == usdx ? USDX_DECIMALS : tokenDecimals[_tokenMul];
        return _amount.mul(10 ** decimalsMul).div(10 ** decimalsDiv);
    }

    function tokenToUsdMin(address _token, uint256 _tokenAmount) public override view returns (uint256) {
        if (_tokenAmount == 0) { return 0; }
        uint256 price = getMinPrice(_token, true);
        uint256 decimals = tokenDecimals[_token];
        return _tokenAmount.mul(price).div(10 ** decimals);
    }

    function usdToTokenMax(address _token, uint256 _usdAmount) public override view returns (uint256) {
        if (_usdAmount == 0) { return 0; }
        return usdToToken(_token, _usdAmount, getMinPrice(_token, true));
    }

    function usdToTokenMin(address _token, uint256 _usdAmount) public override view returns (uint256) {
        if (_usdAmount == 0) { return 0; }
        return usdToToken(_token, _usdAmount, getMaxPrice(_token, true));
    }

    function usdToToken(address _token, uint256 _usdAmount, uint256 _price) public override view returns (uint256) {
        if (_usdAmount == 0) { return 0; }
        uint256 decimals = tokenDecimals[_token];
        return _usdAmount.mul(10 ** decimals).div(_price);
    }

    function updateCumulativeFundingRate(address _collateralToken, address /*_indexToken*/) public override {
        if (lastFundingTimes[_collateralToken] == 0) {
            lastFundingTimes[_collateralToken] = block.timestamp.div(fundingInterval).mul(fundingInterval);
            return;
        }

        if (lastFundingTimes[_collateralToken].add(fundingInterval) > block.timestamp) {
            return;
        }

        uint256 fundingRate = getNextFundingRate(_collateralToken);
        cumulativeFundingRates[_collateralToken] = cumulativeFundingRates[_collateralToken].add(fundingRate);
        lastFundingTimes[_collateralToken] = block.timestamp.div(fundingInterval).mul(fundingInterval);

        emit UpdateFundingRate(_collateralToken, cumulativeFundingRates[_collateralToken]);
    }

    function getNextFundingRate(address _token) public override view returns (uint256) {
        if (lastFundingTimes[_token].add(fundingInterval) > block.timestamp) { return 0; }

        uint256 intervals = block.timestamp.sub(lastFundingTimes[_token]).div(fundingInterval);
        uint256 poolAmount = poolAmounts[_token];
        if (poolAmount == 0) { return 0; }

        uint256 _fundingRateFactor = stableTokens[_token] ? stableFundingRateFactor : fundingRateFactor;
        return _fundingRateFactor.mul(reservedAmounts[_token]).mul(intervals).div(poolAmount);
    }

    function getUtilisation(address _token) public view returns (uint256) {
        uint256 poolAmount = poolAmounts[_token];
        if (poolAmount == 0) { return 0; }

        return reservedAmounts[_token].mul(FUNDING_RATE_PRECISION).div(poolAmount);
    }

    function getEntryFundingRate(address _collateralToken, address /*_indexToken*/, bool /*_isLong*/) public override view returns (uint256) {
        return cumulativeFundingRates[_collateralToken];
    }

    function getFundingFee(address /*_account*/, address _collateralToken, address /*_indexToken*/, bool /*_isLong*/, uint256 _size, uint256 _entryFundingRate) public override view returns (uint256) {
        if (_size == 0) { return 0; }

        uint256 fundingRate = cumulativeFundingRates[_collateralToken].sub(_entryFundingRate);
        if (fundingRate == 0) { return 0; }

        return _size.mul(fundingRate).div(FUNDING_RATE_PRECISION);
    }

    function getPositionFee(address /*_account*/, address /*_collateralToken*/, address /*_indexToken*/, bool /*_isLong*/, uint256 _sizeDelta) public override view returns (uint256) {
        if (_sizeDelta == 0) { return 0; }
        uint256 afterFeeUsd = _sizeDelta.mul(BASIS_POINTS_DIVISOR.sub(marginFeeBasisPoints)).div(BASIS_POINTS_DIVISOR);
        return _sizeDelta.sub(afterFeeUsd);
    }

    function getBuyUsdxFeeBasisPoints(address _token, uint256 _usdxAmount) public view returns (uint256) {
        return getFeeBasisPoints(_token, _usdxAmount, mintBurnFeeBasisPoints, taxBasisPoints, true);
    }

    function getSellUsdxFeeBasisPoints(address _token, uint256 _usdxAmount) public view returns (uint256) {
        return getFeeBasisPoints(_token, _usdxAmount, mintBurnFeeBasisPoints, taxBasisPoints, false);
    }

    function getSwapFeeBasisPoints(address _tokenIn, address _tokenOut, uint256 _usdxAmount) public override view returns (uint256) {
        bool isStableSwap = stableTokens[_tokenIn] && stableTokens[_tokenOut];
        uint256 baseBps = isStableSwap ? stableSwapFeeBasisPoints : swapFeeBasisPoints;
        uint256 taxBps = isStableSwap ? stableTaxBasisPoints : taxBasisPoints;
        uint256 feesBasisPoints0 = getFeeBasisPoints(_tokenIn, _usdxAmount, baseBps, taxBps, true);
        uint256 feesBasisPoints1 = getFeeBasisPoints(_tokenOut, _usdxAmount, baseBps, taxBps, false);
        // use the higher of the two fee basis points
        return feesBasisPoints0 > feesBasisPoints1 ? feesBasisPoints0 : feesBasisPoints1;
    }

    // cases to consider
    // 1. initialAmount is far from targetAmount, action increases balance slightly => high rebate
    // 2. initialAmount is far from targetAmount, action increases balance largely => high rebate
    // 3. initialAmount is close to targetAmount, action increases balance slightly => low rebate
    // 4. initialAmount is far from targetAmount, action reduces balance slightly => high tax
    // 5. initialAmount is far from targetAmount, action reduces balance largely => high tax
    // 6. initialAmount is close to targetAmount, action reduces balance largely => low tax
    // 7. initialAmount is above targetAmount, nextAmount is below targetAmount and vice versa
    // 8. a large swap should have similar fees as the same trade split into multiple smaller swaps
    function getFeeBasisPoints(address _token, uint256 _usdxDelta, uint256 _feeBasisPoints, uint256 _taxBasisPoints, bool _increment) public override view returns (uint256) {
        //return vaultUtils.getFeeBasisPoints(_token, _usdxDelta, _feeBasisPoints, _taxBasisPoints, _increment);
         if (!hasDynamicFees) { return _feeBasisPoints; }

        uint256 initialAmount = usdxAmounts[_token];
        uint256 nextAmount = initialAmount.add(_usdxDelta);
        if (!_increment) {
            nextAmount = _usdxDelta > initialAmount ? 0 : initialAmount.sub(_usdxDelta);
        }

        uint256 targetAmount = getTargetUsdxAmount(_token);
        if (targetAmount == 0) { return _feeBasisPoints; }

        uint256 initialDiff = initialAmount > targetAmount ? initialAmount.sub(targetAmount) : targetAmount.sub(initialAmount);
        uint256 nextDiff = nextAmount > targetAmount ? nextAmount.sub(targetAmount) : targetAmount.sub(nextAmount);

        // action improves relative asset balance
        if (nextDiff < initialDiff) {
            uint256 rebateBps = _taxBasisPoints.mul(initialDiff).div(targetAmount);
            return rebateBps > _feeBasisPoints ? 0 : _feeBasisPoints.sub(rebateBps);
        }

        uint256 averageDiff = initialDiff.add(nextDiff).div(2);
        if (averageDiff > targetAmount) {
            averageDiff = targetAmount;
        }
        uint256 taxBps = _taxBasisPoints.mul(averageDiff).div(targetAmount);
        return _feeBasisPoints.add(taxBps);
    }

    function getTargetUsdxAmount(address _token) public override view returns (uint256) {
        uint256 supply = IERC20(usdx).totalSupply();
        if (supply == 0) { return 0; }
        uint256 weight = tokenWeights[_token];
        return weight.mul(supply).div(totalTokenWeights);
    }

    function _collectSwapFees(address _token, uint256 _amount, uint256 _feeBasisPoints) private returns (uint256) {
        uint256 afterFeeAmount = _amount.mul(BASIS_POINTS_DIVISOR.sub(_feeBasisPoints)).div(BASIS_POINTS_DIVISOR);
        uint256 feeAmount = _amount.sub(afterFeeAmount);
        feeReserves[_token] = feeReserves[_token].add(feeAmount);
        emit CollectSwapFees(_token, tokenToUsdMin(_token, feeAmount), feeAmount);
        return afterFeeAmount;
    }

    function _collectMarginFees(address _account, address _collateralToken, address _indexToken, bool _isLong, uint256 _sizeDelta, uint256 _size, uint256 _entryFundingRate) private returns (uint256) {
        uint256 feeUsd = getPositionFee(_account, _collateralToken, _indexToken, _isLong, _sizeDelta);

        uint256 fundingFee = getFundingFee(_account, _collateralToken, _indexToken, _isLong, _size, _entryFundingRate);
        feeUsd = feeUsd.add(fundingFee);

        uint256 feeTokens = usdToTokenMin(_collateralToken, feeUsd);
        feeReserves[_collateralToken] = feeReserves[_collateralToken].add(feeTokens);

        emit CollectMarginFees(_collateralToken, feeUsd, feeTokens);
        return feeUsd;
    }

    function _transferIn(address _token) private returns (uint256) {
        uint256 prevBalance = tokenBalances[_token];
        uint256 nextBalance = IERC20(_token).balanceOf(address(this));
        tokenBalances[_token] = nextBalance;

        return nextBalance.sub(prevBalance);
    }

    function _transferOut(address _token, uint256 _amount, address _receiver) private {
        IERC20(_token).safeTransfer(_receiver, _amount);
        tokenBalances[_token] = IERC20(_token).balanceOf(address(this));
    }

    function _updateTokenBalance(address _token) private {
        uint256 nextBalance = IERC20(_token).balanceOf(address(this));
        tokenBalances[_token] = nextBalance;
    }

    function _increasePoolAmount(address _token, uint256 _amount) private {
        poolAmounts[_token] = poolAmounts[_token].add(_amount);
        uint256 balance = IERC20(_token).balanceOf(address(this));
        _validate(poolAmounts[_token] <= balance, 49);
        emit IncreasePoolAmount(_token, _amount);
    }

    function _decreasePoolAmount(address _token, uint256 _amount) private {
        poolAmounts[_token] = poolAmounts[_token].sub(_amount, "Vault: poolAmount exceeded");
        _validate(reservedAmounts[_token] <= poolAmounts[_token], 50);
        emit DecreasePoolAmount(_token, _amount);
    }

    function _validateBufferAmount(address _token) private view {
        if (poolAmounts[_token] < bufferAmounts[_token]) {
            revert("Vault: poolAmount < buffer");
        }
    }

    function _increaseUsdxAmount(address _token, uint256 _amount) private {
        usdxAmounts[_token] = usdxAmounts[_token].add(_amount);
        uint256 maxUsdxAmount = maxUsdxAmounts[_token];
        if (maxUsdxAmount != 0) {
            _validate(usdxAmounts[_token] <= maxUsdxAmount, 51);
        }
        emit IncreaseUsdxAmount(_token, _amount);
    }

    function _decreaseUsdxAmount(address _token, uint256 _amount) private {
        uint256 value = usdxAmounts[_token];
        // since USDX can be minted using multiple assets
        // it is possible for the USDX debt for a single asset to be less than zero
        // the USDX debt is capped to zero for this case
        if (value <= _amount) {
            usdxAmounts[_token] = 0;
            emit DecreaseUsdxAmount(_token, value);
            return;
        }
        usdxAmounts[_token] = value.sub(_amount);
        emit DecreaseUsdxAmount(_token, _amount);
    }

    // we have this validation as a function instead of a modifier to reduce contract size
    function _onlyGov() private view {
        _validate(msg.sender == gov, 53);
    }


    // we have this validation as a function instead of a modifier to reduce contract size
    function _validateManager() private view {
        if (inManagerMode) {
            _validate(isManager[msg.sender], 54);
        }
    }

    function _validate(bool _condition, uint256 _errorCode) private view {
        require(_condition, errors[_errorCode]);
    }

    // onlyVaultPositionController
    // we have this validation as a function instead of a modifier to reduce contract size
    function _onlyVaultPositionController() private view {
        _validate(msg.sender == vaultPositionController, 54);
    }

    function collectSwapFees(address _token, uint256 _amount, uint256 _feeBasisPoints) external override returns (uint256) {
         _onlyVaultPositionController();
        return _collectSwapFees(_token, _amount, _feeBasisPoints);
    }

    function collectMarginFees(address _account, address _collateralToken, address _indexToken, bool _isLong, uint256 _sizeDelta, uint256 _size, uint256 _entryFundingRate) external override returns (uint256) {
         _onlyVaultPositionController();
        return _collectMarginFees(_account, _collateralToken, _indexToken, _isLong, _sizeDelta, _size, _entryFundingRate);
    }

    function collectLiquidateMarginFees(address _collateralToken, uint256 _marginFees) external override {
        _onlyVaultPositionController();
        
        uint256 feeTokens = usdToTokenMin(_collateralToken, _marginFees);
        feeReserves[_collateralToken] = feeReserves[_collateralToken].add(feeTokens);
        emit CollectMarginFees(_collateralToken, _marginFees, feeTokens);
    }

    function transferIn(address _token) external override returns (uint256) {
        _onlyVaultPositionController();
        return _transferIn(_token);
    }

    function transferOut(address _token, uint256 _amount, address _receiver) external override {
        _onlyVaultPositionController();
        _transferOut(_token, _amount, _receiver);
    }

    function increasePoolAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();
        _increasePoolAmount(_token, _amount);
    }

    function decreasePoolAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();
        _decreasePoolAmount(_token, _amount);
    }

    function increaseUsdxAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();
        _increaseUsdxAmount(_token, _amount);
    }

    function decreaseUsdxAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();
        _decreaseUsdxAmount(_token, _amount);
    }

    function increaseReservedAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();

        reservedAmounts[_token] = reservedAmounts[_token].add(_amount);
        _validate(reservedAmounts[_token] <= poolAmounts[_token], 52);
        emit IncreaseReservedAmount(_token, _amount);
    }

    function decreaseReservedAmount(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();

        reservedAmounts[_token] = reservedAmounts[_token].sub(_amount, "Vault: insufficient reserve");
        emit DecreaseReservedAmount(_token, _amount);
    }

    function increaseGuaranteedUsd(address _token, uint256 _usdAmount) external override {
        _onlyVaultPositionController();

        guaranteedUsd[_token] = guaranteedUsd[_token].add(_usdAmount);
        emit IncreaseGuaranteedUsd(_token, _usdAmount);
    }

    function decreaseGuaranteedUsd(address _token, uint256 _usdAmount) external override {
        _onlyVaultPositionController();

        guaranteedUsd[_token] = guaranteedUsd[_token].sub(_usdAmount);
        emit DecreaseGuaranteedUsd(_token, _usdAmount);
    }

    function increaseGlobalShortSize(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();

        globalShortSizes[_token] = globalShortSizes[_token].add(_amount);

        uint256 maxSize = maxGlobalShortSizes[_token];
        if (maxSize != 0) {
            require(globalShortSizes[_token] <= maxSize, "Vault: max shorts exceeded");
        }
    }

    function decreaseGlobalShortSize(address _token, uint256 _amount) external override {
        _onlyVaultPositionController();

        uint256 size = globalShortSizes[_token];
        if (_amount > size) {
          globalShortSizes[_token] = 0;
          return;
        }

        globalShortSizes[_token] = size.sub(_amount);
    }

    function setIncludeAmmPrice(bool _includeAmmPrice) external override {
        _onlyVaultPositionController();
        includeAmmPrice = _includeAmmPrice;
    }

    function setGlobalShortAveragePrices(address _indexToken, uint256 _price) external override {
        _onlyVaultPositionController();
        globalShortAveragePrices[_indexToken] = _price;
    }
}