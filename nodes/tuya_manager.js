module.exports = function (RED) {
  'use strict'

  function JSONparse(json) {
    try {
      return JSON.parse(json)
    }
    catch(err) {
      console.error(`Error JSON.parse(${json}):${err}`)
    }
  }

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
        if (!this.project) return done('Project not configured')
        
        switch (msg.topic) {
          default:
            const err = this.project.tryCommand(msg, send, done)
            if (err) return done(err)
        }
      })
    }

    onCloudStatus(state) {
      switch (state) {
        case 'Online': return this.status({ fill: 'green', text: state, shape: 'dot' })
        case 'Offline': return this.status({ fill: 'red', text: 'offline', shape: 'ring' })
      }
    }

  }

  RED.nodes.registerType('tuya-manager', Manager)
}
