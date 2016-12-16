var config = require("./config.js")
var fetch = require("node-fetch")
var moment = require("moment")

module.exports = txhash => {
  var currentMoment = moment(new Date)
  var legacyMarket = /^0x5a35c21f/.test(txhash)

  return rpc("eth_getTransactionByHash", { txhash }).then(tx => {
    var marketAddress      = tx.creates
    var openingBlockNumber = tx.blockNumber

    return rpc("eth_getBlockByNumber", {
      tag     : openingBlockNumber,
      boolean : "true",
    }).then(openingBlock => {
      var openingMoment = moment(Number(openingBlock.timestamp) * 1000)

      if (legacyMarket) {
        return next(openingMoment.clone().add(32, "days"))
      } else {
        return rpc("eth_call", {
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
          fromBlock : Number(openingBlockNumber),
          toBlock   : "latest",
          address   : marketAddress,
        }).then(marketLogs => {
          return rpc("eth_getBlockByNumber", {
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

function toQueryString(params) {
  return Object.keys(params).map(name => ([
    encodeURIComponent(name),
    encodeURIComponent(params[name]),
  ])).map(([name, value]) => `${name}=${value}`).join("&")
}

function etherscan(params) {
  var url = `https://api.etherscan.io/api?${toQueryString(params)}`
  return fetch(url).then(response => {
    if (response.ok) {
      return response.json().then(json => {
        if (json.error) {
          throw new Error(JSON.stringify(json.error))
        } else {
          return json.result
        }
      })
    } else {
      throw new Error(`HTTP ${response.statusCode}`)
    }
  }).catch(error => {
    throw new Error(`${url}: ${error.message}`)
  })
}

function rpc(action, params={}) {
  return etherscan(Object.assign({ module: "proxy", action }, params))
}
