const tuyacloud = require('tuya-cloud-sdk-nodejs-ex')

module.exports = function (RED) {
  'use strict'

  const Config = tuyacloud.common.Config
  const UserClient = tuyacloud.client.user.UserClient
  const DeviceClient = tuyacloud.client.device.DeviceClient
  const DeviceControlClient = tuyacloud.client.deviceControl.DeviceControlClient
  const Region = tuyacloud.common.Region

  class Cloud {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.region = this.setRegion(config.region)
      this.userId = config.userId
      this.isInit = false
      this.deviceId = config.deviceId
      //init()
    }

    init() {
      if (this.isInit) return
      this.log('init')
      Config.init(this.credentials?.accessId, this.credentials?.accessKey, this.region, true)
      this.userId = this.userId || this.getUserId(this.deviceId)
      this.isInit = true
    }

    setRegion(region) {
      switch (region) {
        case 'cn': return this.region = Region.URL_CN
        case 'us': return this.region = Region.URL_US
        case 'eu': return this.region = Region.URL_EU
        case 'in': return this.region = Region.URL_IN
        default: return this.region = Region.URL_EU
      }
    }

    // Get user ID (UID) for deviceid
    getUserId(deviceId, callback) {
      if (!deviceId) return this.error('_getuid() requires deviceID parameter')
      DeviceClient.getDevice(deviceId, (err, data) => {
        if (err) {
          this.error(err)
          return 
        }

        this.userId = data?.result?.uid
        this.log('Recognized user ID: ' + this.userId)
        this.emit('status', 'userId')
        this.emit('response', { command: { name: 'DeviceClient.getDevice', deviceId }, data })
        callback && callback(data)
      })
    }

    getDeviceList(userId, last_row_key, callback) {
      init()
      DeviceClient.getDeviceListByUid(userId, last_row_key, callback)
    }

    downloadIcon(iconUrl, file, callback) {
      init()
      DeviceClient.getDevicesIcon(iconUrl, file, callback)
    }

    getDeviceFunctions(deviceId, callback) {
      init()
      DeviceClient.getDeviceFunctions(deviceId, callback)
    }

    getDeviceFunctionByCategory(category, callback) {
      init()
      DeviceClient.getDeviceFunctionByCategory(category, callback)
    }

    getDeviceSpecifications(deviceId, callback) {
      init()
      DeviceControlClient.getDeviceSpecifications(deviceId, callback)
    }

    getDeviceProperties(deviceId, callback) {
      init()
      DeviceControlClient.getDeviceProperties(deviceId, callback)
    }

    getDeviceDataModel(deviceId, callback) {
      init()
      DeviceControlClient.getDeviceDataModel(deviceId, callback)
    }
    
    //postDeviceCommand
  }

  RED.nodes.registerType('tuya-cloud', Cloud, {
    credentials: {
      accessId: { type: 'text' },
      accessKey: { type: 'password' }
    }
  })
}
