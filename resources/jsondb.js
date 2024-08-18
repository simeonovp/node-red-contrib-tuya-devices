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

async function loadHeadContent() {
  const bootstrap5 = false
  for(const url of [
    bootstrap5 ? './css/bootstrap-5.3.0.min.css' : './css/bootstrap.min.css',
    './css/dataTables.bootstrap.min.css',
    './css/bootstrap-icons.css',
  ]) addStyleSheet(url)

  // Add custom styles
  const style = document.createElement('style')
  style.innerHTML = `
    tr td {
      white-space: nowrap;
    }
  `
  document.head.appendChild(style)

  for(const url of [
    './script/jquery-1.11.2.min.js',
    './script/jquery-3.5.1.slim.min.js',
    bootstrap5 ? './script/bootstrap-5.3.0.bundle.min.js' : './script/bootstrap.min.js',
    './script/popper.min.js',
    './script/datatables.min.js',
    './script/dataTables.bootstrap.min.js'
  ]) await addScript(url)
}

function addStyleSheet(url) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.type = 'text/css'
  link.href = url
  document.head.appendChild(link)
}

function addScript(url) {
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
    const tableName = key.toLowerCase()
    const contentId = `tuya-${tableName}-content`
    nav_tabs.appendChild(createTabNavigationElement(key, tableName, contentId, active))
    content_container.appendChild(createTabContentElement(tableName, contentId, active))
    active = false
  }

  tabs_container.appendChild(nav_tabs)
  document.body.appendChild(tabs_container)
  document.body.appendChild(content_container)
}

function createTabNavigationElement(title, tableName, contentId, active)
{
  const nav_item = document.createElement('li')
  nav_item.className = 'nav-item'
  const nav_link = document.createElement('a')
  nav_link.className = `nav-link ${active ? 'active' : ''}`
  nav_link.id = `tuya-${tableName}-tab`
  nav_link.setAttribute('data-toggle', 'tab')
  nav_link.href = `#${contentId}`
  nav_link.role = 'tab'
  nav_link.setAttribute('aria-controls', tableName)
  nav_link.setAttribute('aria-selected', active ? 'true' : 'false')
  nav_link.textContent = title
  nav_item.appendChild(nav_link)
  return nav_item
}

function createTabContentElement(tableName, contentId, active)
{
  const tab_pane = document.createElement('div')
  tab_pane.className = `tab-pane fade ${active ? 'active' : ''}`
  tab_pane.id = contentId
  tab_pane.role = 'tabpanel'
  tab_pane.setAttribute('aria-labelledby', `tuya-${tableName}-tab`)
  tab_pane.appendChild(createTable(tableName))
  return tab_pane
}

function createTable(id) {
  const table = document.createElement('table')
  table.id = id
  table.className = 'table table-striped table-bordered'
  table.style.width = '100%'
  table.appendChild(document.createElement('thead'))
  table.appendChild(document.createElement('tbody'))
  table.appendChild(document.createElement('tfoot'))
  return table
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
  const tablesData = {}
  for (const [key, path] of Object.entries(tables)) {
    const tableData = await loadJSON(path) || {}
    const tableName = key.toLowerCase()
    tablesData[tableName] = tableData
  }
  for (const tableName in tablesData) {
    const tableData = tablesData[tableName]
    if (!tableData) return console.error(`Fill table ${tableName} failed, data is ${tableData}`)
    const table = document.getElementById(tableName)
    fillTable(table, tableData)
  }
}

function fillTable(table, tableData) {
  const data = Array.isArray(tableData) ? tableData : Object.values(tableData)
  const initColumns = Array.isArray(tableData) ? [] : ['id']
  const columns = getColumnsFromTable(data, initColumns)
  addColumns(table, columns)
  const tableBody = table.getElementsByTagName('tbody')[0]
  addRows(table.id, tableBody, tableData, columns)
  // Add event listeners for filter inputs after tables are initialized
  setupFilterInputs(table)
}

