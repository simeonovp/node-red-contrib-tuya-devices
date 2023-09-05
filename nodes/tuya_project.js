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
      this.db = {}
      this.devicesPath = path.join(this.resDir, 'devices.json')
      this.devices = fs.existsSync(this.devicesPath) && JSONparse(fs.readFileSync(this.devicesPath, 'utf8')) || []
      if (!fs.existsSync(this.devicesPath)) this.updateDevices()

      this.on('close', (done) => {
        this.cloud && this.cloud.removeListener('status', cloudStatusHandler)
        done()
      })
    }

    dbLoadTable(table, filename) {
      filename = filename || (table + '.json')
      const filepath = path.join(this.resDir, filename)
      this.db[table] = fs.existsSync(filepath) && JSONparse(fs.readFileSync(filepath, 'utf8')) || {}
    }

    onCloudStatus(val) {
      if ((val === 'userId') && !this.userId) {
        this.userId = this.cloud.userId
        this.emit('cloud-status', this.userId && 'Online' || 'Offline')
      }
    }

    tryCommand(msg, send, done) {
      if (!msg.topic) return 'Empty topic'
      if (typeof msg.topic !== 'string') return 'Topic must be a string'
      if (!this[msg.topic]) return 'Unknown command ' + msg.topic
      this[msg.topic](msg, send, done)
    }

    async updateDevices(msg, send, done) {
      if (!this.cloud) return done && done('Cloud access not configured')
      const changed_devices = []
      const unchanged_devices = []

      const updateDeviceList = (old_devices, json_data) => {
        //TODO
        const devs = json_data.result
  
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
            changed_devices.push(dev)
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

      if (!this.devices.length && this.userId) {
        try {
          const data = await getAllUserDevices(this.userId)
          this.devices = data.result
          for (const dev of this.devices) {
            const properties = await this.getCloudDeviceData(dev, 'properties', 'getDeviceProperties', 'properties')
            if (properties) Object.assign(dev, properties)
            const model = await this.getCloudDeviceData(dev, 'model', 'getDeviceDataModel', 'dataModel')
            if (model) Object.assign(dev, model)
            await this.updateDeviceIcon(dev)
          }    
          const json = JSON.stringify(this.devices, null, 2)
          fs.createWriteStream(this.devicesPath).write(json)
        } catch(err) { this.error(err) }
      }
      const old_devices = {}
      for (const dev of this.devices) {
        old_devices[dev.id] = dev
      }

      // loop through all devices and build a list of user IDs
      const userIDs = {}
      for (const dev of this.devices) {
        if (dev.uid) userIDs[dev.uid] = true
      }
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
        msg.devices = this.devices
        msg.changed_devices = changed_devices
        msg.unchanged_devices = unchanged_devices
        send(msg)
      }
      done && done()
    }

    async updateDeviceIcon(dev) {
      if (!dev.icon) return
      const iconPath = path.join(this.resDir, 'icons', dev.icon)
      if (fs.existsSync(iconPath)) return
      const dir = path.dirname(iconPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const file = fs.createWriteStream(iconPath)
      await this.cloud.downloadIcon('/' + dev.icon, file, (err) => {
        if (err) {
          fs.unlink(iconPath)
          this.error(`Error downloading image: ${err.message}`)
        }
        else {
          file.close()
          this.log(`Image downloaded as ${iconPath}`)
          return iconPath
        }
      })
    }

    async updateDeviceIcons(msg, send, done) {
      if (!this.cloud) return done('Cloud access needed for _updateDeviceIcons')
      msg.payload = {}
      for (const dev of this.devices) {
        const iconPath = await updateDeviceIcon(dev)
        if (iconPath) msg.payload[dev.id] = iconPath
      }
      send(msg)
      done()
    }

    async updateDeviceFunctionByCategory(msg, send, done) {
      if (!this.cloud) return done('Cloud access needed for getDeviceFunctionByCategory')
      let dirty = false
      for (const dev of this.devices) {
        if (this.functions[dev.category]) continue
        try {
          const data = await new Promise((resolve, reject) => {
            this.cloud.getDeviceFunctionByCategory(dev.category, (err, data) => {
              if (err) reject(err)
              else resolve(data)
            })
          })
          dirty = true
          this.log(`Downloaded functions for ${dev.name}, id:${dev.id}`)
          this.functions[dev.id] = data?.result
        }
        catch(err) {
          this.error(`Error downloading functions for ${dev.name} (id:${dev.id}) : ${err}`)
        }
      }
      if (dirty) {
        msg.payload = JSON.stringify(this.functions, null, 2)
        //fs.createWriteStream(this.catFunctionsPath).write(json)
        send(msg)
      }
      done()
    }

    async getCloudDeviceData(dev, entity, command, table) {
      // if (!this.cloud) throw new Error('Cloud access needed for ' + command)
      // if (!this.cloud[command]) throw new Error('Cloud command not supported ' + command)
      // if (dev[entity]) return dev[entity]
      const data = await new Promise((resolve, reject) => {
        this.cloud[command](dev.id, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
      this.log(`Downloaded ${entity} for ${dev.name}, id:${dev.id}`)
      const val = data?.result && data.result[entity]
      if (val) {
        if (typeof val === 'string') {
          if (val.includes('\\"')) {
            const unescape = (v) => { 
              eval('v = `"${v}"`')
              return v 
            }
            data.result[entity] = unescape(data.result[entity])
          }
          else if (val.startsWith('{')) {
            data.result[entity] = JSONparse(data.result[entity])
          }
        }
        if (table !== entity) {
          data.result[table] = data.result[entity]
          delete data.result[entity]
        }
      }
      return data?.result
    }

    async updateCloudDevicesData(entity, command, table, msg, send, done) {
      table = table || entity
      if (!this.cloud) return done('Cloud access needed for ' + command)
      if (!this.cloud[command]) return done('Cloud command not supported ' + command)
      if (!this.db[table]) this.dbLoadTable(table)
      const col = this.db[table] || {}
      
      let dirty = false
      let devDirty = false
      for (const dev of this.devices) {
        if (col[dev.id]) continue
        try {
          const data = await this.getCloudDeviceData(dev, entity, command, table)
          this.log(`Downloaded ${table} for ${dev.name}, id:${dev.id}`)
          if (data && data[table]) {
            col[dev.id] = data
            if (data[table] && !dev[table]) {
              Object.assign(dev, data)
              devDirty = true
            }
            dirty = true
          }
        }
        catch(err) {
          this.error(`Error downloading ${table} for ${dev.name} (id:${dev.id}) : ${err}`)
        }
      }
      if (dirty) {
        msg.payload = JSON.stringify(col, null, 2)
        const outPath = path.join(this.resDir, table + '.json')
        fs.createWriteStream(outPath).write(msg.payload)
        send(msg)
      }
      if (devDirty) {
        fs.createWriteStream(this.devicesPath).write(JSON.stringify(this.devices, null, 2))
      }
      done()
    }

    updateDeviceFunctions(msg, send, done) {
      return this.updateCloudDevicesData('functions', 'getDeviceFunctions', '', msg, send, done)
    }

    updateDeviceSpecifications(msg, send, done) {
      return this.updateCloudDevicesData('specifications', 'getDeviceSpecifications', '', msg, send, done)
    }

    updateDeviceProperties(msg, send, done) {
      return this.updateCloudDevicesData('properties', 'getDeviceProperties', '', msg, send, done)
    }

    updateDeviceDataModel(msg, send, done) {
      return this.updateCloudDevicesData('model', 'getDeviceDataModel', 'dataModel', msg, send, done)
    }
    
  }

  RED.nodes.registerType('tuya-project', LocalManager)
}
