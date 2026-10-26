// RUN in folder node-red-contrib-tuya-devices: node ./test/tuya_device_runtime_tests.js
//
// Tests the runtime of the device node (nodes/tuya_device.js) with a fake RED and a fake
// device: with "Multi outputs", the data of a selected data point comes at its output,
// data points not selected at no output.

const assert = require('assert')
const EventEmitter = require('events')

// ---------------------------------------------------------------- fakes
// data points of a smart meter in the order of its model
const PROPERTIES = [
  { id: 17, code: 'add_ele' },
  { id: 18, code: 'cur_current' },
  { id: 19, code: 'cur_power' },
  { id: 20, code: 'cur_voltage' },
]

const createDevice = () => {
  const device = new EventEmitter()
  device.properties = PROPERTIES
  device.deviceStatus = 'connected'
  device.lastData = null
  device.register = () => {}
  device.unregister = () => {}
  device.getDpCode = (dp) => PROPERTIES.find(p => p.id === Number(dp))?.code
  device.getPropOptions = () => undefined
  return device
}

const createNode = (config, device) => {
  let NodeClass
  const RED = {
    nodes: {
      registerType: (type, cls) => { NodeClass = cls },
      createNode: (node) => {
        node.sent = []
        node.send = (msg) => node.sent.push(msg)
        node.on = () => {}
        node.status = () => {}
        node.log = () => {}
        node.warn = () => {}
        node.error = (msg) => { throw new Error(msg) }
      },
      getNode: () => ({ type: 'tuya-local-device', device }),
    },
  }
  require('../nodes/tuya_device.js')(RED)
  return new NodeClass(config)
}

const tick = () => new Promise(resolve => process.nextTick(resolve))

// ---------------------------------------------------------------- tests
const test_selected_output = async () => {
  const device = createDevice()
  // output 0: data, then one checkbox per data point of the model: only cur_voltage selected
  const node = createNode({ device: 'cfg1', dps: '', outputs: 2, outputsMode: 3, outputSelList: [true, false, false, false, true] }, device)
  await tick()
  node.sent.length = 0
  device.emit('tuya-data', 'data', { data: { dps: { 17: 5, 20: 2301 } } }, [])
  const [msgs] = node.sent
  assert.strictEqual(msgs.length, 5, 'one slot per output of the model')
  assert.deepStrictEqual(msgs[1], { payload: 2301, topic: 'cur_voltage' }, 'output 1 is cur_voltage')
  assert.ok(!msgs.slice(1).some(m => m?.topic === 'add_ele'), 'add_ele not selected, at no output')
}

// a single data point stored from a former single output mode does not apply to multi outputs
const test_multi_outputs_ignore_single_dp = async () => {
  const device = createDevice()
  const node = createNode({ device: 'cfg1', dps: '19', outputs: 3, outputsMode: 3, outputSelList: [true, false, false, true, true] }, device)
  await tick()
  node.sent.length = 0
  device.emit('tuya-data', 'data', { data: { dps: { 19: 1195, 20: 2301 } } }, [])
  const [msgs] = node.sent
  assert.ok(Array.isArray(msgs), 'one message per output, not a single message')
  assert.deepStrictEqual(msgs[1], { payload: 1195, topic: 'cur_power' })
  assert.deepStrictEqual(msgs[2], { payload: 2301, topic: 'cur_voltage' })
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'selected output': test_selected_output,
    'multi outputs ignore single dp': test_multi_outputs_ignore_single_dp,
  }
  let failed = 0
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test()
      console.log(`ok  ${name}`)
    }
    catch (err) {
      failed++
      console.log(`FAIL ${name}: ${err.message.split('\n')[0]}`)
    }
  }
  if (failed) {
    console.error(`${failed} test(s) failed`)
    process.exitCode = 1
  }
  else console.log('All tests OK')
}

runTests()
