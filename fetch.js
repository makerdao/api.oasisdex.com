var config = require("./config.js")
var etherscan = require("./etherscan.js")
var moment = require("moment")

function getAllLogs(blockNumber, address) {
  let allLogs = []
  let previousBlockNumber = blockNumber

  function next() {
    return etherscan({
      module    : "logs",
      action    : "getLogs",
      fromBlock : +previousBlockNumber + 1,
      toBlock   : "latest",
      address   : address,
    }).then(logs => {
      if (logs.length == 0) {
        return allLogs
      } else {
        let blockNumber = +logs[logs.length - 1].blockNumber
        previousBlockNumber = blockNumber
        allLogs = [...allLogs, ...logs]
        return next()
      }
    })
  }

  return next()
}

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
      return getAllLogs(openingBlockNumber, marketAddress).then(marketLogs => {
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
    })
  })
}
