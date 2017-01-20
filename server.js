var BigNumber = require("bignumber.js")
var async     = require("async")
var http      = require("http")
var moment    = require("moment")
var redis     = require("redis")

var config          = require("./config.js")
var etherscan       = require("./etherscan.js")
var fetchMarketData = require("./fetch.js")
var parseMarketData = require("./parse.js")

var CACHE_SECONDS = Number(process.env.CACHE_SECONDS) || 60
var ZERO          = new BigNumber(0)

function getMarkets() {
  return new Promise((resolve, reject) => {
    async.map(config.marketTransactions.slice(0, 2), (txhash, $) => {
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

function getData() {
  return getPrices().then(prices => {
    var getTrades = pair => prices.filter(x => x.pair == pair)
    var getDayTrades = pair => getTrades(pair).filter(
      x => x.time.isAfter(moment().subtract(1, "days"))
    )

    var getTotalSum = (pair, f) => getSum(getTrades(pair), f)
    var getDailySum = (pair, f) => getSum(getDayTrades(pair), f)
    var getSum = (xs, f) => xs.reduce((a, x) => a.plus(f(x)), ZERO)

    var getLastTrade = pair => getTrades(pair)[0] || {}
    var getLastPrice = pair => getLastTrade(pair).price || "-"

    return JSON.stringify("MKR DGD GNT ICO".split(" ").reduce(
      (result, symbol) => Object.assign(result, {
        [`ETH_${symbol}`]: {
          last        : getLastPrice(`${symbol}ETH`),
          baseVolume  : getDailySum(`${symbol}ETH`, x => x.baseAmount),
          quoteVolume : getDailySum(`${symbol}ETH`, x => x.counterAmount),
        },
      }
    ), {}), null, 2)
  })
}

http.createServer((req, res) => {
  if (req.url == "/markets") {
    async.map(config.marketTransactions, (txhash, callback) => {
      etherscan.rpc("eth_getTransactionByHash", { txhash }).then(tx => {
        callback(null, tx.creates)
      }, callback)
    }, (error, xs) => {
      if (error) {
        res.writeHead(500)
        res.end(error)
      } else {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(`${JSON.stringify(xs.reduce((result, x, i) => {
          result[i] = x
          return result
        }, {}), null, 2)}\n`)
      }
    })
  } else {
    (redisClient ? new Promise((resolve, reject) => {
      redisClient.get("data", (error, data) => {
        if (error) {
          reject(error)
        } else {
          resolve(data || getData().then(data => {
            return new Promise((resolve, reject) => {
              redisClient.setex("data", CACHE_SECONDS, data, error => {
                if (error) {
                  reject(error)
                } else {
                  resolve(data)
                }
              })
            })
          }))
        }
      })
    }) : getData()).then(data => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(`${data}\n`)
    }, error => {
      console.warn(error.stack)
      res.writeHead(500)
      res.end(error.message)
      process.exit(1)
    })
  }
}).listen(process.env.PORT)
