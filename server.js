var async = require("async")
var http  = require("http")
var redis = require("redis")

var config = require("./config.js")
var fetchMarketData = require("./fetch.js")
var parseMarketData = require("./parse.js")

var CACHE_SECONDS = Number(process.env.CACHE_SECONDS) || 60

function getMarkets() {
  return new Promise((resolve, reject) => {
    async.map(config.marketTransactions, (txhash, $) => {
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
    res.end(data)
  }, error => {
    res.writeHead(500)
    res.end(error.message)
    process.exit(1)
  })
}).listen(process.env.PORT)
