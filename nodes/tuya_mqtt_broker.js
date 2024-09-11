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
