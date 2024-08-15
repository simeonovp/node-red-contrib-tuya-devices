async function loadJSON(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, url:${JSON.stringify(url)}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error loading JSON:', error)
    return null
  }
}

async function initTabs(tables) {
  await loadHeadContent()
  loadBodyContent(tables)
  loadFooterContent()

  fillTables(tables)
  $('#tuya-tabs .nav-link.active').tab('show')
}

async function loadHeadContent(callback) {
  // Create and append Bootstrap CSS
  const bootstrapLink = document.createElement('link')
  bootstrapLink.rel = 'stylesheet'
  bootstrapLink.type = 'text/css'
  bootstrapLink.href = './css/bootstrap.min.css'
  document.head.appendChild(bootstrapLink)

  // Create and append DataTables CSS
  const dataTablesLink = document.createElement('link')
  dataTablesLink.rel = 'stylesheet'
  dataTablesLink.type = 'text/css'
  dataTablesLink.href = './css/dataTables.bootstrap.min.css'
  document.head.appendChild(dataTablesLink)

  // Add custom styles
  const style = document.createElement('style')
  style.innerHTML = `
    tr td {
      white-space: nowrap;
    }
  `
  document.head.appendChild(style)

  // Add script tags
  try {
    for(const url of [
      './script/jquery-1.11.2.min.js',
      './script/jquery-3.5.1.slim.min.js',
      './script/bootstrap.min.js',
      './script/datatables.min.js',
      './script/dataTables.bootstrap.min.js'
    ]) await addScript(url)
  } catch(err) { console.error(err) }

}

function addScript(url, callback) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = url
    script.onload = function () { resolve() }
    script.onerror = function () { reject('Error loading script:', url) }
    document.head.appendChild(script)
  })
}

function loadBodyContent(tables) {
  const tabs_container = document.createElement('div')
  tabs_container.className = 'container mt-4'
  
  const nav_tabs = document.createElement('ul')
  nav_tabs.className = 'nav nav-tabs'
  nav_tabs.id = 'tuya-tabs'
  nav_tabs.role = 'tablist'

  const content_container = document.createElement('div')
  content_container.className = 'tab-content'
  content_container.id = 'tuya-tabs-content'

  let active = true // for first tab
  for (const key of Object.keys(tables)) {
    const table_name = key.toLowerCase()
    const content_id = `tuya-${table_name}-content`
    nav_tabs.appendChild(createTabNavigationElement(
      key, table_name, content_id, active))
    content_container.appendChild(
      createTabContentElement(table_name, content_id, active))
    active = false
  }

  tabs_container.appendChild(nav_tabs)
  document.body.appendChild(tabs_container)
  document.body.appendChild(content_container)
}

function createTabNavigationElement(title, table_name, content_id, active)
{
  const nav_item = document.createElement('li')
  nav_item.className = 'nav-item'
  const nav_link = document.createElement('a')
  nav_link.className = `nav-link ${active ? 'active' : ''}`
  nav_link.id = `tuya-${table_name}-tab`
  nav_link.setAttribute('data-toggle', 'tab')
  nav_link.href = `#${content_id}`
  nav_link.role = 'tab'
  nav_link.setAttribute('aria-controls', table_name)
  nav_link.setAttribute('aria-selected', active ? 'true' : 'false')
  nav_link.textContent = title
  nav_item.appendChild(nav_link)
  return nav_item
}

function createTabContentElement(table_name, content_id, active)
{
  const tab_pane = document.createElement('div')
  tab_pane.className = `tab-pane fade ${active ? 'active' : ''}`
  tab_pane.id = content_id
  tab_pane.role = 'tabpanel'
  tab_pane.setAttribute('aria-labelledby', `tuya-${table_name}-tab`)

  const table = document.createElement('table')
  table.id = table_name
  table.className = 'table table-striped table-bordered'
  table.style.width = '100%'

  const thead = document.createElement('thead')
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  table.appendChild(tbody)

  const tfoot = document.createElement('tfoot')
  table.appendChild(tfoot)

  tab_pane.appendChild(table)
  
  return(tab_pane)
}

function loadFooterContent() {
  const footer = document.createElement('footer')
  const container = document.createElement('div')
  container.className = 'container-fluid'

  const infoDiv = document.createElement('div')
  infoDiv.className = 'info'

  const paragraph = document.createElement('p')
  // paragraph.textContent = `© ${currentYear} Your Company Name`

  infoDiv.appendChild(paragraph)
  container.appendChild(infoDiv)
  footer.appendChild(container)

  document.getElementsByTagName('html')[0].appendChild(footer)
}

async function fillTables(tables) {
  const tables_data = {}
  for (const [key, path] of Object.entries(tables)) {
    const table_data = await loadJSON(path) || {}
    const table_name = key.toLowerCase()
    tables_data[table_name] = table_data
  }
  for (const table_name in tables_data) {
    table_data = tables_data[table_name]
    if (!table_data) return console.error(`Fill table ${table_name} failed, data is ${table_data}`)
    const data = Array.isArray(table_data) ? table_data : Object.values(table_data)
    const columns = getColumnsFromTable(data)
    const table = document.getElementById(table_name)
    addColumns(table, columns)
    const tableBody = table.getElementsByTagName('tbody')[0]
    addRows(tableBody, data, columns)
  }

  for (const table_name in tables_data) {
    // Add event listeners for filter inputs after tables are initialized
    setupFilterInputs(table_name)
  }
}

function getColumnsFromTable(ar) {
  return ar && [...new Set(ar.reduce((acc, obj) => acc.concat(
    Array.isArray(obj) && obj.length ? Object.keys(obj[0]) : Object.keys(obj)), ['id']))] || []
}

function addColumns(table, columns) {
  const thead = table.querySelector('thead')
  const headerTr = document.createElement('tr')
  thead.appendChild(headerTr)

  const tfoot = table.querySelector('tfoot')
  const footerTr = document.createElement('tr')
  tfoot.appendChild(footerTr)

  for (const headerText of columns) {
    const headerTh = document.createElement('th')
    headerTh.className = 'text-center'
    headerTh.textContent = headerText
    headerTr.appendChild(headerTh)

    const footerTh = document.createElement('th')
    footerTh.textContent = headerText
    footerTr.appendChild(footerTh)
  }
}

function addRows(tableBody, data, columns, nested) {
  data.forEach(item => {
    if (Array.isArray(item)) addRows(tableBody, item, columns, true)
    else addRow(tableBody, item, columns, nested)
  })
}

function addRow(tableBody, item, columns, nested) {
  const row = document.createElement('tr')
  columns.forEach(propertyName => {
    const cell = document.createElement('td')
    cell.textContent = !item.hasOwnProperty(propertyName) || (item[propertyName] === null) && (item[propertyName] === undefined) ? '' : 
      (typeof item[propertyName] !== 'object') ? item[propertyName] :
        Array.isArray(item[propertyName]) ? '(array)' : '(object)'
      
    row.appendChild(cell)
  })
  tableBody.appendChild(row)
}

function setupFilterInputs(table_name) {
  $(`#${table_name} tfoot th`).each(function () {
    const title = $(this).text()
    const title_id = title.replace('.', '_')
    $(this).html('<input type="text" id="filter-input-' + title_id + '" class="form-control filter-input" placeholder="Filter ' + title + '" style="width:100%"/>')
  })

  const table = $('#' + table_name).DataTable()

  table.columns().every(function () {
    const that = this

    $('input', this.footer()).on('keyup change clear', function () {
      if (that.search() !== this.value) {
        that
          .search(this.value)
          .draw()
      }
    })
  })
}
