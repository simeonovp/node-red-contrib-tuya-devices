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

  class Manager {
    constructor (config) {
      this.config = config
      RED.nodes.createNode(this, config)

      const cloudStatusHandler = this.onCloudStatus.bind(this)
      this.project = this.config.project && RED.nodes.getNode(this.config.project)
      if (this.project) {
        if (this.project.type !== 'tuya-project') {
          this.warn('Project configuration is wrong or missing, please review the node settings')
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
          this.project = null
        }
        else {
          this.project.addListener('cloud-status', cloudStatusHandler)
        }
      }
  
      this.on('close', (done) => {
        this.project && this.project.removeListener('cloud-status', cloudStatusHandler)
        done()
      })

      this.on('input', (msg, send, done) => {
        if (!msg.topic) return done('Empty topic')
        switch (msg.topic) {
          case 'updateDevices':
            this.project && this.project.updateDevices(msg, send, done)
            break
          case 'updateDeviceIcons':
            this.project && this.project.updateDeviceIcons(msg, send, done)
            break
          default:
            return done('Unknown topic')
        }
      })
    }

    onCloudStatus(state) {
      this.log('-- onCloudStatus state:' + state)
      switch (state) {
        case 'Online': return this.status({ fill: 'green', text: state, shape: 'dot' })
        case 'Offline': return this.status({ fill: 'red', text: 'offline', shape: 'ring' })
      }
    }

  }

  RED.nodes.registerType('tuya-manager', Manager)
}
