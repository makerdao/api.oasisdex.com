var BigNumber = require("bignumber.js")
var async     = require("async")
var fetch     = require("node-fetch")
var http      = require("http")
var moment    = require("moment")
var redis     = require("redis")

var CACHE_SECONDS = Number(process.env.CACHE_SECONDS) || 60

function parseMarketData(data) {
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
      return log.topics[0].slice(2, 10) == sighashes[
        "Trade(uint256,address,uint256,address)"
      ]
    }).reverse().map(logObject => [
      logObject,
      ...logObject.topics.slice(1),
      ...logObject.data.slice(2).match(/.{64}/g),
    ]).map(([logObject, buyToken, sellToken, buyAmount, sellAmount]) => {
      buyToken   = tokens[`0x${buyToken.slice(26)}`]
      sellToken  = tokens[`0x${sellToken.slice(26)}`]
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
    }).filter(({ baseToken, counterToken }) => {
      return `${baseToken.name}/${counterToken.name}` == "MKR/ETH"
    }).map(({ blockNumber, baseAmount, counterAmount }) => {
      return {
        pair: "MKR/ETH",
        time: getBlockMoment(blockNumber).utc().format(),
        quote: counterAmount.dividedBy(baseAmount).toFormat(2),
      }
    })
  }
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

function interpolate(x0, x1, x) {
  return x0 + (x1 - x0) * x
}

function fetchMarketData(txhash) {
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
          data   : `0x${sighashes["close_time()"]}`,
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

var tokens = {
  "0xc66ea802717bfb9833400264dd12c2bceaa34a6d": {
    name: "MKR",
    decimals: 18,
  },

  "0xecf8f87f810ecf450940c9f60066b4a7a501d6a7": {
    name: "ETH",
    decimals: 18,
  },
}

function parseMoney(hexnum, decimals) {
  return new BigNumber(`0x${hexnum}`).dividedBy(`1e${decimals}`)
}

var sighashes = {
  "isClosed()":                              "c2b6b58c",
  "close_time()":                            "6377ebca",
  "getOffer(uint256)":                       "4579268a",
  "last_offer_id()":                         "232cae0b",
  "ItemUpdate(uint256)":                     "de857d27",
  "Trade(uint256,address,uint256,address)":  "a5ca35f5",
}

var marketTransactions = [
  "0x0066f5fbcaa625dab61f10707e78335fcfca1b5368cfc82668dec73a52ae4e82",
  "0x79087917cdce224af685b2ab383e0400d53561d5d70b4ee1324eb79c82e7d1fa",
  "0x7d2882d1be830f003eaf2605139414f75ae25c2f83d3675781fba891491b4588",
  "0x32d87105aa9f80e4a94fda8b98ffc8692deda4fee6137ff02b276019857840fe",
  "0x204e1ca055f766dfa92dd37bd8360f219856200337f9bb4dafb07c287e5fac8a",
  "0x3e749e38e006ff6456cebc2787e420baa1ea7d79ae0fe3eceb90bf116b0c6306",
  "0x2b3cfc0ef21270fdb033aabbc12985afc030a207f19fc7267b8b72fd1b7ff4b3",
  "0xb53eb6f9ab76750b1f2ff4c144e423dc076bb904583f7abcacb76e0349dc8e32",
  "0xf3010757cbafb177ff6a9b29bd4165460b8ab773541df74bdf662e8358ed7b3e",
  "0x110d10c768f7a1340032d1c0ba469ea9d8c0baf64ee7dab84fd65a3e6579c2f5",
  "0x328266acdfab441ef45fcfdfee7a8daa49ac1700eb5b8b02bbcb888eae21f9f5",
  "0xc2b0a71c73fdd57f73c3696aa5487fac233fa26861cea9337f3a95233ca35f10",
  "0x02e60851c0fddf4d706eb06039b40ccea1daa73a05566893a1e5f9c4a3397cdb",
  "0x5a35c21f35ef4badce42b0d94fe5a9842b2826e6a355f4dc21ade210d58c3d42",
].slice(0, 1)

function getMarkets() {
  return new Promise((resolve, reject) => {
    async.map(marketTransactions, (txhash, $) => {
      fetchMarketData(txhash).then(parseMarketData).then(x => {
        $(null, x)
      }, $)
    }, (error, xs) => error ? reject(error) : resolve(xs))
  })
}

function getPrices() {
  return getMarkets().then(markets => {
    return [].concat(...markets.map(market => market.prices))
  })
}

if (process.env.REDIS_URL) {
  var redisClient = redis.createClient(process.env.REDIS_URL)
}

function getPrice() {
  return getPrices().then(prices => prices[0].quote)
}

http.createServer((req, res) => {
  if (req.url == "/") {
    (redisClient ? new Promise((resolve, reject) => {
      redisClient.get("price", (error, price) => {
        if (error) {
          reject(error)
        } else {
          resolve(price || getPrice().then(price => {
            return new Promise((resolve, reject) => {
              redisClient.setex("price", CACHE_SECONDS, price, error => {
                if (error) {
                  reject(error)
                } else {
                  resolve(price)
                }
              })
            })
          }))
        }
      })
    }) : getPrice()).then(price => {
      res.end(price)
    }, error => {
      res.writeHead(500)
      res.end(error.message)
    })
  } else {
    res.writeHead(404)
    res.end("Nope")
  }
}).listen(process.env.PORT)
