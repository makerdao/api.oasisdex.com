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

if (process.env.REDIS_URL) {
  var redisClient = redis.createClient(process.env.REDIS_URL)
}

function getData() {
  return getMarkets().then(markets => {
    return {
      prices: [].concat(...markets.map(market => market.prices)),
      offers: markets[0].offers,
    }
  }).then(({ prices, offers }) => {
    var getTrades = pair => prices.filter(x => x.pair == pair)
    var getDayTrades = pair => getTrades(pair).filter(
      x => x.time.isAfter(moment().subtract(1, "days"))
    )

    var getTotalSum = (pair, f) => getSum(getTrades(pair), f)
    var getDailySum = (pair, f) => getSum(getDayTrades(pair), f)
    var getSum = (xs, f) => xs.reduce((a, x) => a.plus(f(x)), ZERO)

    var getLastTrade = pair => getTrades(pair)[0] || {}
    var getLastPrice = pair => getLastTrade(pair).price || ZERO

    var getOrders = pair => offers.filter(x => x.pair == pair)
    var getSellOrders = pair => getOrders(pair).filter(x => x.type == "sell")
    var getBuyOrders = pair => getOrders(pair).filter(x => x.type == "buy").reverse()

    var getBestSellOrder = pair => getSellOrders(pair)[0] || {}
    var getBestBuyOrder = pair => getBuyOrders(pair)[0] || {}

    var getAsk = pair => getBestSellOrder(pair).price || ZERO
    var getBid = pair => getBestBuyOrder(pair).price || ZERO

    return JSON.stringify("MKR DGD GNT ICN".split(" ").reduce(
      (result, symbol) => Object.assign(result, {
        [`ETH_${symbol}`]: {
          last        : getLastPrice(`${symbol}ETH`).toFixed(9),
          baseVolume  : getDailySum(`${symbol}ETH`, x => x.baseAmount).toFixed(Object.keys(config.tokens).filter(x => config.tokens[x].name == symbol)[0].decimals || 18),
          quoteVolume : getDailySum(`${symbol}ETH`, x => x.counterAmount).toFixed(18),
          lowestAsk   : getAsk(`${symbol}ETH`).toFixed(9),
          highestBid  : getBid(`${symbol}ETH`).toFixed(9),
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
  } else if (req.url == "/supply") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ MKR: { totalSupply: 1000000 } }) + "\n")
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
