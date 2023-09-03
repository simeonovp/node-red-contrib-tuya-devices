//const request = require('request')
const path = require('path')
const fs = require('fs')

function JSONparse(json) {
  try {
    return JSON.parse(json)
  }
  catch(err) {
    console.error(`Error JSON.parse(${json}):${err}`)
  }
}

module.exports = function (RED) {
  'use strict'

  class LocalManager {
    constructor (config) {
      this.config = config
      RED.nodes.createNode(this, config)

      const cloudStatusHandler = this.onCloudStatus.bind(this)
      this.cloud = this.config.cloud && RED.nodes.getNode(this.config.cloud)
      if (this.cloud) {
        if (this.cloud.type !== 'tuya-cloud') {
          this.warn('Cloud configuration is wrong or missing, please review the node settings')
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
          this.cloud = null
        }
        else {
          this.cloud.addListener('status', cloudStatusHandler)
        }
      }
  
      this.userId = config.userId || this.cloud?.userId
      this.resDir = path.resolve(path.join(__dirname, '../resources', config.name || 'default'))
      if (!fs.existsSync(this.resDir)) fs.mkdirSync(this.resDir, { recursive: true })
      this.devicesPath = path.join(this.resDir, 'devices.json')
      this.cloudDevices = fs.existsSync(this.devicesPath) && JSONparse(fs.readFileSync(this.devicesPath, 'utf8')) || []
      if (!fs.existsSync(this.devicesPath)) this_updateDevices()

      this.on('close', (done) => {
        this.cloud && this.cloud.removeListener('status', cloudStatusHandler)
        done()
      })

      this.on('input', (msg, send, done) => {
        if (!msg.topic) return done('Empty topic')
        switch (msg.topic) {
          case 'updateDevices':
            this.updateDevices(msg, send, done)
            break
          case 'updateDeviceIcons':
            this.updateDeviceIcons(msg, send, done)
            break
          default:
            return done('Unknown topic')
        }
      })
    }

    onCloudStatus(val) {
      if ((val === 'userId') && !this.userId) {
        this.userId = this.cloud.userId
        this.emit('cloud-status', this.userId && 'Online' || 'Offline')
      }
    }

    async updateDevices(msg, send, done) {
      if (!this.cloud) return this.error('Cloud access not configured')

      const updateDeviceList = (old_devices, json_data) => {
        //TODO
        const devs = json_data.result
        const changed_devices = []
        const unchanged_devices = []
  
        // check to see if anything has changed.  if so, re-download factory-infos and DP mapping
        for (const dev of devs) {
          if (!old_devices[dev.id]) {
            // newly-added device
            changed_devices.push(dev)
            continue
          }
          const old = old_devices.dev_id
          if (old.key !== dev.local_key) {
            // local key changed
            changed_devices.append( dev )
            continue
          }
          if ((!old.icon && dev.icon) || (include_map && !old.mapping)) {
            // icon or mapping added
            changed_devices.push(dev)
            continue
          }
          let is_same = true
          for (const k of DEVICEFILE_SAVE_VALUES) {
            if (dev[k] && (k !== 'icon') && (k != 'last_ip') && (!old[k] || (old[k] !== dev[k]))) {
              is_same = false
              break
            }
          }
          if (!is_same) {
            changed_devices.push(dev)
            continue
          }
          unchanged_devices.push(old)
        }
  
        // if (include_map) {
        //   mappings = await this.getmappings(changed_devices)
        //   for (const productid in mappings) {
        //     for (const dev of changed_devices) {
        //       if (dev.product_id === productid) dev['mapping'] = mappings[productid]
        //     }
        //     // also set unchanged devices just in case the mapping changed
        //     for (const dev of unchanged_devices) {
        //       if (dev.product_id === productid) dev['mapping'] = mappings[productid]
        //     }
        //   }
        // }
  
        this.log('changed: ' + changed_devices.length)
        this.log('unchanged: ' + unchanged_devices.length)
  
        // Filter to only Name, ID and Key
        //return this.filter_devices(changed_devices).concat(unchanged_devices)
      }
  
      const getUserDevices = (uid, last_row_key) => {
        return new Promise((resolve, reject) => {
          this.cloud.getDeviceList(uid, last_row_key, (err, data) => {
            if (err) reject(err)
            else resolve(data)
          })
        })
      }
      
      const getAllUserDevices = async (uid) => {
        let fetches = 0
        let has_more = true
        let total = 0
        const our_result = { 'result': [] }
        let last_row_key
        
        while (has_more) {
          let data = await getUserDevices(uid, last_row_key)
          fetches += 1
          has_more = false
          if (typeof data !== 'object') throw (new Error('Cloud response not object, data: ' + data))
          for(const i in data) {
            if (i === 'result') {
              // by-user-id has the result in 'list' while all-devices has it in 'devices'
              if (data.result?.list && !data.result?.devices) our_result.result = our_result.result.concat(data.result.list)
              else if (data.result?.devices) our_result.result = our_result.result.concat(data.result.devices)
              else console.debug('no devices in response')
    
              if (data.result?.total) total = data.result.total
              if (data.result?.last_row_key) last_row_key = data.result.last_row_key
              has_more = data.result?.has_more || false
            }
            else our_result[i] = data[i]
          }
        }
        our_result['fetches'] = fetches
        our_result['total'] = total
        return our_result
      }

      const old_devices = {}
      if (!this.cloudDevices.length && this.userId) {
        try {
          const data = await getAllUserDevices(this.userId)
          this.cloudDevices = data.result
          const json = JSON.stringify(this.cloudDevices, null, 2)
          fs.createWriteStream(this.devicesPath).write(json)
        } catch(err) { this.error(err) }
      }
      for (const dev of this.cloudDevices) old_devices[dev.id] = dev

      // loop through all devices and build a list of user IDs
      const userIDs = {}
      for (const dev of this.cloudDevices) if (dev.uid) userIDs[dev.uid] = true
      const uidList = Object.keys(userIDs)
      if (uidList.length) {
        // we have at least 1 user id, so fetch the device list again to make sure we have the local key
        // this also gets us the gateway_id for child devices
        for (const uid of uidList) {
          try {
            const data = await getAllUserDevices(uid)
            updateDeviceList(old_devices, data)
          } catch(err) { this.error(err) }
        }
      }
      if (msg && send) {
        msg.devices = this.cloudDevices
        send(msg)
      }
      done && done()
    }

    async updateDeviceIcons(msg, send, done) {
      if (!this.cloud) return this.error('Cloud access needed for _updateDeviceIcons')
      for (const dev of this.cloudDevices) {
        if (dev.icon) {
          const iconPath = path.join(this.resDir, 'icons', dev.icon)
          if (!fs.existsSync(iconPath)) {
            const dir = path.dirname(iconPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            const file = fs.createWriteStream(iconPath)
            await this.cloud.downloadIcon('/' + dev.icon, file, (err) => {
              if (err) {
                fs.unlink(iconPath)
                console.error(`Error downloading image: ${err.message}`)
              }
              else {
                file.close()
                console.log(`Image downloaded as ${iconPath}`)
              }
            })
          }
        }
      }
    }

  }

  RED.nodes.registerType('tuya-project', LocalManager)
}
