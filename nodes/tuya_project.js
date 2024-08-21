const { Project } = require('tuya-devices')
const path = require('path')
const express = require('express')

module.exports = function (RED) {
  'use strict'

  class ProjectNode {
    constructor (config) {
      RED.nodes.createNode(this, config)
      // this.log('-- org config:' + JSON.stringify(config))

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
