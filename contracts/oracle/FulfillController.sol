// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IXOracle {
    function requestPrices(bytes memory payload, uint256 expiration) external returns (uint256);
    function cancelRequestPrice(uint256 _reqId) external;
    function xOracleCall(uint256 reqId, bool priceUpdate, bytes memory payload) external;
    function getLastPrice(uint256 tokenIndex) external view returns (uint256, uint256, uint256);
    function getDecimals() external pure returns (uint256);
}

interface IWETH {
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
}

interface IHandler {
    // Router
    function fulfillSwap(address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) external;
    function fulfillSwapTokensToETH(address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) external;

    // PositionRouter
    function executeIncreasePositions(uint256 _endIndex, address _executionFeeReceiver) external;
    function executeDecreasePositions(uint256 _endIndex, address _executionFeeReceiver) external;

    // OrderBook
    function fulfillCreateIncreaseOrder(
        address _account,
        address[] memory _path,
        uint256 _amountIn,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        address _collateralToken,
        bool _isLong,
        uint256 _triggerPrice,
        bool _triggerAboveThreshold,
        uint256 _executionFee) external;

    // PositionManager
    function fulfillExecuteOrders(address _executionFeeReceiver) external;
    function fulfillLiquidatePosition(address _account, address _collateralToken, address _indexToken, bool _isLong, address _feeReceiver) external;

