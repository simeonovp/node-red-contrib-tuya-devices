const { Project } = require('tuya-devices')
const fs = require('fs')
const path = require('path')

const DEBUG = false

module.exports = function (RED) {
  'use strict'

  class ProjectNode {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.debug = (DEBUG || config.dbgProject) ? this.log.bind(this) : (() => {})
      this.debug('config:' + JSON.stringify(config))
      config.name = config.name || 'default'
      const rootDir = path.resolve(path.join(__dirname, '../resources'))
      config.resDir = path.join(rootDir, config.name)
      const redRootDir = path.resolve(path.join(__dirname, '../../../'))
      config.resBackupDir = path.join(redRootDir, 'backup/node-red-contrib-tuya-devices', config.name)
      config.cloudLogDir = path.join(config.resDir, 'cloud')
      config.debug = {}
      if (config.dbgProject) config.debug.Project = true
      if (config.dbgCache) config.debug.Cache = true
      if (config.dbgCloud) config.debug.Cloud = true
      if (config.dbgMqtt) config.debug.MQTTBroker = true
      if (config.dbgScanner) config.debug.Scanner = true

      const indexHtmlPath = path.join(rootDir, 'index.html')
      const projectHtmlPath = path.join(rootDir, config.name + '.html')
      if (!fs.existsSync(projectHtmlPath) && fs.existsSync(indexHtmlPath)) {
        try {
          this.log(`Generate project explorer WEB page ${projectHtmlPath}`)
          fs.writeFileSync(projectHtmlPath, fs.readFileSync(indexHtmlPath, 'utf-8').replace(/\.\/default\//g, `./${config.name}/`), 'utf-8')
        }
        catch(err) {
          this.error('Error on generation project explorer WEB page:' + err)
        } 
      }
      else if (!fs.existsSync(indexHtmlPath)) this.warn(`Default project explorer WEB page ${indexHtmlPath} not exists`)

      if (config.cloud) {
        // link cloud
        this.cloudNode = RED.nodes.getNode(config.cloud)
        if (this.cloudNode?.type === 'tuya-cloud') {
          this.debug('link cloud')
          this.cloud = this.cloudNode?.cloud
          if (!this.cloud && !this.cloudNode?.cloudApi) this.error('cloud object is ' + this.cloud)
          else if (this.cloud && config.dbgCloud) this.cloud.debug = this.cloud.log
        }
        else {
          this.warn('Cloud configuration is wrong or missing, please review the node settings')
          this.cloud = null
        }
      }

      // init project
      this.debug('init project')
      this.project = new Project(this.cloud, config, this)
      const cloudApi = this.cloudNode?.cloudApi
      if (cloudApi) {
        this.project.setCloudApi(cloudApi)
        if (cloudApi && config.dbgCloud) cloudApi.debug = cloudApi.log
      }
      
      if (config.broker) {
        // link MQTT broker
        this.mqttBrokerNode = RED.nodes.getNode(config.broker)
        if (this.mqttBrokerNode?.type === 'tuya-mqtt-broker') {
          this.debug('link MQTT broker')
          this.mqttBroker = this.mqttBrokerNode?.mqttBroker
          if (this.mqttBroker) {
            this.fullTopic = config.fullTopic
            if (this.mqttBroker && config.dbgMqtt) this.mqttBroker.debug = this.mqttBroker.log
            this.project.setMqttBroker(this.mqttBroker, this.fullTopic)
          }
          else this.error('MQTT broker object is ' + this.mqttBroker)
        }
        else {
          this.warn('Mqtt configuration is wrong or missing, please review the node settings')
          this.mqttBroker = null
        }
      }

      this.on('close', (done) => {
        this.project.deinit()
        done()
      })
    }
  }

  RED.nodes.registerType('tuya-project', ProjectNode)

  // const staticPath = path.join(__dirname, '..', 'resources')
  // if (!RED.httpAdmin.tuyaDevicesRouteRegistered) {
  //   RED.httpAdmin.use('/tuya-devices', express.static(staticPath))
  //   RED.httpAdmin.tuyaDevicesRouteRegistered = true
  //   console.log('================================================================')
  //   console.log('Registered static WEB path ' + staticPath)
  //   console.log('================================================================')
  // }
}
