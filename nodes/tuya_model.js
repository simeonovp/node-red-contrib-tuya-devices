const TuyaDevice = require('tuyapi')

module.exports = function (RED) {
  'use strict'

  class Model {
    constructor (config) {
      RED.nodes.createNode(this, config)
      this.on('close', this.onClose.bind(this))
    }

    onClose(done) {
      done()
    }
  }

  RED.nodes.registerType('tuya-model', Model)
}
