const { Device } = require('tuya-devices')

module.exports = function (RED) {
  'use strict'
 
  class LocalDevice {
    constructor (config) {
      RED.nodes.createNode(this, config)

      config.debug = {}
      if (config.dbgDevice) config.debug.Device = true
      if (config.dbgDeviceExtension) config.debug.DeviceExtension = true
      if (config.dbgTuyaDevice) config.debug.TuyaDevice = true

      if (config.gateway) {
        this.gatewayNode = RED.nodes.getNode(config.gateway)
        if (!this.gatewayNode || ((this.gatewayNode.type !== 'tuya-local-device'))) {
          this.error(`LocalDevice GW configuration is wrong or missing, please review the node settings, 
            id:${config.gateway}
            node:${this.gatewayNode}
            type:${typeof this.gatewayNode?.type}`)
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
        }
        else {
          this.gateway = this.gatewayNode.device
        }
      }

      this.projectNode = RED.nodes.getNode(config.project)
      if (this.projectNode?.type === 'tuya-project') {
        this.project = this.projectNode?.project
        if (!this.project) this.error('Project object is ' + this.project)
      }
      else {
        this.error('LocalDevice configuration is wrong or missing, please review the node settings, type:' + typeof this.projectNode?.type)
        this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
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
