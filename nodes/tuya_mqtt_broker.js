const { MQTTBroker } = require('tuya-devices')

const DEBUG = false

module.exports = function (RED) {
  'use strict'

  class MqttBrokerNode {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.debug = DEBUG ? this.log.bind(this) : (() => {})
      this.debug('config:' + JSON.stringify(config))

      this.mqttBroker = new MQTTBroker(config, this)
      // Setup secure connection if requested
      if (config.useTls && config.tls) {
        const tlsNode = RED.nodes.getNode(config.tls)
        if (tlsNode) tlsNode.addTLSOptions(mqttOptions)
      }

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
