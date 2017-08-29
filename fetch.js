var async     = require("async")
var config    = require("./config.js")
var etherscan = require("./etherscan.js")
var moment    = require("moment")

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
        marketAddress, 4000000 // openingBlockNumber
      ).then(marketLogs => {
        return etherscan.rpc("eth_getBlockByNumber", {
          tag     : marketLogs[marketLogs.length - 1].blockNumber,
          boolean : true,
        }).then(lastActivityBlock => {
          var proceed = offers => ({
            marketLogs, offers, openingBlock, lastActivityBlock,
          })
        
          if (txhash == config.marketTransactions[0]) {
            return etherscan({
              module: "proxy",
              action: "eth_call",
              to: tx.creates,
              data: `0x${config.sighashes["last_offer_id()"]}`,
              tag: lastActivityBlock.number,
            }).then(result => {
              return new Promise((resolve, reject) => {
                async.times(Number(result), (id, callback) => {
                  etherscan({
                    module: "proxy",
                    action: "eth_call",
                    to: tx.creates,
                    data: `0x${config.sighashes["getOffer(uint256)"]}${uint256(id)}`,
                    tag: lastActivityBlock.number,
                  }).then(result => {
                    callback(null, [id, ...result.slice(2).match(/.{64}/g)])
                  }, callback)
                }, (error, offers) => (
                  error ? reject(error) : resolve(proceed(offers))
                ))
              })
            })
          } else {
            return proceed([])
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

function uint256(number) {
  return padLeft("0", 64, Number(number).toString(16))
}

function padLeft(padding, width, string) {
  return repeat(padding, Math.max(0, width - string.length)) + string
}

function repeat(x, n) {
  return new Array(n + 1).join(x)
}
