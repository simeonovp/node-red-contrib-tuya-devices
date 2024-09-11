const { Device } = require('tuya-devices')

const DEBUG = false

module.exports = function (RED) {
  'use strict'
 
  class LocalDevice {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.debug = DEBUG ? this.log.bind(this) : (() => {})
    
      if (config.gateway) {
        this.gatewayNode = RED.nodes.getNode(config.gateway)
        if (!this.gatewayNode || ((this.gatewayNode.type !== 'tuya-local-device'))) {
          this.error(`Device configuration is wrong or missing, please review the node settings, 
            id:${config.gateway}
            node:${this.gatewayNode}
            type:${typeof this.gatewayNode?.type}`)
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
        }
        else {
          this.gateway = this.gatewayNode.device
        }
      }

      this.projectNode = config.project && RED.nodes.getNode(config.project)
      if (!this.projectNode || ((this.projectNode.type !== 'tuya-project'))) {
        this.error('Device configuration is wrong or missing, please review the node settings, type:' + typeof this.projectNode?.type)
        this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
      }
      else {
        this.project = this.projectNode?.project
      }

      this.device = new Device(this.gateway, this.project, config, this)

      this.on('close', (done) => {
        this.device.deinit()
        done()
      })
  
      // Initial state
      process.nextTick(() => this.device.initStatus())
    }

    enableNode() {
      this.log('enableNode(): enabling the node ' + this.id)
      if (this.device.autoStart) this.device.startComm()
    }

    disableNode() {
      this.log('disableNode(): disabling the node ' + this.id)
      this.device.closeComm()
    }
  }

  RED.nodes.registerType('tuya-local-device', LocalDevice)
}