    // GlpManager
    function handlerAddLiquidity(address _account, address _receiver, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external returns (uint256);
    function handlerRemoveLiquidity(address _account, address _receiver, address _tokenOut, uint256 _glpAmount, uint256 _minOut) external returns (uint256);

    // RewardRouterV2
    function fulfillMintAndStakeGlp(address _account, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external returns (uint256);
    function fulfillUnstakeAndRedeemGlp(address _account, address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) external returns (uint256);
    function fulfillUnstakeAndRedeemGlpETH(address _account, uint256 _glpAmount, uint256 _minOut, address _receiver) external returns (uint256);
}

contract FulfillController is Ownable {
    // xoracle 
    address public xOracle;
    address public WETH;

    // fulfill task
    struct Task {
        address to;
        bytes data; // task call
        address token;
        uint256 amount;
        bool transferETH; // for token is WETH, true = revert token with transferETH
        address owner;
        uint256 status; // 0 = pending, 1 = executed, 2 = revert
        uint256 expire;
        bytes revertHandler; // handler on reverted
    }
    mapping (uint256 => Task) public tasks;
    uint256 public lastTaskId;

    // token balance
    mapping (address => uint256) public balances;

    uint256 public expireTime = 60; // secs

    // access control
    mapping (address => bool) public handlers;
    mapping (address => bool) public controllers;

    // events
    event SetExpireTime(uint256 expireTime);
    event SetHandler(address handler, bool flag);
    event SetController(address controller, bool flag);
    event RequestTask(uint256 indexed taskId, address indexed account, bytes data);
    event FulfillTask(uint256 indexed taskId, address indexed account, bool success, string message, bytes data);

    modifier onlyHandler() {
        require(handlers[msg.sender], "handler: forbidden");
        _;
    }

    modifier onlyController() {
        require(controllers[msg.sender], "controller: forbidden");
        _;
    }

    modifier onlyInternal() {
        require(msg.sender == address(this), "internal: forbidden");
        _;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    constructor(address _xOracle, address _WETH) {
        require(_xOracle != address(0), "address invalid");
        require(_WETH != address(0), "address invalid");
        xOracle = _xOracle;
        WETH = _WETH;
    }

    // more implements: 
    // set fulfill gas limit
    // set fulfill gas price
    // pay gas

    // ------------------------------
    // contract handler
    // ------------------------------
    function requestOracle(bytes memory _data, address _account, bytes memory _revertHandler) external onlyHandler { 
        require(_data.length != 0, "data invalid");
        require(_account != address(0), "address invalid");

        lastTaskId++;

        // store task callback
        tasks[lastTaskId] = Task({
            to: msg.sender,
            data: _data,
            token: address(0),
            amount: 0,
            transferETH: false,
            owner: _account,
            status: 0, // pending
            expire: block.timestamp + expireTime,
            revertHandler: _revertHandler
        });

        // make payload and call
        bytes memory payload = abi.encode(true, lastTaskId);
        IXOracle(xOracle).requestPrices(payload, tasks[lastTaskId].expire); 

        emit RequestTask(lastTaskId, _account, _data);
    }

    function requestOracleWithToken(bytes memory _data, address _account, address _token, uint256 _amount, bool _transferETH, bytes memory _revertHandler) external onlyHandler { 
        require(_data.length != 0, "data invalid");
        require(_account != address(0), "address invalid");
        require(_token != address(0), "address invalid");
        if (_transferETH) {
            require(_token == WETH, "address invalid");
        }

        uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
        require((tokenBalance - balances[_token]) >= _amount, "token balance insufficient");

        // update balance
        balances[_token] = tokenBalance;

        lastTaskId++;

        // store task callback
        tasks[lastTaskId] = Task({
            to: msg.sender,
            data: _data,
            token: _token,
            amount: _amount,
            transferETH: _transferETH,
            owner: _account,
            status: 0, // pending
            expire: block.timestamp + expireTime,
            revertHandler: _revertHandler
        });

        // make payload and call
        bytes memory payload = abi.encode(true, lastTaskId);
        IXOracle(xOracle).requestPrices(payload, tasks[lastTaskId].expire); 

        emit RequestTask(lastTaskId, _account, _data);
    }

    // ------------------------------
    // controller
    // ------------------------------
    function requestUpdatePrices() external onlyController { 
         // make payload and call
        bytes memory payload = abi.encode(false, 0);
        IXOracle(xOracle).requestPrices(payload, 0); // with no expiration
    }

    function refundTask(uint256 _taskId) external onlyController { 
        Task memory task = tasks[_taskId];
        require(task.expire < block.timestamp, "task must expired");
        revertTask(_taskId);
    }

    // ------------------------------
    // xOracle callback
    // ------------------------------
    function xOracleCall(uint256 /* _reqId */, bool _priceUpdate, bytes memory _payload) external {
        // security callback
        require(msg.sender == xOracle, "FulfillController: only xOracle callback");
        // decode payload
        (bool callback, uint256 taskId) = abi.decode(_payload, (bool, uint256));

        // check oracle update
        if (!_priceUpdate && taskId != 0) {
            revertTask(taskId);
            emit FulfillTask(taskId, tasks[taskId].owner, false, "xOracle: refundRequest", tasks[taskId].data);
            return;
        }
        
        // update price only
        if (!callback) {
            return;
        }

        // task callback
        Task storage task = tasks[taskId];
        require(task.status == 0, "task status != 0");

        // make sure approve token
        if (task.amount > 0) {
            IERC20(task.token).approve(task.to, task.amount);
        }

        // instead low-level call that to catch revert message
        try this.fulfillCall(task.to, task.data) {
            // done
            emit FulfillTask(taskId, task.owner, true, "", task.data);
        } catch Error(string memory reason) { 
            // failing revert, require
            emit FulfillTask(taskId, task.owner, false, reason, task.data);
            revertTask(taskId);
            return;
        }  catch (bytes memory) {
            // failing assert
            emit FulfillTask(taskId, task.owner, false, "failing assert", task.data);
            revertTask(taskId);
            return;
        }

        // update balance
        if (task.amount > 0) {
            balances[task.token] = IERC20(task.token).balanceOf(address(this));
        }
        task.status = 1; // executed
    }

    // ------------------------------
    // private function
    // ------------------------------
    function fulfillCall(address _to, bytes calldata _data) public onlyInternal {
        bytes4 sig = _data[0] | (bytes4(_data[1]) >> 8) | (bytes4(_data[2]) >> 16) | (bytes4(_data[3]) >> 24);

        // [Router]
        // - fulfillSwap(address,address[],uint256,uint256,address)
        if (sig == 0x348621c8) {
            (address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) = abi.decode(_data[4:], (address, address[], uint256, uint256, address));
            IHandler(_to).fulfillSwap(_owner, _path, _amountIn, _minOut, _receiver);
        }
        // - fulfillSwapTokensToETH(address,address[],uint256,uint256,address)
        else if (sig == 0x635e2a2e) {
            (address _owner, address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) = abi.decode(_data[4:], (address, address[], uint256, uint256, address));
            IHandler(_to).fulfillSwapTokensToETH(_owner, _path, _amountIn, _minOut, _receiver);
        }
        // [PositionRouter]
        // - executeIncreasePositions(uint256,address)
        else if (sig == 0x9a208100) {
            (uint256 _endIndex, address _executionFeeReceiver) = abi.decode(_data[4:], (uint256, address));
            IHandler(_to).executeIncreasePositions(_endIndex, _executionFeeReceiver);
        }
        // - executeDecreasePositions(uint256,address)
        else if (sig == 0xf3883d8b) {
            (uint256 _endIndex, address _executionFeeReceiver) = abi.decode(_data[4:], (uint256, address));
            IHandler(_to).executeDecreasePositions(_endIndex, _executionFeeReceiver);
        }
        // [OrderBook]
        // - fulfillCreateIncreaseOrder(address,address[],uint256,address,uint256,uint256,address,bool,uint256,bool,uint256)
        else if (sig == 0x8248f567) {
            (
                address _account,
                address[] memory _path,
                uint256 _amountIn,
                address _indexToken,
                uint256 _minOut,
                uint256 _sizeDelta,
                address _collateralToken,
                bool _isLong,
                uint256 _triggerPrice,
                bool _triggerAboveThreshold,
                uint256 _executionFee
            ) = abi.decode(_data[4:], (address, address[], uint256, address, uint256, uint256, address, bool, uint256, bool, uint256));
            IHandler(_to).fulfillCreateIncreaseOrder(
                _account,
                _path,
                _amountIn,
                _indexToken,
                _minOut,
                _sizeDelta,
                _collateralToken,
                _isLong,
                _triggerPrice,
                _triggerAboveThreshold,
                _executionFee
            );
        }
        // [PositionManager]
        // - fulfillExecuteOrders(address)
        else if (sig == 0x12360ca2) {
            (address _executionFeeReceiver) = abi.decode(_data[4:], (address));
            IHandler(_to).fulfillExecuteOrders(_executionFeeReceiver);
        }
        // - fulfillLiquidatePosition(address,address,address,bool,address)
        else if (sig == 0x694a1db3) {
            (address _account, address _collateralToken, address _indexToken, bool _isLong, address _feeReceiver) = abi.decode(_data[4:], (address, address, address, bool, address));
            IHandler(_to).fulfillLiquidatePosition(_account, _collateralToken, _indexToken, _isLong, _feeReceiver);
        }
        // [GlpManager]
        // - handlerAddLiquidity(address,address,address,uint256,uint256,uint256)
        else if (sig == 0xb0aeb400) {  
            (address _account, address _receiver, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) = abi.decode(_data[4:], (address, address, address, uint256, uint256, uint256));
            IHandler(_to).handlerAddLiquidity(_account, _receiver, _token, _amount, _minUsdg, _minGlp);
        }
        // - handlerRemoveLiquidity(address,address,address,uint256,uint256)
        else if (sig == 0x3b971a9e) { 
            (address _account, address _receiver, address _tokenOut, uint256 _glpAmount, uint256 _minOut) = abi.decode(_data[4:], (address, address, address, uint256, uint256));
            IHandler(_to).handlerRemoveLiquidity(_account, _receiver, _tokenOut, _glpAmount, _minOut);
        }
        // [RewardRouterV2]
        // - fulfillMintAndStakeGlp(address,address,uint256,uint256,uint256)
        else if (sig == 0xbac3bbc2) {
            (address _account, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) = abi.decode(_data[4:], (address, address, uint256, uint256, uint256));
            IHandler(_to).fulfillMintAndStakeGlp(_account, _token, _amount, _minUsdg, _minGlp);
        }
        // - fulfillUnstakeAndRedeemGlp(address,address,uint256,uint256,address)
        else if (sig == 0x4eb2ca24) {
            (address _account, address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) = abi.decode(_data[4:], (address, address, uint256, uint256, address));
            IHandler(_to).fulfillUnstakeAndRedeemGlp(_account, _tokenOut, _glpAmount, _minOut, _receiver);
        }
        // - fulfillUnstakeAndRedeemGlpETH(address,uint256,uint256,address)
        else if (sig == 0xe39474e9) {
            (address _account, uint256 _glpAmount, uint256 _minOut, address _receiver) = abi.decode(_data[4:], (address, uint256, uint256, address));
            IHandler(_to).fulfillUnstakeAndRedeemGlpETH(_account, _glpAmount, _minOut, _receiver);
        } 
        // [Test]
        // - fulfillSwap(address,address[],uint256,uint256)
        // else if (sig == bytes4(keccak256("fulfillSwap(address,address[],uint256,uint256)"))) { 
        //     // low-level call
        //     (bool success, ) = _to.call{value: 0}(_data);
        //     if (!success) {
        //         revert("low-level call reverted");
        //     }
        // }
        // [other cases]
        else {
            // low-level call
            (bool success, ) = _to.call{value: 0}(_data);
            if (!success) {
                revert("low-level call reverted");
            }
        }
    }

    function revertTask(uint256 _taskId) private {
        Task storage task = tasks[_taskId];
        require(task.status == 0, "task status != 0");
        task.status = 2; // revert

        // refund token to owner
        if (task.amount > 0) {
            if (task.transferETH) {
                IWETH(task.token).withdraw(task.amount);
                (bool success, ) = payable(task.owner).call{ value: task.amount }("");
                require(success, "Address: unable to send value, recipient may have reverted");
            } else {
                IERC20(task.token).transfer(task.owner, task.amount);
            }
            
            // update balance
            balances[task.token] = IERC20(task.token).balanceOf(address(this));
        }

        // allow handle on revert
        if (task.revertHandler.length > 0) {
            // low-level call
            (bool success, ) = task.to.call{value: 0}(task.revertHandler);
            success; // avoid unused var
        }
    }
    
    // ------------------------------
    // onlyOwner
    // ------------------------------
    function setExpireTime(uint256 _expireTime) external onlyOwner {
        require(_expireTime <= 300, "max expireTime 5 minutes");
        expireTime = _expireTime;
        emit SetExpireTime(_expireTime);
    }

    function setHandler(address _handler, bool _flag) external onlyOwner {
        require(_handler != address(0), "address invalid");
        handlers[_handler] = _flag;
        emit SetHandler(_handler, _flag);
    }

    function setController(address _controller, bool _flag) external onlyOwner {
        require(_controller != address(0), "address invalid");
        controllers[_controller] = _flag;
        emit SetController(_controller, _flag);
    }
}