var fetch = require("node-fetch")

var etherscan = module.exports = function(params) {
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

etherscan.rpc = function(action, params={}) {
  return etherscan(Object.assign({ module: "proxy", action }, params))
}

function toQueryString(params) {
  return Object.keys(params).map(name => ([
    encodeURIComponent(name),
    encodeURIComponent(params[name]),
  ])).map(([name, value]) => `${name}=${value}`).join("&")
}
