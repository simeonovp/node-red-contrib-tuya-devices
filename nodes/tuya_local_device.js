const path = require('path')

module.exports = function (RED) {
  'use strict'

  const CONFIG_DEFAULTS = {
  }

  class LocalDevice {
    constructor (config) {
      RED.nodes.createNode(this, config)

      const defaults = CONFIG_DEFAULTS
      this.config = {}

      // Deregister from BrokerNode when this node is deleted or restarted
      this.on('close', (done) => {
        done()
      })
    }
  }

  RED.nodes.registerType('tuya-local-device', LocalDevice)
}
