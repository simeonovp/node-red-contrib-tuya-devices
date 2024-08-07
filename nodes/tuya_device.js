const path = require('path')

module.exports = function (RED) {
  'use strict'

  class DeviceNode {
    constructor (config) {
      RED.nodes.createNode(this, config)
      this.config = config
      this.device = this.config.device && RED.nodes.getNode(this.config.device)
      if (!this.device || ((this.device.type !== 'tuya-local-device'))) {
        this.error('Device configuration is wrong or missing, please review the node settings, type:' + typeof this.device?.type)
        this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
        this.device = null
        return
      }
      this.dps = /*config.dps && config.dps.includes(',') && config.dps.split(',') ||*/ config.dps

      this.deviceStatusHandler = this.onDeviceStatus.bind(this)
      this.deviceDataHandler = this.onDeviceData.bind(this)

      // Deregister from BrokerNode when this node is deleted or restarted
      this.on('close', (done) => {
        this.deinit()
        done()
      })

      this.on('input', this.onInput)

      this.onDeviceStatus(this.device.deviceStatus)
      if (this.device.deviceStatus === 'connected') this.onDeviceData('last-data', this.device.lastData)
      
      process.nextTick(this.init.bind(this))
    }

    init() {
      if(!this.device) return
      this.device.register(this)
      this.device.addListener('tuya-status', this.deviceStatusHandler)
      this.device.addListener('tuya-data', this.deviceDataHandler)
   }

    deinit() {
      if(!this.device) return
      this.device.removeListener('tuya-status', this.deviceStatusHandler)
      this.device.removeListener('tuya-data', this.deviceDataHandler)
      this.device.unregister(this)
    }

    onInput(msg, send, done) {
      this.log(`Recieved input: ${JSON.stringify(msg)}`)
      let operation = msg.operation || msg.payload.operation || 'SET'
      delete msg.payload.operation
      if (['GET', 'SET', 'REFRESH'].indexOf(operation) != -1) {
        // the device has to be connected.
        if (!this.device.isConnected) {
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
          if (typeof msg.payload === 'object') {
            this.device.setMultipleDps(msg.payload)
          }
          else this.device.tuyaSet(msg.options || { //operation: 'SET'
            dps: msg.dps || msg.topic || this.dps,
            set: msg.payload
          })
          break
        case 'REFRESH':
          this.device.tuyaRefresh(msg.payload)
          break
        case 'GET':
          if (typeof msg.payload === 'object') this.device.tuyaGet(msg.payload)
          else if (typeof msg.payload === 'number') this.device.tuyaGet({ dps: msg.payload })
          break
        case 'CONTROL':
          this.device.tuyaControl(msg.payload.action, msg.payload.value)
          break
        case 'getDataModel':
          msg.payload = this.device.getServices()
          send(msg)
          break
      }
      done()
    }

    onDeviceStatus(state, data) {
      (this.config.outputs > 1) && data && this.send([null, { payload: { state, ...data } }])
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
          const errorShortText = this.device.isConnected && JSON.stringify(data?.context?.message) || `Can't find device`
          this.status({ fill: 'red', shape: 'ring', text: `${state}: ${errorShortText}` })
          break
      }
    }

    onDeviceData(ev, payload) {
      //this.log(`-- onDeviceData [event:${ev}]: ${JSON.stringify(payload?.data)}, dps:${this.dps}, isArray:${Array.isArray(this.dps)}, type:${typeof this.dps}`)
      if (this.dps && !Array.isArray(this.dps)) {
        const dps = payload?.data?.dps || payload?.dps
        if (!dps || (dps[this.dps] === undefined)) return
        payload = dps[this.dps]
      }

      this.send({ payload })
    }

    // get({gwId = '', devId = '', uid = '', t = '', data, cid, ctype, t}) { // ???
    //   data = {
    //     cid: '',
    //     ctype: 0,
    //     t: t === 'int' ? Date.now() : Date.now().toString(),
    //     ...data}
    //   this.device.tuyaGet({gwId, devId, uid, t})
    // }
  }

  RED.nodes.registerType('tuya-device', DeviceNode)
}
