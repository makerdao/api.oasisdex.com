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
      return getAllLogs(
        marketAddress, openingBlockNumber
      ).then(marketLogs => {
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

function getAllLogs(address, fromBlock=1, result=[]) {
  return getLogs(address, fromBlock).then(logs => {
    if (logs.length < 1000) {
      return result.concat(logs)
    } else {
      var partialBlock = Number(logs[logs.length - 1].blockNumber)
      return getLogs(
        address, fromBlock, partialBlock - 1, result
      ).then(logs => {
        return getAllLogs(address, partialBlock, result.concat(logs))
      })
    }
  })
}

function getLogs(address, fromBlock=1, toBlock="latest") {
  return etherscan({
    module: "logs", action: "getLogs", address, fromBlock, toBlock,
  })
}
