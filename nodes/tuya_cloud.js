const request = require('request')
const tuyacloud = require('tuya_cloud_sdk_nodejs')

module.exports = function (RED) {
  'use strict'

  const Config = tuyacloud.common.Config
  const UserClient = tuyacloud.client.user.UserClient
  const DeviceClient = tuyacloud.client.device.DeviceClient
  const Region = tuyacloud.common.Region

  class Cloud {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.region = this._setRegion(config.region)
      //sip TODO
      config.accessId = 'u3rxup7gqvu3kmndajvp' //--
      config.accessKey = 'b760adbb9610400c92ff39089c4ddb4f' //--
      Config.init(config.accessId, config.accessKey, this.region, true)
      this.userId = config.userId || this.getUserId(config.deviceId)
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
    getUserId(deviceId, callback) {
      if (!deviceId) return this.error('_getuid() requires deviceID parameter')
      DeviceClient.getDevice(deviceId, (err, data) => {
        if (err) {
          this.error(err)
          return 
        }
        //---
        // const device = {
        //   "result": {
        //     "active_time": 1692598996,
        //     "biz_type": 18,
        //     "category": "cz",
        //     "create_time": 1692598996,
        //     "icon": "smart/icon/bay1636603958523RDo8/34049fbbd9f45962e61b7c521063f39c.png",
        //     "id": "bf466388bb265eb6b2cf8i",
        //     "ip": "37.167.142.124",
        //     "lat": "",
        //     "local_key": "IoA)/Gs_)M]DGSA)",
        //     "lon": "",
        //     "model": "ALUSSO DE-CWG01",
        //     "name": "SmartGateway_01",
        //     "online": true,
        //     "owner_id": "159643150",
        //     "product_id": "vt13cbm0ikyeib7c",
        //     "product_name": "ALUSSO Smart WiFi Gateway Plug",
        //     "status": [
        //       {
        //         "code": "switch_1",
        //         "value": true
        //       }
        //     ],
        //     "sub": true,
        //     "time_zone": "+02:00",
        //     "uid": "eu1688047290107Ty12z",
        //     "update_time": 1693522855,
        //     "uuid": "6b47b9e48c6ff40a"
        //   },
        //   "success": true,
        //   "t": 1693536882261,
        //   "tid": "e64506ea487211ee9a70760d0d3c40d3"
        // }
        //this.log('-- Response getDevice: ' + JSON.stringify(data, null, 2))
        this.userId = data?.result?.uid
        this.log('Recognized user ID: ' + this.userId)
        this.emit('status', 'userId')
        this.emit('response', { command: { name: 'DeviceClient.getDevice', deviceId }, data })
        callback && callback(data)
      })
    }

    getDeviceList(userId, last_row_key, callback) {
      DeviceClient.getDeviceListByUid(userId, last_row_key, callback)
    }
  }

  RED.nodes.registerType('tuya-cloud', Cloud, {
    credentials: {
      accessId: { type: 'text' },
      accessKey: { type: 'password' }
    }
  })
}
