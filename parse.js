var BigNumber = require("bignumber.js")
var config    = require("./config.js")
var moment    = require("moment")

module.exports = data => {
  function getBlockMoment(blockNumber) {
    var b0 = Number(data.openingBlock.number)
    var b1 = Number(data.lastActivityBlock.number)
    var b  = Number(blockNumber)
    var t0 = Number(data.openingBlock.timestamp)
    var t1 = Number(data.lastActivityBlock.timestamp)
    return moment(interpolate(t0, t1, (b - b0) / (b1 - b0)) * 1000)
  }

  return {
    prices: data.marketLogs.filter(log => {
      return log.topics[0].slice(2, 10) == config.sighashes[
        "Trade(uint256,address,uint256,address)"
      ]
    }).reverse().map(logObject => [
      logObject,
      ...logObject.topics.slice(1),
      ...logObject.data.slice(2).match(/.{64}/g),
    ]).filter(([logObject, buyToken, sellToken, buyAmount, sellAmount]) => {
      return config.tokens[`0x${buyToken.slice(26)}`]
        && config.tokens[`0x${sellToken.slice(26)}`]
    }).map(([logObject, buyToken, sellToken, buyAmount, sellAmount]) => {
      buyToken   = config.tokens[`0x${buyToken.slice(26)}`]
      sellToken  = config.tokens[`0x${sellToken.slice(26)}`]
      buyAmount  = parseMoney(buyAmount, buyToken.decimals)
      sellAmount = parseMoney(sellAmount, sellToken.decimals)
  
      return Object.assign((
        buyToken.name == "ETH" || buyToken.name < sellToken.name
      ) ? {
        baseToken     : sellToken,
        baseAmount    : sellAmount,
        counterToken  : buyToken,
        counterAmount : buyAmount,
      } : {
        baseToken     : buyToken,
        baseAmount    : buyAmount,
        counterToken  : sellToken,
        counterAmount : sellAmount,
      }, {
        blockNumber   : logObject.blockNumber,
      })
    }).map(({
      baseToken, counterToken, blockNumber, baseAmount, counterAmount
    }) => {
      return {
        pair: `${baseToken.name}${counterToken.name}`,
        time: getBlockMoment(blockNumber).utc().format(),
        quote: counterAmount.dividedBy(baseAmount).toFixed(5),
      }
    })
  }
}

function parseMoney(hexnum, decimals) {
  return new BigNumber(`0x${hexnum}`).dividedBy(`1e${decimals}`)
}

function interpolate(x0, x1, x) {
  return x0 + (x1 - x0) * x
}
