var async           = require("async")
var http            = require("http")
var redis           = require("redis")

var config          = require("./config.js")
var etherscan       = require("./etherscan.js")
var fetchMarketData = require("./fetch.js")
var parseMarketData = require("./parse.js")

var CACHE_SECONDS = Number(process.env.CACHE_SECONDS) || 60

function getMarkets() {
  return new Promise((resolve, reject) => {
    async.map(config.marketTransactions.slice(0, 1), (txhash, $) => {
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
    var getQuote = pair => {
      return (prices.filter(x => x.pair == pair)[0] || {}).quote || "-"
    }

    return JSON.stringify({
      "MKRETH": getQuote("MKRETH"),
      "GNTETH": getQuote("GNTETH"),
    })
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
      res.writeHead(500)
      res.end(error.message)
      process.exit(1)
    })
  }
}).listen(process.env.PORT)
