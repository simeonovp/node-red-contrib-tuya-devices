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

// the labels of the outputs follow a changed selection of the data points after saving
const test_output_labels_after_save = () => {
  const { definition } = loadDefinition(createDevice())
  const labelList = ['data', '(1) switch_1', '(9) countdown_1', '(38) relay_status']
  const node = { device: 'cfg1', dps: '', outputs: 2, outputsMode: 3, outputLabelList: labelList, outputSelList: [true, false, true, false], _def: definition }
  assert.strictEqual(definition.outputLabels.call(node, 1), '(9) countdown_1', 'label of the selected data point')
  // the user selects relay_status instead of countdown_1 and saves
  node.outputSelList = [true, false, false, true]
  definition.oneditsave.call(node)
  assert.strictEqual(definition.outputLabels.call(node, 1), '(38) relay_status', 'label follows the new selection')
}

// saved with multi outputs: no single data point stays stored
const test_save_multi_outputs_clears_dp = () => {
  const { definition } = loadDefinition(createDevice())
  const node = { device: 'cfg1', dps: '19', outputs: 2, outputsMode: 3, outputLabelList: ['data', '(19) cur_power'], outputSelList: [true, true], _def: definition }
  definition.oneditsave.call(node)
  assert.strictEqual(node.dps, '', 'single data point removed')
  const single = { device: 'cfg1', dps: '19', outputs: 1, outputsMode: 1, outputLabelList: ['data'], _def: definition }
  definition.oneditsave.call(single)
  assert.strictEqual(single.dps, '19', 'kept with single output')
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'node without mode keeps outputs': test_node_without_mode_keeps_outputs,
    'cancel keeps node': test_cancel_keeps_node,
    'output labels after save': test_output_labels_after_save,
    'save multi outputs clears dp': test_save_multi_outputs_clears_dp,
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
