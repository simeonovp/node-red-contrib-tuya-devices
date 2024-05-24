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

  class ManagerNode {
    constructor (config) {
      this.config = config
      RED.nodes.createNode(this, config)

      const cloudStatusHandler = this.onCloudStatus.bind(this)
      const deviceFindHandler = this.onDeviceEvent.bind(this)
      this.project = this.config.project && RED.nodes.getNode(this.config.project)
      if (this.project) {
        if (this.project.type !== 'tuya-project') {
          this.warn('Project configuration is wrong or missing, please review the node settings')
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
          this.project = null
        }
        else {
          this.project.addListener('cloud-status', cloudStatusHandler)
          this.project.addListener('device-find', deviceFindHandler)
        }
      }
  
      this.on('close', (done) => {
        if (this.project) {
          this.project.removeListener('cloud-status', cloudStatusHandler)
          this.project.removeListener('device-find', deviceFindHandler)
        }
        done()
      })

      this.on('input', (msg, send, done) => {
        if (!this.project) return done('Project not configured')
        
        switch (msg.topic) {
          case 'updateDevices':
            try {
              this.project.updateDevices(msg, send, () => {
                this.sendToFrontend(msg)
                done()
              })
            } 
            catch(err) {
              this.error(err)
              msg.error = err
              this.sendToFrontend(msg)
              done()
            }
            break
          default:
            const err = this.project.tryCommand(msg, send, done)
            if (err) return done(err)
        }
      })
    }

    onCloudStatus(userId) {
      const state = userId && 'Online' || 'Offline'
      switch (state) {
        case 'Online': return this.status({ fill: 'green', text: state, shape: 'dot' })
        case 'Offline': return this.status({ fill: 'red', text: 'offline', shape: 'ring' })
      }
      if (userId) {
        this.log(`-- sendToFrontend userId ${userId}`)
        this.sendToFrontend({topic: 'userId', payload: userId})
      }
    }

    onDeviceEvent(scannerId, name, data) {
      this.send({ topic: 'deviceEvent', scannerId, name, data })
    }

    sendToFrontend(payload) {
      //this.log(`-- sendToFrontend`)
      RED.events.emit('runtime-event', { id: this.id, retain: false, payload })
    }

  }

  RED.nodes.registerType('tuya-manager', ManagerNode)

  //#.node-red\node_modules\@node-red\nodes\core\common\20-inject.js
  RED.httpAdmin.post(
    '/tuyadevices/:id',
    RED.auth.needsPermission('inject-comm.write'),
    (req, res) => {
      const node = RED.nodes.getNode(req.params.id)
      if (!node) return res.sendStatus(404)
      console.log(`Frontend bledevices event node:${node.name || node.id}, topic:${req.body?.topic}`)
      try {
        if (req.body) node.receive(req.body)
        res.sendStatus(200)
      }
      catch(err) {
        res.sendStatus(500)
        node.error(RED._('inject-comm.failed', { error: err.toString() }))
      }
    }
  )
}
