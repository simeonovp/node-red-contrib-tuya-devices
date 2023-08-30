const request = require('request')
const tuyacloud = require('tuya_cloud_sdk_nodejs')

module.exports = function (RED) {
  'use strict'

  const Config = tuyacloud.common.Config
  const UserClient = tuyacloud.client.user.UserClient
  const Region = tuyacloud.common.Region

  class TuyaManager {
    constructor (config) {
      RED.nodes.createNode(this, config)

      Config.init(config.accessId, config.accessKey, config.region || Region.URL_EU)
      this.userId = config.userId || this._getuid(config.deviceid)
      this.setNodeStatus()
    }

    setNodeStatus(fill, text, shape) {
      if (this.userId) {
        this.status({
          fill: fill || green,
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

    // Get user ID (UID) for deviceid
    async _getuid(deviceId) {
      if (!deviceId) return this.error_json(ERR_PARAMS, '_getuid() requires deviceID parameter')
      DeviceClient.getDevice(deviceId, (err, data) => {
        if (err) {
          this.error(err)
          return 
        }
        this.userId = data?.result?.uid
        this.setNodeStatus()
      })
    }
  }

  RED.nodes.registerType('tuya-manager', TuyaManager)
}
