var config = require("./config.js")
var etherscan = require("./etherscan.js")
var moment = require("moment")

module.exports = txhash => {
  var currentMoment = moment(new Date)
  var legacyMarket = /^0x5a35c21f/.test(txhash)

  return etherscan.rpc("eth_getTransactionByHash", { txhash }).then(tx => {
    var marketAddress      = tx.creates
    var openingBlockNumber = tx.blockNumber

    return etherscan.rpc("eth_getBlockByNumber", {
      tag     : openingBlockNumber,
      boolean : "true",
    }).then(openingBlock => {
      var openingMoment = moment(Number(openingBlock.timestamp) * 1000)

      if (legacyMarket) {
        return next(openingMoment.clone().add(32, "days"))
      } else {
        return etherscan.rpc("eth_call", {
          to     : marketAddress,
          data   : `0x${config.sighashes["close_time()"]}`,
          tag    : openingBlockNumber,
        }).then(closingTimestamp => {
          return next(moment(Number(closingTimestamp) * 1000))
        })
      }

      function next(closingMoment) {
        var open = closingMoment > currentMoment

        return etherscan({
          module    : "logs",
          action    : "getLogs",
          fromBlock : Math.max(2980470, Number(openingBlockNumber)),
          toBlock   : "latest",
          address   : marketAddress,
        }).then(marketLogs => {
          return etherscan.rpc("eth_getBlockByNumber", {
            tag     : marketLogs[marketLogs.length - 1].blockNumber,
            boolean : true,
          }).then(lastActivityBlock => {
            return {
              marketLogs,
              openingBlock,
              lastActivityBlock,
            }
          })
        })
      }
    })
  })
}
