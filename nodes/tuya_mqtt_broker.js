const { MQTTBroker } = require('tuya-devices')

const DEBUG = false

module.exports = function (RED) {
  'use strict'

  class MqttBrokerNode {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.debug = DEBUG ? this.log.bind(this) : (() => {})
      this.debug('config:' + JSON.stringify(config))

      // Resolve secure connection options if requested (Node-RED specific wiring)
      if (config.useTls && config.tls) {
        const tlsNode = RED.nodes.getNode(config.tls)
        if (tlsNode) {
          config.tlsOptions = {}
          tlsNode.addTLSOptions(config.tlsOptions)
        }
        else this.warn('TLS configuration is wrong or missing, please review the node settings')
      }

      this.mqttBroker = new MQTTBroker(config, this.credentials, this)

      this.on('close', (done) => {
        this.mqttBroker.deinit()
        done()
      })
    }
  }

  RED.nodes.registerType('tuya-mqtt-broker', MqttBrokerNode, {
    credentials: {
      user: { type: 'text' },
      password: { type: 'password' }
    }
  })
}
