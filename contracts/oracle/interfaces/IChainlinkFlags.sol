// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IChainlinkFlags {
  function getFlag(address) external view returns (bool);
}
