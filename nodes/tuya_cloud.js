const { Cloud } = require('tuya-devices')

module.exports = function (RED) {
  'use strict'

  class CloudNode {
    constructor(config) {
      RED.nodes.createNode(this, config)

      this.cloud = new Cloud(config, this.credentials, this)

      this.on('close', (done) => {
        this.cloud.deinit()
        done()
      })
    }
  }

  RED.nodes.registerType('tuya-cloud', CloudNode, {
    credentials: {
      accessId: { type: 'text' },
      accessKey: { type: 'password' }
    }
  })
}
