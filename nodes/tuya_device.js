const path = require('path')

module.exports = function (RED) {
  'use strict'

  class TuyaDevice {
    constructor (config) {
      RED.nodes.createNode(this, config)
      this.config = config
      this.device = this.config.device && RED.nodes.getNode(this.config.device)

      const deviceStatusHandler = this.onDeviceStatus.bind(this)
      const deviceDataHandler = this.onDeviceData.bind(this)
      if(this.device) {
        this.device.addListener('tuya-status', deviceStatusHandler)
        this.device.addListener('tuya-data', deviceDataHandler)
      }

      // Deregister from BrokerNode when this node is deleted or restarted
      this.on('close', (done) => {
        if(this.device) {
          this.device.removeListener('tuya-status', deviceStatusHandler)
          this.device.removeListener('tuya-data', deviceDataHandler)
        }
        done()
      })

      this.on('input', (msg, send, done) => {
        this.log(`Recieved input : ${JSON.stringify(msg)}`)
        let operation = msg.payload.operation || 'SET'
        delete msg.payload.operation
        if (['GET', 'SET', 'REFRESH'].indexOf(operation) != -1) {
          // the device has to be connected.
          if (!this.device || !this.device.isConnected) {
            // error device not connected
            const errText = `Device not connected. Can't send the ${operation} commmand`
            this.error(errText)
            this.status({ fill: 'red', shape: 'ring', text: 'Device not connected!' })
            done()
            return
          }
        }
        switch (operation) {
          case 'SET':
            this.device?.tuyaSet(msg.payload)
            break
          case 'REFRESH':
            this.device?.tuyaRefresh(msg.payload)
            break
          case 'GET':
            this.device?.tuyaGet(msg.payload)
            break
          case 'CONTROL':
            this.device?.tuyaControl(msg.payload.action, msg.payload.value)
            break
        }
        done()
      })
      this.device && this.onDeviceStatus(this.device.deviceStatus)
    }

    onDeviceStatus(state, data) {
      // this.log('-- onDeviceStatus ev:' + state)
      data && this.send([null, { payload: { state, ...data } }])
      switch (state) {
        case 'connecting':
          this.status({ fill: 'yellow', shape: 'ring', text: state })
          break
        case 'connected':
          this.status({ fill: 'green', shape: 'ring', text: state })
          break
        case 'disconnected':
          this.status({ fill: 'red', shape: 'ring', text: state })
          break
        case 'error':
          const errorShortText = this.device?.isConnected && JSON.stringify(data?.context?.message) || `Can't find device`
          this.status({ fill: 'red', shape: 'ring', text: `${state}: ${errorShortText}` })
          break
      }
    }

    onDeviceData(ev, payload) {
      this.log(`-- onDeviceData [event:${ev}]: ${JSON.stringify(payload?.data)}`)
      this.send([ { payload }, null ])
    }

  }

  RED.nodes.registerType('tuya-device', TuyaDevice)
}
