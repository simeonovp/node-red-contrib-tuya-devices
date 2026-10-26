// RUN in folder node-red-contrib-tuya-devices: node ./test/tuya_local_device_dom_tests.js
//
// Tests the extension tab of the local device editor (nodes/tuya_local_device.html) in a
// DOM (jsdom, jQuery) with a fake RED and a fake project: settings of the extension,
// one tab per category of sub-devices, each with its table, also if the tab is updated
// more than once.

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

// ---------------------------------------------------------------- helpers
const html = fs.readFileSync(path.join(__dirname, '../nodes/tuya_local_device.html'), 'utf8')
const template = /<script type="text\/html" data-template-name="tuya-local-device">([\s\S]*?)<\/script>/.exec(html)[1]
const script = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')

const SETTINGS = [
  { key: 'faultPattern', type: 'string', default: 'batter', label: 'Fault pattern', help: 'pattern help' },
  { key: 'autoAckFaults', type: 'boolean', default: false, label: 'Acknowledge', help: 'ack help' },
]

// context of an alarm hub with sub-devices in three categories
const part = (name) => ({ type: 1, zone: 0, linking: 255, status: 255, battery: 255, name })
const CONTEXT = {
  code: 'sub_class',
  selection: 1,
  categories: {
    0: { selection: 255, parts: { 1: part('Remote') } },
    1: { selection: 6, parts: { 2: part('Schlafbereich'), 6: part('Tuer') } },
    2: { selection: 255, parts: { 3: part('Socket') } },
  },
  unused: { 0: {}, 1: {}, 2: {} },
  openPoints: {},
}

// fake RED: tabs as list items in the ul of the tab bar
const createRED = (window, $, project) => {
  let definition
  const RED = {
    nodes: {
      registerType: (name, def) => { definition = def },
      node: (id) => (id === 'p1') ? project : null,
      eachConfig: () => {},
      dirty: () => {},
    },
    tabs: {
      create: (options) => ({
        addTab: (tab) => $('#' + options.id).append($('<li></li>').attr('data-tab', tab.id).text(tab.label)),
        removeTab: (id) => $('#' + options.id).find(`li[data-tab="${id}"]`).remove(),
      }),
    },
  }
  return { RED, definition: () => definition }
}

const openEditor = () => {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="node-config-input-tuya-tabs-wrapper"><ul id="node-config-input-tuya-tabs"></ul></div>${template}</body>`)
  const window = dom.window
  const $ = require('jquery')(window)
  $.getJSON = (url) => $.Deferred().resolve(/extension-settings\/mal$/.test(url) ? SETTINGS : []).promise()
  const project = {
    getCloudDevices: (callback) => callback({ dev1: { category: 'mal', dataModel: 'm1' } }),
    getModels: (callback) => callback({ m1: [] }),
    getOverloads: (callback) => callback({}),
    getContext: (callback) => callback({ mal: { dev1: CONTEXT } }),
    getAnnouncements: (callback) => callback({}),
  }
  const { RED, definition } = createRED(window, $, project)
  new Function('RED', '$', 'window', 'document', script)(RED, $, window, window.document)
  const def = definition()
  const node = { deviceId: 'dev1', name: 'alarm hub', project: 'p1', deviceCategory: 'mal', deviceMac: 'aa:bb:cc:dd:ee:ff', extensionSettings: { faultPattern: 'akku' }, _def: def }
  // like Node-RED: the inputs get the stored values before oneditprepare
  for (const key of Object.keys(def.defaults)) {
    const input = $('#node-config-input-' + key)
    if (input.attr('type') === 'checkbox') input.prop('checked', node[key] === true)
    else if (node[key] !== undefined) input.val(node[key])
  }
  def.label.call(node)
  def.oneditprepare.call(node)
  return { $, node, def }
}

const categoryTabs = ($) => $('#tuya-extension-tabs li').map((i, li) => $(li).text()).get()

// ---------------------------------------------------------------- tests
const test_extension_tab_once = () => {
  const { $ } = openEditor()
  assert.deepStrictEqual($('#node-config-input-tuya-tabs li[data-tab="tuya-extension-tab"]').map((i, li) => $(li).text()).get(), ['Extension'], 'one extension tab')
  assert.deepStrictEqual(categoryTabs($), ['Category0', 'Category1', 'Category2'], 'one tab per category')
  assert.strictEqual($('#tuya-extension-settings').length, 1, 'settings once')
  assert.strictEqual($('#tuya-ext-setting-faultPattern').val(), 'akku', 'stored value')
  assert.strictEqual($('#tuya-ext-setting-faultPattern').attr('placeholder'), 'batter', 'default as placeholder')
}

const test_tables_of_all_categories = () => {
  const { $ } = openEditor()
  for (const tab of ['0', '1', '2']) {
    assert.strictEqual($('#tuya-extension-view').children('#tuya-extension-tab' + tab).length, 1, `table of category ${tab}`)
  }
  assert.match($('#tuya-extension-tab1').text(), /Tuer/, 'sub-devices of category 1')
  // read-only table: header, one row per sub-device, 255 (not supported) as '–'
  const header = $('#tuya-extension-tab1 thead th').map((i, th) => $(th).text()).get()
  assert.deepStrictEqual(header, ['Nr.', 'Name', 'Type', 'Zone', 'Status', 'Battery', 'Linking'])
  const rows = $('#tuya-extension-tab1 tbody tr').map((i, tr) => [$(tr).children('td').map((j, td) => $(td).text()).get()]).get()
  assert.deepStrictEqual(rows, [['2', 'Schlafbereich', '1', '0', '–', '–', '–'], ['6', 'Tuer', '1', '0', '–', '–', '–']])
  assert.strictEqual($('#tuya-extension-view #dps-table').length, 0, 'no second element with the id of the DP table')
}

// the category is changed or set later (from the cloud): the tab is built again, not added
const test_update_again = () => {
  const { $ } = openEditor()
  $('#node-config-input-deviceCategory').trigger('change')
  assert.deepStrictEqual(categoryTabs($), ['Category0', 'Category1', 'Category2'], 'still one tab per category')
  assert.strictEqual($('#tuya-extension-settings').length, 1, 'settings once')
  assert.strictEqual($('#tuya-extension-view').children().length, 3, 'one table per category')
}

// ---------------------------------------------------------------- runner
const runTests = async () => {
  const tests = {
    'extension tab once': test_extension_tab_once,
    'tables of all categories': test_tables_of_all_categories,
    'update again': test_update_again,
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
