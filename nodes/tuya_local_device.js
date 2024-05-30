const TuyaDevice = require('tuyapi')
const {MessageParser, CommandType} = require('tuyapi/lib/message-parser');


module.exports = function (RED) {
  'use strict'

  const CLIENT_STATUS = {
    DISCONNECTED: 'disconnected',
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    ERROR: 'error',
  }
  
  const EVENT_MODES = {
    BOTH: 'event-both',
    DATA: 'event-data',
    DP_REFRESH: 'event-dp-refresh',
  }
  
  class LocalDevice {
    constructor (config) {
      RED.nodes.createNode(this, config)
      this.name = config.name
      this.project = config.project && RED.nodes.getNode(config.project)
      //this.cloudData = this.project && this.project.getCloudDevice(config.deviceId) || {}
      this.devId = config.deviceId
      this.gateway = config.gateway && RED.nodes.getNode(config.gateway)
      this.cid = config.cid || config.node_id || ''
      this.bind_space_id = config.bind_space_id || ''
      this.autoStart = config.autoStart && !this.cid

      this.shouldTryReconnect = !this.cid
      this.shouldSubscribeData = true
      this.shouldSubscribeRefreshData = true
      this.deviceIp = config.ip || ''
      this.eventMode = config.eventMode || EVENT_MODES.BOTH
  
      this.retryTimeout = parseInt(config.retryTimeout) || 1000
      if (this.retryTimeout <= 0) this.retryTimeout = 1000
      this.findTimeout = parseInt(config.findTimeout) || 1000
      if (this.retryTimeout <= 0) this.findTimeout = 1000
      this.tuyaVersion = config.tuyaVersion || '3.1'

      this.deviceStatus = null
      this.findTimeoutHandler = null
      this.retryTimerHandler = null

      this.project?.register(this)
      this.propList = null // will be sampled on demand

      // Deregister from BrokerNode when this node is deleted or restarted
      this.on('close', this.onClose.bind(this))
  
      const connectionParams = {
        ip: this.deviceIp,
        port: config.port && parseInt(config.port) || 6668,
        id: this.devId,
        gwID: this.gateway?.deviceId || this.devId,
        key: config.localKey,
        //productKey: '', //(currently unused)
        version: this.tuyaVersion,
        //nullPayloadOnJSONError: false,
        issueGetOnConnect: false,
        nullPayloadOnJSONError: false,
        issueRefreshOnConnect: false,
      }
      this.log(`${JSON.stringify(connectionParams)}`)
      this.tuyaDevice = this.gateway.tuyaDevice || new TuyaDevice(connectionParams)
      this.lastData = null
      this.maxFindRetry = 3
      this.findRetry = 0
  
      // Add event listeners
      this.connectedEventHandler = this.onConnected.bind(this)
      this.disconnectedEventHandler = this.onDisconnected.bind(this)
      this.errorEventHandler = this.onError.bind(this)
      this.dpRefreshEventHandler = this.onDpRefresh.bind(this)
      this.dataEventHandler = this.onData.bind(this)
      this.findEventHandler = this.onFind.bind(this)
   
      // Initial state
      process.nextTick(() => this.setStatus(CLIENT_STATUS.DISCONNECTED))
    }

    init() {
      this.log('Init')
      this.tuyaDevice.on('connected', this.connectedEventHandler)
      this.tuyaDevice.on('disconnected', this.disconnectedEventHandler)
      this.tuyaDevice.on('error', this.errorEventHandler)
      this.tuyaDevice.on('dp-refresh', this.dpRefreshEventHandler)
      this.tuyaDevice.on('data', this.dataEventHandler)
      this.tuyaDevice.on('find', this.findEventHandler)
      
      // Start probing
      if (this.autoStart) this.startComm()
      else this.log('Auto start probe is disabled')
    }

    deinit() {
      this.log('Deinit')
      this.tuyaDevice.off('connected', this.connectedEventHandler)
      this.tuyaDevice.off('disconnected', this.disconnectedEventHandler)
      this.tuyaDevice.off('error', this.errorEventHandler)
      this.tuyaDevice.off('dp-refresh', this.dpRefreshEventHandler)
      this.tuyaDevice.off('data', this.dataEventHandler)
      this.tuyaDevice.off('find', this.findEventHandler)
    }

    register(device) {
      // init on first node attached
      if (!this.listenerCount('tuya-status')) this.init()
    }

    unregister(device) {
      // deinit on last node detached
      if (!this.listenerCount('tuya-status')) this.deinit()
    }

    onClose(done) {
      this.project?.unregister(this)
      this.closeComm()
      this.deinit()
      done()
    }
    
    onConnected() {
      this.deviceIp = this.tuyaDevice.device.ip
      this.log(`Connected to device! name:${this.name}, ip:${this.deviceIp}`)
      this.setStatus(CLIENT_STATUS.CONNECTED)
      if (!this.cid) this.tuyaGet({devId: this.id})
    }

    onDisconnected() {
      this.setStatus(CLIENT_STATUS.DISCONNECTED)
      this.log(`Disconnected from tuyaDevice. shouldTryReconnect=${this.shouldTryReconnect}`)
      this.lastData = null
      if (this.shouldTryReconnect) this.retryConnection()
    }
  
    onError(error) {
      // Anonymize
      this.setStatus(CLIENT_STATUS.ERROR, { message: `Error: ${JSON.stringify(error)}` })
      this.log(`Error from tuyaDevice. shouldTryReconnect=${this.shouldTryReconnect}, error${JSON.stringify(error)}`)
      this.lastData = null
      if ((typeof error === 'string') && error.startsWith('Timeout waiting for status response')) {
        this.log(`This error can be due to invalid DPS values. Please check the dps values in the payload !!!!`)
      }
      if (this.shouldTryReconnect) this.retryConnection()
    }

    onDpRefresh(payload, commandByte, sequenceN) {
      //this.log('-- onDpRefresh payload:' + JSON.stringify(payload))
      if (!payload) return
      if (this.cid) {
        if (this.cid !== payload?.cid) return
      }
      else {
        if (payload.deviceId && (payload.deviceId !== this.devId)) return
      }

      if (this.shouldSubscribeRefreshData) {
        this.setStatus(CLIENT_STATUS.CONNECTED)
        this.lastData = payload
        this.emit ('tuya-data', 'dp-refresh', this.lastDataMsg)
      }
    }
    
    onData(payload, commandByte, sequenceN) {
      //this.log('-- onData payload:' + JSON.stringify(payload) )
      if (!payload) return
      if (this.cid) {
        if (this.cid !== payload.cid) return
      }
      else {
        if (payload.deviceId && (payload.deviceId !== this.devId)) return
      }

      if (this.shouldSubscribeData) {
        this.setStatus(CLIENT_STATUS.CONNECTED)
        this.lastData = payload
        this.emit ('tuya-data', 'data', this.lastDataMsg)
      }
    }
    
    onFind(payload) {
      //this.log(`-- onFind (retry ${this.findRetry}): ${JSON.stringify(payload)}`)
      this.emit ('tuya-find', this.id, payload)
    }

    tuyaSet(options) { 
      // options = {
      //   multiple: false,
      //   data: {}, //{dps1: ..., ...}
      //   dps: 1,
      //   set: '', // dps value
      //   shouldWaitForResponse: false,
      //   isSetCallToGetData: false,
      // }
      options = {
        devId: this.devId,
        cid: this.cid || undefined,
        ...options
      }
      this.log(`-- tuyaSet(${JSON.stringify(options)})`)
      this.tuyaDevice.set(options) 
    }

    tuyaRefresh(data) { 
      this.tuyaDevice.refresh({
        devId: this.devId,
        cid: this.cid,
        ...data //requestedDPS: [], schema: true
      })
    }

    tuyaGet(data) { 
      this.tuyaDevice.get({
        devId: this.devId,
        cid: this.cid,
        ...data //dps: 1, schema: true
      }) 
    }

    get properties() {
      if (!this.propList) this.propList = this.project?.getProperties(this.devId)
      return this.propList
    }

    setMultipleDps(data) {
      const dpsIdRegex = /^\d+$/
      const options = { multiple: true, data: {} }
      for (const key in data) {
        if (dpsIdRegex.test(key)) {
          options.data[key] = data[key]
        }
        else {
          const property = this.properties?.find(p => p.code === key)
          if (property) options.data[property.abilityId] = data[key]
          else this.warn(`setMultipleDps code '${key}' not found, data:${JSON.stringify(data)}`)
        }
      }
      if (Object.entries(options.data).length) this.tuyaSet(options)
    }
    
    tuyaControl(action, value) { 
      switch (action) {
        case 'CONNECT':
          if (!this.isConnected) this.startComm()
          break
        case 'DISCONNECT':
          this.closeComm()
          break
        case 'SET_FIND_TIMEOUT':
          if (!isNaN(value) && value > 0) {
            this.setFindTimeout(value)
          }
          else this.log('Invalid find timeout ! - ' + value)
          break
        case 'SET_RETRY_TIMEOUT':
          if (!isNaN(value) && value > 0) {
            this.setRetryTimeout(value)
          } 
          else this.log('Invalid retry timeout ! - ' + value)
          break
        case 'RECONNECT':
          if (this.isConnected) this.closeComm()
          this.startComm()
          break
        case 'SET_EVENT_MODE':
          this.shouldSubscribeData = true
          this.shouldSubscribeRefreshData = true
          // if any incorrect value set the event mode as BOTH
          this.eventMode = EVENT_MODES.BOTH
          if (value === EVENT_MODES.DATA) {
            this.shouldSubscribeRefreshData = false
            this.eventMode = EVENT_MODES.DATA
          } 
          else if (value === EVENT_MODES.DP_REFRESH) {
            this.shouldSubscribeData = false
            this.eventMode = EVENT_MODES.DP_REFRESH
          }
          this.log(`SET_EVENT_MODE : shouldSubscribeData=${this.shouldSubscribeData}, shouldSubscribeRefreshData=${this.shouldSubscribeRefreshData}`)
          break
      }
    }

    get lastDataMsg() { return { data: this.lastData, deviceId: this.devId, deviceName: this.name } }
    get isConnected() { return this.tuyaDevice && this.tuyaDevice.isConnected() }
    
    getServices() {
      this.project?.getServices(this.devId)
    }

    enableNode() {
      this.log('enableNode(): enabling the node ' + this.id)
      if (this.autoStart) this.startComm()
    }

    disableNode() {
      this.log('disableNode(): disabling the node ' + this.id)
      this.closeComm()
    }

    updateTuyaDevice(announcement) {
      if (!announcement) return
      // this.tuyaDevice
      const thisID = announcement.gwId
      const thisIP = announcement.ip

      // Try auto determine power data - DP 19 on some 3.1/3.3 devices, DP 5 for some 3.1 devices
      const thisDPS = announcement.dps
      if (thisDPS && typeof thisDPS[19] === 'undefined') {
        this.tuyaDevice._dpRefreshIds = [4, 5, 6]
      } 
      else {
        this.tuyaDevice._dpRefreshIds = [18, 19, 20]
      }

      // Add to array if it doesn't exist
      if (!this.tuyaDevice.foundDevices.some(e => (e.id === thisID && e.ip === thisIP))) {
        this.tuyaDevice.foundDevices.push({id: thisID, ip: thisIP})
      }

      if (!this.all &&
        ((this.tuyaDevice.device.id === thisID) || (this.tuyaDevice.device.ip === thisIP))) {
        this.tuyaDevice.device.ip = announcement.ip
        this.tuyaDevice.device.id = announcement.gwId
        this.tuyaDevice.device.gwID = announcement.gwId
        this.tuyaDevice.device.productKey = announcement.productKey
        if (this.tuyaDevice.device.version !== announcement.version) {
          this.tuyaDevice.device.version = announcement.version
          this.tuyaDevice.device.parser = new MessageParser({
            key: this.tuyaDevice.device.key,
            version: this.tuyaDevice.device.version
          })
        }
      }
    }

    startComm() {
      const announcement = this.project?.getDeviceAnnouncement(this.devId)
      if (announcement) {
        this.log('startComm using registered device')
        this.updateTuyaDevice(announcement)
        return
      }

      this.log('Auto start probe on connect...')
      // This 1 sec timeout will make sure that the diconnect happens ..
      // otherwise connect will not hanppen as the state is not changed
      this.findTimeoutHandler = setTimeout(() => {
        this.shouldTryReconnect = true
        this.log(`startComm(): Connecting to Tuya, params findTimeout:${this.findTimeout}, retryTimeout:${this.retryTimeout}`)
        this.findDevice()
      }, 1000)
    }

    closeComm() {
      this.log('closeComm(): Cleaning up the state')
      this.log('closeComm(): Clearing the find timeout handler')
      clearTimeout(this.findTimeoutHandler)
      this.shouldTryReconnect = false
      this.log('closeComm(): Disconnecting from Tuya Device')
      if(!this.gateway) this.tuyaDevice.disconnect()
      this.setStatus(CLIENT_STATUS.DISCONNECTED)
    }

    findDevice() {
      this.setStatus(CLIENT_STATUS.CONNECTING)
      if (this.gateway) {
        this.connectDevice() //TODO check GW connected
        return
      }
      if (this.maxFindRetry < this.findRetry) return
      //this.log('findDevice(): Initiating the find command')
      this.tuyaDevice.find({ timeout: parseInt(this.findTimeout / 1000) })
        .then(() => {
          this.log('findDevice(): Found device, going to connect')
          this.findRetry = 0
          // Connect to device
          this.connectDevice()
        })
        .catch((e) => {
          // We need to retry
          this.setStatus(CLIENT_STATUS.ERROR, { message: e.message })
          this.setStatus(CLIENT_STATUS.DISCONNECTED)
          this.findRetry++
          if (this.shouldTryReconnect) {
            this.log('findDevice(): Cannot find the device, re-trying...')
            this.findTimeoutHandler = setTimeout(() => this.findDevice(), this.retryTimeout)
          } 
          else this.log('findDevice(): not retrying the find as shouldTryReconnect = false')
        })
    }

    connectDevice() {
      this.findTimeoutHandler && clearTimeout(this.findTimeoutHandler)
      this.findTimeoutHandler = null
      if (this.isConnected) {
        this.log('connectDevice() : already connected. skippig the connect call')
        this.setStatus(CLIENT_STATUS.CONNECTED)
        return
      }

      this.setStatus(CLIENT_STATUS.CONNECTING)

      const connectHandle = this.tuyaDevice.connect()
      connectHandle.catch((e) => {
        this.setStatus(CLIENT_STATUS.DISCONNECTED)
        this.log(`connectDevice(): An error had occurred with tuya API on connect method : ${JSON.stringify(e)}`)
        if (this.shouldTryReconnect) {
          this.log('connectDevice(): retrying the connect')
          if (this.findTimeoutHandler) clearTimeout(this.findTimeoutHandler)
          this.findTimeoutHandler = setTimeout(() => this.findDevice(), this.retryTimeout)
        } 
        else this.log('connectDevice(): not retrying the find as shouldTryReconnect = false')
      })
    }

    retryConnection() {
      clearTimeout(this.retryTimerHandler)
      this.retryTimerHandler = setTimeout(() => {
        this.log('Retrying connection...')
        this.connectDevice()
      }, this.retryTimeout)
      this.log(`Will try to reconnect after ${this.retryTimeout} milliseconds`)
    }

    setFindTimeout(newTimeout){
      this.log('setFindTimeout(): Setting new find timeout :' + newTimeout)
      this.findTimeout = newTimeout
    }

    setRetryTimeout(newTimeout) {
      this.log('setRetryTimeout(): Setting new retry timeout :' + newTimeout)
      this.retryTimeout = newTimeout
    }

    setStatus(status, data = {}) { //??
      const context = {
        deviceVirtualId: this.devId,
        deviceIp: this.deviceIp,
      }
  
      if (this.deviceStatus != status) {
        this.deviceStatus = status
        this.emit ('tuya-status', status, { context: Object.assign(data, context)})
      }
    }
  }

  RED.nodes.registerType('tuya-local-device', LocalDevice)
}
