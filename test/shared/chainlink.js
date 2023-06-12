function toChainlinkPrice(value) {
  return parseInt(value * Math.pow(10, 8))
}

function toXOraclePrice(value) {
  return parseInt(value * Math.pow(10, 8))
}

module.exports = { toChainlinkPrice, toXOraclePrice }
