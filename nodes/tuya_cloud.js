const tuyacloud = require('tuya-cloud-sdk-nodejs-ex')

module.exports = function (RED) {
  'use strict'

  const Config = tuyacloud.common.Config
  const UserClient = tuyacloud.client.user.UserClient
  const DeviceClient = tuyacloud.client.device.DeviceClient
  const DeviceControlClient = tuyacloud.client.deviceControl.DeviceControlClient
  const HomeClient = tuyacloud.client.home.HomeClient
  const Region = tuyacloud.common.Region

  class Cloud {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.region = this.setRegion(config.region)
      this.userId = config.userId
      this.isInit = false
      this.deviceId = config.deviceId
      //this.init()
    }

    async init() {
      if (this.isInit) return true
      this.log('init')
      Config.init(this.credentials?.accessId, this.credentials?.accessKey, this.region, true)
      if (this.userId) {
        this.isInit = true
        return false
      }
      const userId = await this.getUserId(this.deviceId)
      this.isInit = !!userId
      if (!userId) false
      this.log('init success')
      return true
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
    async getUserId(deviceId) {
      if (!deviceId) {
        this.error('_getuid() requires deviceID parameter')
        return Promise.resolve(0)
      }
      return new Promise((resolve) => { 
        DeviceClient.getDevice(deviceId, (err, data) => {
          if (err) {
            resolve(0)
            return 
          }

          this.userId = data?.result?.uid
          this.log('Recognized user ID: ' + this.userId)
          this.emit('status', 'userId')
          this.emit('response', { command: { name: 'DeviceClient.getDevice', deviceId }, data })
          resolve(data)
        })
      })
    }

    getDeviceList(userId, last_row_key, callback) {
      this.isInit && DeviceClient.getDeviceListByUid(userId, last_row_key, callback)
    }

    downloadIcon(iconUrl, file, callback) {
      this.isInit && DeviceClient.getDevicesIcon(iconUrl, file, callback)
    }

    getDeviceFunctions(deviceId, callback) {
      this.isInit && DeviceClient.getDeviceFunctions(deviceId, callback) 
    }

    getDeviceFunctionByCategory(category, callback) {
      this.isInit && DeviceClient.getDeviceFunctionByCategory(category, callback)
    }

    getDeviceSpecifications(deviceId, callback) {
      this.isInit && DeviceControlClient.getDeviceSpecifications(deviceId, callback)
    }

    getDeviceProperties(deviceId, callback) {
      this.isInit && DeviceControlClient.getDeviceProperties(deviceId, callback)
    }

    getDeviceDataModel(deviceId, callback) {
      this.isInit && DeviceControlClient.getDeviceDataModel(deviceId, callback)
    }
 
    async getUserHomes(userId)
    {
      return new Promise((resolve, reject) => {
        HomeClient.getUserHomes(userId, (err, data) => err && reject(err) || resolve(data))
      })
    }
 
    async getHomeRoomsById(homeId)
    {
      return new Promise((resolve, reject) => {
        HomeClient.getHomeRoomsById(homeId, (err, data) => err && reject(err) || resolve(data))
      })
    }
 
    async getRoomDevices(homeId, roomId)
    {
      return new Promise((resolve, reject) => {
        HomeClient.getRoomDevices(homeId, roomId, (err, data) => err && reject(err) || resolve(data))
      })
    }

    //--------------------------
    
    async getDeviceListAsync(userId, last_row_key, callback) {
      if (!await this.init()) return
      DeviceClient.getDeviceListByUid(userId, last_row_key, callback)
    }

    async downloadIconAsync(iconUrl, file, callback) {
      if (!await this.init()) return
      DeviceClient.getDevicesIcon(iconUrl, file, callback) 
    }

    async getDeviceFunctionsAsync(deviceId, callback) {
      if (!await this.init()) return
      DeviceClient.getDeviceFunctions(deviceId, callback)
    }

    async getDeviceFunctionByCategoryAsync(category, callback) {
      if (!await this.init()) return
      DeviceClient.getDeviceFunctionByCategory(category, callback)
    }

    async getDeviceSpecificationsAsync(deviceId, callback) {
      if (!await this.init()) return
      DeviceControlClient.getDeviceSpecifications(deviceId, callback)
    }

    async getDevicePropertiesAsync(deviceId, callback) {
      if (!await this.init()) return
      DeviceControlClient.getDeviceProperties(deviceId, callback)
    }

    async getDeviceDataModelAsync(deviceId, callback) {
      if (!await this.init()) return
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
