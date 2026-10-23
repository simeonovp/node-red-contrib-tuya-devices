// RUN in folder node-red-contrib-tuya-devices: node ./test/tuya_local_device_editor_tests.js
//
// Tests the editor code of the local device node (nodes/tuya_local_device.html) without
// a browser: the script is run with a fake RED and a fake jQuery.
// - a node created before the Monitoring tab shows the defaults of its selections

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------- fakes
// chainable stub: any property is a function returning the stub, also callable
const stub = () => {
  const fn = function () { return proxy }
  const proxy = new Proxy(fn, {
    get: (target, prop) => (prop === 'then') ? undefined : proxy,
    apply: () => proxy,
  })
  return proxy
}

// fake jQuery: one element per selector with a value, other methods chainable no-ops
const createJQuery = () => {
  const values = {}
  const element = (selector) => {
    if (typeof selector !== 'string' || selector.startsWith('<')) return stub()
    const any = stub()
    return new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'val') {
          return (value) => {
            if (value === undefined) return values[selector]
            values[selector] = value
            return any
          }
        }
        if (prop === 'then') return undefined
        return any
      },
    })
  }
  return new Proxy(element, { get: () => stub() }) // $.ajax, $.getJSON, ...
}

// runs oneditprepare of the node definition for a node like Node-RED does: the inputs
// get the stored values first
const openEditor = (node) => {
  const html = fs.readFileSync(path.join(__dirname, '../nodes/tuya_local_device.html'), 'utf8')
  const script = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  let definition
  const RED = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'nodes') {
        return new Proxy({}, {
          get: (t, p) => {
            if (p === 'registerType') return (name, def) => { definition = def }
            if (p === 'eachConfig') return () => {}
            if (p === 'node') return () => null
            return stub()
          },
        })
      }
      return stub()
    },
  })
  const $ = createJQuery()
  const document = { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } }
  const window = { getComputedStyle: () => ({ color: 'black' }) }
  new Function('RED', '$', 'document', 'window', script)(RED, $, document, window)
  for (const key of Object.keys(definition.defaults)) {
    if (node[key] !== undefined) $('#node-config-input-' + key).val(node[key])
  }
  node._def = definition
  try {
    definition.oneditprepare.call(node)
  }
  catch (err) {
    // parts of the dialog that need a real browser, the monitor part runs before
    if (!/monitor/i.test(err.stack || '')) console.log(`note: oneditprepare stopped early: ${err.message}`)
  }
  return { $, definition }
}

// ---------------------------------------------------------------- tests
const test_monitor_selection_defaults = () => {
  // a node created before the Monitoring tab: no monitor values
  const { $ } = openEditor({ deviceId: 'dev1', name: 'device', project: 'p1' })
  assert.strictEqual($('#node-config-input-monitorMode').val(), 'inherit', 'Monitor: as project')
  assert.strictEqual($('#node-config-input-monitorPriority').val(), 'normal', 'Priority: normal')
  assert.strictEqual($('#node-config-input-monitorPowerDps').val(), '1', 'Switch DP')
  assert.strictEqual($('#node-config-input-monitorPowerOffSeconds').val(), 10, 'Power off')
}

const test_stored_values_kept = () => {
  const { $ } = openEditor({ deviceId: 'dev1', name: 'device', project: 'p1', monitorMode: 'on', monitorPriority: 'critical' })
  assert.strictEqual($('#node-config-input-monitorMode').val(), 'on')
  assert.strictEqual($('#node-config-input-monitorPriority').val(), 'critical')
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'monitor selection defaults': test_monitor_selection_defaults,
    'stored values kept': test_stored_values_kept,
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
