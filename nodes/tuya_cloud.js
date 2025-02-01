const { Cloud, TuyaCloud } = require('tuya-devices')

module.exports = function (RED) {
  'use strict'

  class CloudNode {
    constructor(config) {
      RED.nodes.createNode(this, config)

      const appType = config.appType && parseInt(config.appType) || 0
      switch (appType) {
      case 0: 
        this.cloud = new Cloud(config, this.credentials, this)
        break
      case 1:
        this.cloudApi = new TuyaCloud(config, this.credentials, this)
        break
      }
      
      this.on('close', (done) => {
        this.cloud?.deinit()
        this.cloudApi?.deinit()
        done()
      })
    }
  }

  RED.nodes.registerType('tuya-cloud', CloudNode, {
    credentials: {
      accessId: { type: 'text' },
      accessKey: { type: 'password' },
      secret2: { type: 'text' },
      certSign: { type: 'text' },
      email: { type: 'text' },
      password: { type: 'password' },
    }
  })
}
