// RUN in folder node-red-contrib-tuya-devices: node ./test/tuya_project_editor_tests.js
//
// Tests the shared editor helpers of nodes/tuya_project.html (object tuya_devices) without a
// browser: the text of the popup of the device finder (manager button "Find devices").
// All ids, IP and MAC addresses are synthetic test values.

const assert = require('assert')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------- helpers
const stub = () => {
  const fn = function () { return proxy }
  const proxy = new Proxy(fn, { get: (target, prop) => (prop === 'then') ? undefined : proxy, apply: () => proxy })
  return proxy
}

const loadHelpers = () => {
  const html = fs.readFileSync(path.join(__dirname, '../nodes/tuya_project.html'), 'utf8')
  const script = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  const RED = new Proxy({}, { get: () => stub() })
  return new Function('RED', '$', 'document', 'window', script + '\nreturn tuya_devices')(RED, stub(), stub(), stub())
}

const PAYLOAD = {
  notShown: [
    { id: 'dev2', name: 'camera', category: 'sp', ip: '10.9.8.22', mac: 'aa:bb:cc:00:00:02', version: '', method: 'mac', local: false, reason: 'no device node' },
    { id: 'house1', name: 'house plug', category: 'cz', ip: '10.9.8.61', mac: '', version: '3.3', method: 'id', local: true, reason: 'not in the project (other home or room)' },
  ],
  unknownTuya: [{ ip: '10.9.8.99', mac: 'aa:bb:cc:00:00:99' }],
  unknownAnnouncements: [{ gwId: 'stranger', ip: '10.9.8.70', version: '3.3' }],
  seenBefore: [{ id: 'dev4', name: '4-433-01', category: 'tdq', ip: '10.9.8.72', mac: 'aa:bb:cc:00:00:04' }],
}

// ---------------------------------------------------------------- tests
// new: found in the network and not in the device table of the manager
const test_report_new_devices = () => {
  const helpers = loadHelpers()
  const inTable = (id) => id === 'dev2' // the camera is in the table already
  const report = helpers.findDevicesReport(PAYLOAD, inTable)
  assert.strictEqual(report.count, 3, 'house plug, unknown Tuya device, unknown announcement')
  assert.ok(!/camera/.test(report.text), 'devices of the table not listed')
  assert.match(report.text, /house plug \(cz\)/)
  assert.match(report.text, /10\.9\.8\.61/)
  assert.match(report.text, /10\.9\.8\.99 .*aa:bb:cc:00:00:99/)
  assert.match(report.text, /stranger/)
  // only in the DHCP leases: listed apart, not counted as new
  assert.match(report.text, /Had an address before \(DHCP\), not reachable now:\n.*4-433-01/)
}

const test_report_nothing_new = () => {
  const helpers = loadHelpers()
  const report = helpers.findDevicesReport({ notShown: PAYLOAD.notShown.slice(0, 1), unknownTuya: [], unknownAnnouncements: [], seenBefore: [] }, () => true)
  assert.strictEqual(report.count, 0)
  assert.match(report.text, /^No new devices found/)
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'report new devices': test_report_new_devices,
    'report nothing new': test_report_nothing_new,
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
