const request = require('request')
const tuyacloud = require('tuya_cloud_sdk_nodejs')

module.exports = function (RED) {
  'use strict'

  const Config = tuyacloud.common.Config
  const UserClient = tuyacloud.client.user.UserClient
  const DeviceClient = tuyacloud.client.device.DeviceClient
  const Region = tuyacloud.common.Region

  class TuyaManager {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.region = this._setRegion(config.region)
      Config.init(config.accessId, config.accessKey, this.region)
      this.userId = config.userId || this._getuid(config.deviceId)
    }

    setNodeStatus(fill, text, shape) {
      if (this.userId) {
        this.status({
          fill: fill || 'green',
          text: text || 'online',
          shape: shape || 'dot',
        })
      } 
      else {
        this.status({
          fill: 'red',
          text: text || 'offline',
          shape: 'ring',
        })
      }
    }

    _setRegion(region) {
      switch (region) {
        case 'cn': return this.region = Region.URL_CN
        case 'us': return this.region = Region.URL_US
        case 'eu': return this.region = Region.URL_EU
        case 'in': return this.region = Region.URL_IN
        default: return this.region = Region.URL_EU
      }
    }

    // Get user ID (UID) for deviceid
    async _getuid(deviceId) {
      if (!deviceId) return this.error('_getuid() requires deviceID parameter')
      if (!DeviceClient) return this.error('-- DeviceClient:' + DeviceClient)
      DeviceClient.getDevice(deviceId, (err, data) => {
        if (err) {
          this.error(err)
          return 
        }
        this.userId = data?.result?.uid
        this.log('Recognized user ID: ' + this.userId)
        this.setNodeStatus()
      })
    }
  }

  RED.nodes.registerType('tuya-manager', TuyaManager)
}