function getColumnsFromTable(ar, columns) {
  columns = (ar && [...new Set(ar.reduce((acc, obj) => acc.concat(
    Array.isArray(obj) && obj.length ? Object.keys(obj[0]) : Object.keys(obj)),
    columns))] || []).filter(item => !item.startsWith('_custom_'))

  const descriptionIndex = columns.indexOf('description')
  if (0 <= descriptionIndex) {
    const [description] = columns.splice(descriptionIndex, 1)
    columns.push(description)
  }
  return columns
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

function addRows(tableId, tableBody, tableData, columns, id) {
  if (Array.isArray(tableData)) {
    tableData.forEach(item => {
      if (Array.isArray(item)) addRows(tableId, tableBody, item, columns, id)
      else addRow(tableId, tableBody, item, columns, id)
    })
  }
  else {
    for (const [id, item] of Object.entries(tableData)) {
      if (Array.isArray(item)) addRows(tableId, tableBody, item, columns, id)
        else addRow(tableId, tableBody, item, columns, id)
    }
  }
}

function appendCell(row, text, iconName, tooltipText, onClick) {
  const cell = document.createElement('td')
    
  if (iconName) {
    const containerDiv = document.createElement('div')
    containerDiv.style.display = 'flex'
    containerDiv.style.justifyContent = 'space-between'
    containerDiv.style.alignItems = 'center'
    cell.appendChild(containerDiv)

    const textDiv = document.createElement('div')
    textDiv.textContent = text
    textDiv.style.flexGrow = '1'
    containerDiv.appendChild(textDiv)

    const button = document.createElement('button')
    button.id = iconName + '-button'
    button.className = 'btn style="font-size: 10px;"'
    button.style.backgroundColor = 'transparent'
    button.style.border = 'none'
    if (tooltipText) {
      button.setAttribute('data-toggle', 'tooltip')
      button.setAttribute('title', tooltipText)
    }
    if (onClick) button.addEventListener('click', onClick)
    containerDiv.appendChild(button)

    const icon = document.createElement('i')
    icon.className = 'bi bi-' + iconName
    icon.style.fontSize = '10px'
    button.appendChild(icon)
  }
  else cell.textContent = text

  row.appendChild(cell)
}

function addRow(tableId, tableBody, item, columns, id) {
  if (id && !item.hasOwnProperty('id')) item.id = id

  const row = document.createElement('tr')
  tableBody.appendChild(row)

  columns.forEach(propertyName => {
    if (propertyName.startsWith('_custom_')) return
    const value = item[propertyName]
    if (!item.hasOwnProperty(propertyName) || (value === null) || (value === undefined)) {
      appendCell(row, '')
    }
    else if (typeof value !== 'object') {
      if ((propertyName === 'name') || (propertyName === 'description')) {
        // translate if propertyName is "name" or "description"
        const customPropName = '_custom_' + propertyName
        if (item.hasOwnProperty(customPropName)) return appendCell(row, item[customPropName], 'translate', value)
        appendCell(row, value)
      }
      else appendCell(row, value)
    }
    else if (Array.isArray(value)) {
      if (value.length) {
        const name = `(array [${value.length}])`
        switch(propertyName) {
          case 'homes':
          case 'devices':
            appendCell(row, name, 'pencil', '', () => {
              showModalForm(`${tableId}-${propertyName}`, value, true)
            })
            break
          default:
            appendCell(row, name, 'pencil', '', () => {
              showModalForm(`${tableId}-${propertyName}`, value)
            })
          }
        }
      else appendCell(row, '')
    }
    else {
      const name = `(${Object.keys(value).length} items)`
      switch(propertyName) {
        case 'typeSpec':
          //no break
        case 'extensions':
        case 'devices':
          appendCell(row, name, 'pencil', '', () => {
            showModalForm(`${tableId}-${propertyName}`, value, true)
          })
          break
        default:
          // console.warn(`value of property ${propertyName} is Object`)
          appendCell(row, name, 'pencil', '', () => {
            showModalForm(`${tableId}-${propertyName}`, value)
          })
          break
        }
    }
  })
}

function showModalForm(id, tableData, simple) {
  let fillHandler = null
  let width = '100vw' // Full viewport width
  if (simple) {
    if (Array.isArray(tableData)) {
      fillHandler = fillArrayTable
      width = '30vw'
    }
    else {
      fillHandler = fillObjectTable
      width = '60vw'
    }
  }
  else {
    fillHandler = fillTable
  }

  // Create new modal elements
  const modal = document.createElement('div')
  modal.className = 'modal fade'
  modal.id = id
  modal.tabIndex = -1
  modal.role = 'dialog'
  modal.setAttribute('aria-labelledby', 'modalLabel')
  modal.setAttribute('aria-hidden', 'true')
  modal.style.position = 'fixed' // Ensure the modal is positioned over everything else
  modal.style.top = '0' // Align with the top of the viewport
  modal.style.left = '0' // Align with the left of the viewport
  modal.style.width = width
  modal.style.height = '100vh' // Full viewport height
  modal.style.display = 'flex' // Flex display to center the dialog
  modal.style.alignItems = 'center' // Center vertically
  modal.style.justifyContent = 'center' // Center horizontally
  //don't working modal.addEventListener('hidden.bs.modal', () => modal.remove())
  document.body.appendChild(modal)

  const modalDialog = document.createElement('div')
  modalDialog.className = 'modal-dialog modal-lg'
  modalDialog.role = 'document'
  modalDialog.style.maxWidth = '90%'
  modalDialog.style.width = '90%' // Ensure dialog width is also adjusted
  modalDialog.style.margin = '0' // Remove default margin
  modal.appendChild(modalDialog)

  const modalContent = document.createElement('div')
  modalContent.className = 'modal-content'
  modalContent.style.maxHeight = '100vh'
  modalContent.style.overflowY = 'auto'
  modalDialog.appendChild(modalContent)

  const modalHeader = document.createElement('div')
  modalHeader.className = 'modal-header'
  modalContent.appendChild(modalHeader)

  const modalTitle = document.createElement('h5')
  modalTitle.className = 'modal-title'
  modalTitle.id = id + '_label'
  modalTitle.textContent = id.replace(/-/g, '.')
  modalHeader.appendChild(modalTitle)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'close'
  closeButton.setAttribute('data-dismiss', 'modal')
  closeButton.setAttribute('aria-label', 'Close')
  closeButton.innerHTML = '<span aria-hidden="true">&times</span>'
  modalHeader.appendChild(closeButton)

  const modalBody = document.createElement('div')
  modalBody.className = 'modal-body'
  modalContent.appendChild(modalBody)

  const table_id = id + '_table'
  const table = createTable(table_id)
  modalBody.appendChild(table)
  fillHandler(table, tableData)

  // const modalFooter = document.createElement('div')
  // modalFooter.className = 'modal-footer'
  // modalContent.appendChild(modalFooter)

  // const cancelButton = document.createElement('button')
  // cancelButton.type = 'button'
  // cancelButton.className = 'btn btn-secondary'
  // cancelButton.setAttribute('data-dismiss', 'modal')
  // cancelButton.textContent = 'Cancel'
  // modalFooter.appendChild(cancelButton)

  // const saveButton = document.createElement('button')
  // saveButton.type = 'button'
  // saveButton.className = 'btn btn-primary'
  // saveButton.textContent = 'Save changes'
  // modalFooter.appendChild(saveButton)

  $('#' + id).modal('show')
  //! don't works, maybe since bootstrap 5 ?
  // const bootstrapModal = new bootstrap.Modal(modal)
  // bootstrapModal.show()

  $('#' + id).on('hidden.bs.modal', () => modal.remove())
}

function fillObjectTable(table, tableData) {
  const tableHead = table.getElementsByTagName('thead')[0]
  {
    const row = document.createElement('tr')
    const keyCell = document.createElement('td')
    keyCell.textContent = ''
    row.appendChild(keyCell)

    const valueCell = document.createElement('td')
    valueCell.textContent = ''
    row.appendChild(valueCell)

    tableHead.style.display = 'none'
    tableHead.appendChild(row)
  }

  const tableBody = table.getElementsByTagName('tbody')[0]
  for (const key in tableData) {
    const row = document.createElement('tr')
    const keyCell = document.createElement('td')
    keyCell.textContent = key
    row.appendChild(keyCell)

    const valueCell = document.createElement('td')
    valueCell.textContent = tableData[key]
    row.appendChild(valueCell)

    tableBody.appendChild(row)
  }
}

function fillArrayTable(table, tableData) {
  const tableHead = table.getElementsByTagName('thead')[0]
  {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.textContent = ''
    row.appendChild(cell)

    tableHead.style.display = 'none'
    tableHead.appendChild(row)
  }

  const tableBody = table.getElementsByTagName('tbody')[0]
  for (const item of tableData) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.textContent = item
    row.appendChild(cell)
    tableBody.appendChild(row)
  }
}

function setupFilterInputs(table) {
  const tfoot = table.querySelector('tfoot')
  const ths = tfoot.getElementsByTagName('th')
  Array.from(ths).forEach(function(th) {
    const title = th.textContent.trim()
    const title_id = title.replace(/\./g, '_')

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'filter-input-' + title_id
    input.className = 'form-control filter-input'
    input.placeholder = 'Filter ' + title
    input.style.width = '100%'
    
    th.innerHTML = ''
    th.appendChild(input)
  })

  const dataTable = $('#' + table.id).DataTable()

  dataTable.columns().every(function () {
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
