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
      let marketLogs = []
      let previousBlockNumber = openingBlockNumber
      return next()

      function next() {
        return etherscan({
          module    : "logs",
          action    : "getLogs",
          fromBlock : +previousBlockNumber + 1,
          toBlock   : "latest",
          address   : marketAddress,
        }).then(newMarketLogs => {
          if (newMarketLogs.length == 0) {
            return etherscan.rpc("eth_getBlockByNumber", {
              tag     : "0x" + previousBlockNumber.toString(16),
              boolean : true,
            }).then(lastActivityBlock => { 
              return {
                marketLogs,
                openingBlock,
                lastActivityBlock,
              }
            })
          } else {
            let blockNumber = +newMarketLogs[newMarketLogs.length - 1].blockNumber
            previousBlockNumber = blockNumber
            marketLogs = [...marketLogs, ...newMarketLogs]
            return next()
          }
        })
      }
    })
  })
}
