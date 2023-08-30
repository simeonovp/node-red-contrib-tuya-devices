const request = require('request')

module.exports = function (RED) {
  'use strict'

  class TuyaManager {
    constructor (config) {
      RED.nodes.createNode(this, config)
    }
  }

  RED.nodes.registerType('tuya-manager', TuyaManager)
}
