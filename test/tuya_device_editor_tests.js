// RUN in folder node-red-contrib-tuya-devices: node ./test/tuya_device_editor_tests.js
//
// Tests the editor code of the device node (nodes/tuya_device.html) without a browser:
// the script is run with a fake RED and a fake jQuery.
// - a node without outputsMode (older or generated flows) keeps its outputs when opened
// - cancelling the dialog keeps the node as it was

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------- fakes
// fake jQuery: one element per selector with value and change handlers, any other
// method is a chainable no-op
const createJQuery = () => {
  const elements = {}
  const element = (selector) => {
    if (elements[selector]) return elements[selector]
    const state = { value: undefined, handlers: [] }
    const proxy = new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'val') {
          return (value) => {
            if (value === undefined) return state.value
            state.value = value
            return proxy
          }
        }
        if (prop === 'change') {
          return (handler) => {
            if (handler) state.handlers.push(handler)
            else state.handlers.forEach(h => h())
            return proxy
          }
        }
        if (prop === 'trigger') return () => state.handlers.forEach(h => h()) || proxy
        return () => proxy
      },
    })
    // elements created from html ('<table>') are not shared
    if (!selector.startsWith('<')) elements[selector] = proxy
    return proxy
  }
  return element
}

// loads the node definition from the html file
const loadDefinition = (device) => {
  const html = fs.readFileSync(path.join(__dirname, '../nodes/tuya_device.html'), 'utf8')
  const script = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  let definition
  const RED = {
    nodes: {
      registerType: (name, def) => { definition = def },
      node: () => device,
      dirty: () => {},
    },
  }
  const $ = createJQuery()
  const document = {
    createElement: () => ({}),
    body: { appendChild: () => {}, removeChild: () => {} },
  }
  const window = { getComputedStyle: () => ({ color: 'black' }) }
  new Function('RED', '$', 'document', 'window', script)(RED, $, document, window)
  return { definition, $ }
}

// fake config node of a device with 3 data points
const createDevice = () => ({
  deviceId: 'dev1',
  getCloudDevice: (callback) => callback({}),
  getProperties: (callback) => callback([
    { id: 1, code: 'switch_1', name: 'Switch', property: { type: 'bool' }, mode: 'rw' },
    { id: 9, code: 'countdown_1', name: 'Countdown', property: { type: 'value' }, mode: 'rw' },
    { id: 38, code: 'relay_status', name: 'Relay', property: { type: 'enum' }, mode: 'rw' },
  ]),
})

// ---------------------------------------------------------------- tests
const test_node_without_mode_keeps_outputs = () => {
  const { definition } = loadDefinition(createDevice())
  // like a node of an older or generated flow: no outputsMode
  const node = { device: 'cfg1', dps: '1', outputs: 1, outputLabelList: ['data'], _def: definition }
  definition.oneditprepare.call(node)
  assert.strictEqual(node.outputsMode, 1, 'single output mode derived from the outputs')
  assert.strictEqual(node.outputs, 1, 'single output kept')
}

const test_cancel_keeps_node = () => {
  const { definition, $ } = loadDefinition(createDevice())
  const node = { device: 'cfg1', dps: '1', outputs: 1, outputsMode: 1, outputLabelList: ['data'], _def: definition }
  definition.oneditprepare.call(node)
  // the user selects multi outputs, then cancels
  $('#node-input-outputsMode').val('3')
  $('#node-input-outputsMode').trigger()
  definition.oneditcancel?.call(node)
  assert.strictEqual(node.outputsMode, 1, 'mode unchanged after cancel')
  assert.strictEqual(node.outputs, 1, 'outputs unchanged after cancel')
  assert.deepStrictEqual(node.outputLabelList, ['data'], 'labels unchanged after cancel')
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'node without mode keeps outputs': test_node_without_mode_keeps_outputs,
    'cancel keeps node': test_cancel_keeps_node,
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
