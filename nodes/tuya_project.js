const { Project } = require('tuya-devices')
const path = require('path')
const express = require('express')

const DEBUG = false

module.exports = function (RED) {
  'use strict'

  class ProjectNode {
    constructor (config) {
      RED.nodes.createNode(this, config)

      this.debug = DEBUG ? this.log.bind(this) : (() => {})
      this.debug('config:' + JSON.stringify(config))

      config.name = config.name || 'default'
      config.resDir = path.resolve(path.join(__dirname, '../resources', config.name))
      config.cloudLogDir = path.join(config.resDir, 'cloud')

      this.cloudNode = config.cloud && RED.nodes.getNode(config.cloud)
      if (!this.cloudNode || (this.cloudNode.type !== 'tuya-cloud')) {
        this.warn('Cloud configuration is wrong or missing, please review the node settings')
        this.cloud = null
      }
      else {
        this.cloud = this.cloudNode.cloud
      }

      this.project = new Project(this.cloud, config, this)

      this.mqttBrokerNode = config.broker && RED.nodes.getNode(config.broker)
      if (!this.mqttBrokerNode || (this.mqttBrokerNode.type !== 'tuya-mqtt-broker')) {
        this.warn('Cloud configuration is wrong or missing, please review the node settings')
        if (!this.mqttBrokerNode) this.warn('  mqttBrokerNode:' + this.mqttBrokerNode)
        else if (this.mqttBrokerNode.type !== 'tuya-mqtt-broker') this.warn('  mqttBrokerNode.type:' + this.mqttBrokerNode.type)
        this.mqttBroker = null
      }
      else {
        this.mqttBroker = this.mqttBrokerNode.mqttBroker
        this.fullTopic = config.fullTopic
        this.project.setMqttBroker(this.mqttBroker, this.fullTopic)
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
