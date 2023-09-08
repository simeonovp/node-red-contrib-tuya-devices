const TuyaDevice = require('tuyapi')

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
      this.config = config
      this.project = config.project && RED.nodes.getNode(config.project)
      this.cloudData = this.project && this.project.getCloudDevice(config.id) || {}

      this.shouldTryReconnect = true
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

      this.project && this.project.register(this)

      // Deregister from BrokerNode when this node is deleted or restarted
      this.on('close', (done) => {
        this.project && this.project.unregister(this)
        this.closeComm()
        done()
      })
  
      const connectionParams = {
        id: this.config.deviceId,
        key: this.config.localKey,
        ip: this.deviceIp,
        issueGetOnConnect: false,
        nullPayloadOnJSONError: false,
        version: this.tuyaVersion,
        issueRefreshOnConnect: false,
      }
      this.log(`${JSON.stringify(connectionParams)}`)
      this.tuyaDevice = new TuyaDevice(connectionParams)
      this.lastData = null
  
      // Add event listeners
      this.tuyaDevice.on('connected', () => {
        this.deviceIp = this.tuyaDevice.device.ip
        this.log(`Connected to device! name:${this.config.name}, ip:${this.deviceIp}`)
        this.setStatus(CLIENT_STATUS.CONNECTED)
        this.tuyaGet()
      })

      this.tuyaDevice.on('disconnected', () => {
        this.setStatus(CLIENT_STATUS.DISCONNECTED)
        this.log(`Disconnected from tuyaDevice. shouldTryReconnect=${this.shouldTryReconnect}`)
        this.lastData = null
        if (this.shouldTryReconnect) this.retryConnection()
      })

      this.tuyaDevice.on('error', (error) => {
        // Anonymize
        this.setStatus(CLIENT_STATUS.ERROR, { message: `Error: ${JSON.stringify(error)}` })
        this.log(`Error from tuyaDevice. shouldTryReconnect=${this.shouldTryReconnect}, error${JSON.stringify(error)}`)
        this.lastData = null
        if ((typeof error === 'string') && error.startsWith('Timeout waiting for status response')) {
          this.log(`This error can be due to invalid DPS values. Please check the dps values in the payload !!!!`)
        }
        if (this.shouldTryReconnect) this.retryConnection()
      })

      this.tuyaDevice.on('dp-refresh', (data) => {
        if (this.shouldSubscribeRefreshData) {
          this.setStatus(CLIENT_STATUS.CONNECTED)
          this.lastData = data
          this.emit ('tuya-data', 'data', this.lastDataMsg)
        }
      })

      this.tuyaDevice.on('data', (data) => {
        if (this.shouldSubscribeData) {
          this.setStatus(CLIENT_STATUS.CONNECTED)
          this.lastData = data
          this.emit ('tuya-data', 'dp-refresh', this.lastDataMsg)
        }
      })

      // Initial state
      setTimeout(() => { this.setStatus(CLIENT_STATUS.DISCONNECTED) }, 500)

      // Start probing
      if (config.autoStart) this.startComm()
      else this.log('Auto start probe is disabled')
    }

    tuyaSet(data) { this.tuyaDevice.set(data) }
    tuyaRefresh(data) { this.tuyaDevice.refresh(data) }
    tuyaGet(data) { this.tuyaDevice.get(data) }
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

    get lastDataMsg() { return { data: this.lastData, deviceId: this.config.deviceId, deviceName: this.config.name } }
    get isConnected() { return this.tuyaDevice && this.tuyaDevice.isConnected() }
    
    get context() { return {
      deviceVirtualId: this.config.deviceId,
      deviceIp: this.deviceIp,
      deviceKey: this.config.localKey,
      deviceName: this.config.name,
    } }

    enableNode() {
      this.log('enableNode(): enabling the node', this.id)
      this.startComm()
    }

    disableNode(){
      this.log('disableNode(): disabling the node', this.id)
      this.closeComm()
    }

    startComm() {
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
      this.tuyaDevice.disconnect()
      this.setStatus(CLIENT_STATUS.DISCONNECTED)
    }

    findDevice() {
      this.setStatus(CLIENT_STATUS.CONNECTING)
      this.log('findDevice(): Initiating the find command')
      this.tuyaDevice.find({ timeout: parseInt(this.findTimeout / 1000) })
        .then(() => {
          this.log('findDevice(): Found device, going to connect')
          // Connect to device
          this.connectDevice()
        })
        .catch((e) => {
          // We need to retry
          this.setStatus(CLIENT_STATUS.ERROR, { message: e.message })
          this.setStatus(CLIENT_STATUS.DISCONNECTED)
          if (this.shouldTryReconnect) {
            this.log('findDevice(): Cannot find the device, re-trying...')
            this.findTimeoutHandler = setTimeout(() => this.findDevice(), this.retryTimeout)
          } 
          else this.log('findDevice(): not retrying the find as shouldTryReconnect = false')
        })
    }

    connectDevice() {
      clearTimeout(this.findTimeoutHandler)
      if (!this.isConnected) {
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
      else {
        this.log('connectDevice() : already connected. skippig the connect call')
        this.setStatus(CLIENT_STATUS.CONNECTED)
      }
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

    setStatus(status, data = {}) {
      if (this.deviceStatus != status) {
        this.deviceStatus = status
        this.emit ('tuya-status', status, { context: Object.assign(data, this.context)})
      }
    }

    //---
    updateSchema(msg, send, done) {
    //{"payload":{"data":{"dps":{"1":true,"2":100,"3":25,"101":25,"103":100,"104":0,"105":false,"106":"OK","108":true,"109":0,"110":"BUSHUI","111":0}},"deviceId":"bfabad1dc51e0d4560r1av","deviceName":"WellWaterLevel"},"_msgid":"900bccf287fe8f73"}
    }
  }

  RED.nodes.registerType('tuya-local-device', LocalDevice)
}
