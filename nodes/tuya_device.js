module.exports = function (RED) {
  'use strict'

  class DeviceNode {
    constructor (config) {
      RED.nodes.createNode(this, config)
      this.config = config

      this.deviceNode = RED.nodes.getNode(config.device)
      if (this.deviceNode?.type === 'tuya-local-device') {
        this.device = this.deviceNode?.device
        if (!this.device) this.error('Device object is ' + this.device)
      }
      else {
        this.error(`Device node not found, deviceId:'${config.device}'`)
      }

      if (!this.device) {
        this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
        this.device = null
        return
      }
      
      this.dps = /*config.dps && config.dps.includes(',') && config.dps.split(',') ||*/ config.dps
      this.multiDps = !!config.multiDps
      this.outputsMode = (config.outputsMode === undefined) ? parseInt(config.outputs) : parseInt(config.outputsMode)
      if (this.outputsMode === 3) {
        this.outputsCount = config.outputs
        this.outputSelList = config.outputSelList
        if (this.outputSelList === undefined) this.outputSelList = Array.from({ length: config.outputs }, () => true)
      }

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

      if (this.outputsMode === 3) {
        // Map dps (ability IDs) to selected outputs
        this.outputs = {}
        const properties = this.device.properties
        this.outputsCount = properties.length + 1 // index 0 is for data output
        let output = 1
        for (const [index, value] of properties.entries()) {
          const id = value?.id || value?.abilityId
          if (!id || ((index + 1) >= this.outputSelList.length) || !this.outputSelList[index + 1]) continue
          this.outputs[id] = output++
        }
      }
    }

    deinit() {
      if(!this.device) return
      this.device.removeListener('tuya-status', this.deviceStatusHandler)
      this.device.removeListener('tuya-data', this.deviceDataHandler)
      this.device.unregister(this)
    }

    onInput(msg, send, done) {
      this.log(`Recieved input: ${JSON.stringify(msg)}`)
      // spacial threatment for DP nodes or if msg.topic is string (not number for DPS)  
      // (no msg.peration, msg.topic contains SubCommand, msg.payload: parameters)
      const subCommand = msg.topic && (this.dps && !isNaN(this.dps) || (typeof msg.topic === 'string'))
      let operation = msg.operation || msg.payload?.operation || (!subCommand && 'SET')
      delete msg.payload?.operation
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
          else {
            this.device.tuyaSet(msg.options || { //operation: 'SET'
              dps: msg.dps || msg.topic || this.dps || undefined,
              set: msg.payload
            })
            .then(() => {
              //++ send(msg)
              done()
            })
            .catch(err => done(err))
            return
          }
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
        default:
          try {
            //this.log(`-- operation:${operation}, topic:${msg.topic}`)
            msg.payload = this.device.onCommand(msg.topic, msg.payload, (postEvents) => {
              if (postEvents && postEvents.length) this.postMessages(postEvents)
            })
            if ((msg.payload || !isNaN(msg.payload)) && (typeof msg.payload.then !== 'function')) {
              send(msg)
            }
          }
          catch(err)
          {
            done(err.callstack || err)
            return
          }
      }
      done()
    }

    onDeviceStatus(state, data) {
      (this.outputsMode === 2) && data && this.send([null, { payload: { state, ...data } }])
      switch (state) {
        case 'disabled':
          this.status({ fill: 'gray', shape: 'ring', text: state })
          break
        case 'search':
          this.status({ fill: 'yellow', shape: 'ring', text: state })
          break
        case 'connecting':
          this.status({ fill: 'yellow', shape: 'dot', text: state })
          break
        case 'connected':
          this.status({ fill: 'green', shape: 'dot', text: state })
          break
        case 'disconnected':
          this.status({ fill: 'gray', shape: 'dot', text: state })
          break
        case 'error':
          const errorShortText = this.device.isConnected && JSON.stringify(data?.context?.message) || `Can't find device`
          this.status({ fill: 'red', shape: 'ring', text: `${state}: ${errorShortText}` })
          break
      }
    }

    onDeviceData(ev, payload, postEvents) {
      //this.log(`-- onDeviceData [event:${ev}]: ${JSON.stringify(payload?.data)}, dps:${this.dps}, isArray:${Array.isArray(this.dps)}, type:${typeof this.dps}`)
      const buildDpMsg = (dp, val) => {
        const msg = {}
        msg.payload = val
        const prop = this.device.getDpCode(dp)
        if (prop) msg.topic = prop
        const options = this.device.getPropOptions(prop)
        if (options) {
          if (Array.isArray(options)) msg.options = options
          else {
            msg.options = []
            for (const [val, name] of Object.entries(options)) {
              msg.options.push(name)
            }
          }
        }
        return msg
      }

      const sendDpMsg = (dp, val) => this.send(buildDpMsg(dp, val))
      
      const dps = payload?.data?.dps || payload?.dps
      if (this.dps && !Array.isArray(this.dps)) {
        if (!dps || (dps[this.dps] === undefined)) return
        sendDpMsg(this.dps, dps[this.dps])
        if (postEvents && postEvents.length) this.postMessages(postEvents)
        return
      }

      if (this.outputsMode === 3) {
        // Fill messages array for selected outputs
        if ((typeof dps !== 'object') || Array.isArray(dps)) return
        const msgs = Array(this.outputsCount).fill(null)
        msgs[0] = { payload: dps, device: this.name }
        for (const [dp, val] of Object.entries(dps)) {
          const idx = this.outputs[dp]
          if (idx) msgs[idx] = buildDpMsg(dp, val)
        }
        this.send(msgs)
      }

      //[deprecated]
      else if ((this.multiDps) && !Array.isArray(this.dps)) {
        if ((typeof dps !== 'object') || Array.isArray(dps)) return
        for (const [dp, val] of Object.entries(dps)) {
          sendDpMsg(dp, val)
        }
        if (postEvents && postEvents.length) this.postMessages(postEvents)
        return
      }
      else {
        this.send({ payload })
      }
      if (postEvents && postEvents.length) this.postMessages(postEvents)
    }

    postMessages(postEvents) {
      //this.log(`--   postEvents:${JSON.stringify(postEvents)}`)
      for (const event of postEvents) {
        if (typeof event.options === 'object') {
          let options = []
          // case 1: options are as array, convert elements to option objects an put this in array
          if (Array.isArray(event.options)) {
            for (let idx = 0; idx < event.options.length; idx++) {
              options.push({[event.options[idx]]: idx})
            }
          }
          // case 2: options are already as option objects, put this in array
          else options = [event.options]
          this.send({ topic: event.cmd, payload: event.value, options })
        }
        else this.send({ topic: event.cmd, payload: event.value })
      }
    }
  }

  RED.nodes.registerType('tuya-device', DeviceNode)
}
