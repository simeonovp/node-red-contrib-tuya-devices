module.exports = function (RED) {
  'use strict'

  class ManagerNode {
    constructor (config) {
      this.config = config
      RED.nodes.createNode(this, config)

      const cloudStatusHandler = this.onCloudStatus.bind(this)
      const deviceFindHandler = this.onDeviceEvent.bind(this)
      this.projectNode = this.config.project && RED.nodes.getNode(this.config.project)
      
      if (this.projectNode) {
        if (this.projectNode.type !== 'tuya-project') {
          this.warn('Project configuration is wrong or missing, please review the node settings')
          this.status({ fill: 'red', shape: 'dot', text: 'Wrong config' })
          this.project = null
        }
        else {
          this.project = this.projectNode.project
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
              (async ()=> {
                await this.project.updateCache()
                this.sendToFrontend({topic: msg.topic, payload: 'update'}) // notify frontend to refresh resources
                done()
              })()
            } 
            catch(err) {
              this.error(`on input ${msg.topic} error:` + err)
              msg.error = err
              this.sendToFrontend(msg)
              done()
            }
            break
          case 'updateDeviceDataModel':
            msg.topic = 'updateAllModels'
            return this.tryProjectCommand(msg, send, done)
          case 'translateDeviceModels':
            msg.topic = 'translateModels'
            return this.tryProjectCommand(msg, send, done)
          default:
            this.tryProjectCommand(msg, send, done)
        }
      })
    }

    // pass through project commands
    async tryProjectCommand(msg, send, done) {
      try {
        if (!msg.topic) throw new Error('Empty topic')
        if (typeof msg.topic !== 'string') throw new Error('Topic must be a string')
        if (!this.project[msg.topic]) throw new Error('Unknown command ' + msg.topic)
        
        this.log('Command ' + msg.topic)
        await this.project[msg.topic](msg)
        send && send(msg)
        done()
      }
      catch(err) {
        this.error(err)
        done(err)
      }
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
      this.log(`-- sendToFrontend topic:${payload.topic}`)
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
      console.log(`Frontend tuya-devices event node:${node.name || node.id}, topic:${req.body?.topic}`)
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
