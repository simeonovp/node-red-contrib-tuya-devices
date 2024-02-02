//const request = require('request')
const path = require('path')
const fs = require('fs')
const DbBase = require('../lib/db')
const translators = require('../lib/translators')

function JSONparse(json) {
  try {
    return JSON.parse(json)
  }
  catch(err) {
    console.error(`Error JSON.parse(${json}):${err}`)
  }
}

function JSONsave(obj, filePath) {
  const json = JSON.stringify(obj, null, 2)
  fs.createWriteStream(filePath).write(json)
}

function sortByKey(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key]
  return sorted
}

module.exports = function (RED) {
  'use strict'

  class Project {
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
      this.localDevices = {}
      this.db = {}
      this.deviceProperties = {}
      this.language = config.language || 'en'
      this.autoTranslate = config.translate
      this.translator = config.translator && translators[config.translator]

      this.dbTranslations = new DbBase({ path: path.join(this.resDir, 'translations.json') })
      if (this.dbTranslations.empty) {
        this.log('first initialize translations')
        this.dbTranslations.data[this.language] = {}
        if (this.language === 'en') this.dbTranslations.data.en['默认服务'] = 'Default Service'
        this.dbTranslations.save(true, true)
      }
      this.manifestDb = new DbBase({ path: path.join(this.resDir, 'manifest.json') })
      this.dbDevices = new DbBase({ 
        path: path.join(this.resDir, 'devices.json'), 
        url: config.dbUri && (config.dbUri + 'devices.json') 
      }, this.manifestDb)
      this.dbModels = new DbBase({ 
        path: path.join(this.resDir, 'models.json'), 
        url: config.dbUri && (config.dbUri + 'models.json') 
      }, this.manifestDb)
      if (Array.isArray(this.devices)) this.convertDevices()

      this.on('close', (done) => {
        this.cloud && this.cloud.removeListener('status', cloudStatusHandler)
        done()
      })

      //FIXME (currently not works)
      // if (this.cloud && !fs.existsSync(this.devicesPath)) {
      //   this.log('Try initial load devices')
      //   this.updateDevices()
      // }
    }

    get translations() { return this.dbTranslations.data || {} }
    get devices() { return this.dbDevices.data || {} }
    get models() { return this.dbModels.data || {} }

    convertDevices() { //convert from 1.0.x
      const devicesPath = path.join(this.resDir, 'devices.json')
      try {
      this.warn(`Begin convert DB. Save DB to ${devicesPath + '.old'}`)
      JSONsave(this.devices, devicesPath + '.old')
      const tuyaDevices = {}
      this.dbModels.clear()
      for (const dev of this.devices) {
        this.log(`  convert device ${dev.id}`)
        if (dev.dataModel?.modelId && dev.dataModel?.services) {
          this.log(`  convert device ${dev.id}`)
          const services = this.dbModels.data[dev.dataModel.modelId]
          if (services) {
            //TODO merge dev.dataModel.services into services
          }
          else {
            this.log(`  add model ${dev.dataModel.modelId}`)
            this.models[dev.dataModel.modelId] = dev.dataModel.services
          }
        }
        const tuyaDevice = {...dev} //deep copy to remove dataMaodel
        if (dev.dataModel?.modelId) tuyaDevice.dataModel = dev.dataModel.modelId
        else delete tuyaDevice.dataModel
        this.log(`  add device ${dev.id}`)
        tuyaDevices[dev.id] = tuyaDevice
      }
      this.dbDevices.data = tuyaDevices
      this.dbDevices.save(true, true)
      this.dbModels.save(true, true)
      } catch(err) { this.error(err.callstack || err) }
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

    getCloudDevice(deviceId) {
      return this.devices[deviceId]
    }

    getServices(deviceId) {
      const modelId = this.devices[deviceId]?.dataModel || 0
      return modelId && this.models[modelId] || []
    }

    getProperties(deviceId) {
      const propList = []
      const services = this.getServices(deviceId)
      if (Array.isArray(services)) {
        for (const service of services) {
          if (!Array.isArray(service.properties)) continue
          for (const property of service.properties) {
            propList.push(property)
          }
        }
      }
      return propList
    }

    register(device) {
      this.localDevices[device.id] = device
    }

    unregister(device) {
      delete this.localDevices[device.id]
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
          //this.services[].properties[].extensions.iconName

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

      const checkChanged = (dev) => {
        const ref = this.devices[dev.id]
        if (!ref) return true
        for (const prop in dev) {
          if (prop.endsWith('_time')) continue
          if (dev[prop] !== fer[prop]) return true
        }
        return false
      }
      if (!this.devices.length && this.userId) {
        try {
          const data = await getAllUserDevices(this.userId)
          const devices = data.result // TODO save to tuyaDevices
          this.dbDevices.clear() //TODO look for existing and merge
          let devDirty = false
          let modDirty = false
          for (const dev of devices) {
            if (checkChanged(dev)) {
              devDirty = true
              this.devices[dev.id] = dev
              this.log('Device changed ' + dev.name)
            }
            const properties = await this.getCloudDeviceData(dev, 'properties', 'getDeviceProperties', 'properties')
            if (properties) this.deviceProperties[dev.id] = properties
            const model = await this.getCloudDeviceData(dev, 'model', 'getDeviceDataModel', 'dataModel')
            if (model) {
              dev.dataModel = model.modelId
              if (!this.models[modelId]) {
                modDirty = true
                this.autoTranslate && this.translateDeviceModel(model.services)
                this.models[model.modelId] = model.services
                this.log('Add data model ' + model.name)
              }
            }
            await this.updateDeviceIcon(dev)
          }  
          devDirty && this.dbDevices.save(true, true)
          modDirty && this.dbModels.save(true, true)
        } catch(err) { this.error(err) }
      }
      const old_devices = {}
      for (const dev of Object.values(this.devices)) {
        old_devices[dev.id] = dev
      }

      // loop through all devices and build a list of user IDs
      const userIDs = {}
      for (const dev of Object.values(this.devices)) {
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
        msg.devices = Object.values(this.devices)
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
      for (const dev of Object.values(this.devices)) {
        const iconPath = await updateDeviceIcon(dev)
        if (iconPath) msg.payload[dev.id] = iconPath
      }
      send(msg)
      done()
    }

    async translate(obj, prop) {
      if (!this.translator) {
        //initialize translator on demand
        this.translator = {
          dirty: false,
          translate: async (data, language, apiKey) => {
            if (!data) return { data: '' }
            const translated = this.dbTranslations.data[this.language][data]
            if (translated) return { data: translated }
            else {
              if (this.dbTranslations.data[this.language][data] === undefined) {
                this.dbTranslations.data[this.language][data] = ''
                this.translator.dirty = true
              }
              return { error: 'Can not translate ' + data }
            }
          },
          save: () => {
            this.dbTranslations.save(true, true)
            this.translator.dirty = false
          },
        }
      }
      const { error, data } = await this.translator.translate(obj[prop], this.language, this.config.translatorKey)
      if (error) this.error(`on try translate ${prop}: ${error}`)
      else obj[prop] = data
      return !error
    }

    async translateDeviceModel(services) {
      if (!services) return 0
      let count = 0
      for (const service of services) {
        if (!force && (service.language === this.language)) continue
        if (await this.translate(service, 'name')) count++
        if (await this.translate(service, 'description')) count++
        for (const property of service.properties) {
          if (await this.translate(property, 'name')) count++
          if (await this.translate(property, 'description')) count++
        }
        service.language = this.language
      }
      return count
    }

    async translateDeviceModels(msg, send, done) {
      this.log('Translate device models')
      let count = 0
      for (const modelId in this.models) {
        count += await this.translateDeviceModel(this.models[modelId])
      }
      if (count) this.dbModels.save(true, true)
      if (this.translator?.dirty) this.translator.save()
      msg.payload = this.models
      send(msg)
      done()
    }

    async updateDeviceFunctionByCategory(msg, send, done) {
      if (!this.cloud) return done('Cloud access needed for getDeviceFunctionByCategory')
      let dirty = false
      for (const dev of Object.values(this.devices)) {
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
        // JSONsave(this.functions, this.catFunctionsPath)
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
      if (!this.cloud) return done && done('Cloud access needed for ' + command)
      if (!this.cloud[command]) return done && done('Cloud command not supported ' + command)
      if (!this.db[table]) this.dbLoadTable(table)
      const col = this.db[table] || {}
      
      let dirty = false
      for (const devId in this.devices) {
        if (col[devId]) continue
        try {
          const dev = this.devices[devId]
          const data = await this.getCloudDeviceData(dev, entity, command, table)
          this.log(`Downloaded ${table} for ${dev.name}, id:${devId}`)
          if (data && data[table]) {
            col[devId] = data
            dirty = true
          }
        }
        catch(err) {
          this.error(`Error downloading ${table} for ${dev.name} (id:${dev.id}) : ${err}`)
        }
      }
      if (dirty) {
        msg.payload = col
        JSONsave(col, path.join(this.resDir, table + '.json'))
        send && send(msg)
      }
      done && done()
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

  RED.nodes.registerType('tuya-project', Project)
}
