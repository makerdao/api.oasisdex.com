var fetch = require("node-fetch")

var queue = []
var requests = 0

setInterval(() => {
  queue.splice(
    0, Math.max(0, 10 - requests)
  ).forEach(({ url, resolve, reject }) => {
    requests++
    fetch(url).then(response => {
      requests--
      if (response.ok) {
        response.json().then(json => {
          if (json.error) {
            reject(new Error(JSON.stringify(json.error)))
          } else {
            resolve(json.result)
          }
        })
      } else {
        reject(new Error(`HTTP ${response.status}`))
      }
    }).catch(reject)
  })
}, 100)

var etherscan = module.exports = function(params) {
  var url = `https://api.etherscan.io/api?${toQueryString(params)}`
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject })
  })
}

etherscan.rpc = function(action, params={}) {
  return etherscan(Object.assign({ module: "proxy", action }, params))
}

function toQueryString(params) {
  return Object.keys(params).map(name => ([
    encodeURIComponent(name),
    encodeURIComponent(params[name]),
  ])).map(([name, value]) => `${name}=${value}`).join("&")
}
