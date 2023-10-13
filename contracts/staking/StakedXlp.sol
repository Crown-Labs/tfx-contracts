// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

import "../core/interfaces/IXlpManager.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IRewardTracker.sol";

// provide a way to transfer staked GLP tokens by unstaking from the sender
// and staking for the receiver
// tests in RewardRouterV3.js
contract StakedXlp {
    using SafeMath for uint256;

    string public constant name = "StakedXlp";
    string public constant symbol = "sGLP";
    uint8 public constant decimals = 18;

    address public xlp;
    IXlpManager public xlpManager;
    address public stakedXlpTracker;
    address public feeXlpTracker;

    mapping (address => mapping (address => uint256)) public allowances;

    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        address _xlp,
        IXlpManager _xlpManager,
        address _stakedXlpTracker,
        address _feeXlpTracker
    ) public {
        xlp = _xlp;
        xlpManager = _xlpManager;
        stakedXlpTracker = _stakedXlpTracker;
        feeXlpTracker = _feeXlpTracker;
    }

    function allowance(address _owner, address _spender) external view returns (uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount) external returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) external returns (bool) {
        uint256 nextAllowance = allowances[_sender][msg.sender].sub(_amount, "StakedXlp: transfer amount exceeds allowance");
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function balanceOf(address _account) external view returns (uint256) {
        IRewardTracker(stakedXlpTracker).depositBalances(_account, xlp);
    }

    function totalSupply() external view returns (uint256) {
        IERC20(stakedXlpTracker).totalSupply();
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "StakedXlp: approve from the zero address");
        require(_spender != address(0), "StakedXlp: approve to the zero address");

        allowances[_owner][_spender] = _amount;

        emit Approval(_owner, _spender, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(_sender != address(0), "StakedXlp: transfer from the zero address");
        require(_recipient != address(0), "StakedXlp: transfer to the zero address");

        require(
            xlpManager.lastAddedAt(_sender).add(xlpManager.cooldownDuration()) <= block.timestamp,
            "StakedXlp: cooldown duration not yet passed"
        );

        IRewardTracker(stakedXlpTracker).unstakeForAccount(_sender, feeXlpTracker, _amount, _sender);
        IRewardTracker(feeXlpTracker).unstakeForAccount(_sender, xlp, _amount, _sender);

        IRewardTracker(feeXlpTracker).stakeForAccount(_sender, _recipient, xlp, _amount);
        IRewardTracker(stakedXlpTracker).stakeForAccount(_recipient, _recipient, feeXlpTracker, _amount);
    }
}
