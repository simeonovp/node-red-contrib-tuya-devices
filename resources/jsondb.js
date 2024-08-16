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

  // Create and append DataTables CSS
  const iconsLink = document.createElement('link')
  iconsLink.rel = 'stylesheet'
  iconsLink.type = 'text/css'
  iconsLink.href = './css/bootstrap-icons.css'
  document.head.appendChild(iconsLink)

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
    nav_tabs.appendChild(createTabNavigationElement(key, table_name, content_id, active))
    content_container.appendChild(createTabContentElement(table_name, content_id, active))
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
  tab_pane.appendChild(createTable(table_name))
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
  const tables_data = {}
  for (const [key, path] of Object.entries(tables)) {
    const table_data = await loadJSON(path) || {}
    const table_name = key.toLowerCase()
    tables_data[table_name] = table_data
  }
  for (const table_name in tables_data) {
    table_data = tables_data[table_name]
    if (!table_data) return console.error(`Fill table ${table_name} failed, data is ${table_data}`)
    const table = document.getElementById(table_name)
    fillTable(table, table_data)
  }
}

function fillTable(table, table_data) {
  const data = Array.isArray(table_data) ? table_data : Object.values(table_data)
  const initColumns = Array.isArray(table_data) ? [] : ['id']
  const columns = getColumnsFromTable(data, initColumns)
  addColumns(table, columns)
  const tableBody = table.getElementsByTagName('tbody')[0]
  addRows(tableBody, table_data, columns)
  // Add event listeners for filter inputs after tables are initialized
  setupFilterInputs(table)
}

function getColumnsFromTable(ar, columns) {
  columns = (ar && [...new Set(ar.reduce((acc, obj) => acc.concat(
    Array.isArray(obj) && obj.length ? Object.keys(obj[0]) : Object.keys(obj)),
    columns))] || []).filter(item => !item.startsWith('_custom_'))

  const descriptionIndex = columns.indexOf('description')
  if (descriptionIndex > -1) {
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

function addRows(tableBody, table_data, columns, id) {
  //const data = Array.isArray(table_data) ? table_data : Object.values(table_data)
  if (Array.isArray(table_data)) {
    table_data.forEach(item => {
      if (Array.isArray(item)) addRows(tableBody, item, columns, id)
      else addRow(tableBody, item, columns, id)
    })
  }
  else {
    for (const [id, item] of Object.entries(table_data)) {
      if (Array.isArray(item)) addRows(tableBody, item, columns, id)
        else addRow(tableBody, item, columns, id)
    }
  }
}

function appendCell(row, text, iconName, onClick) {
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
    button.id = iconName + 'Button'
    button.className = 'btn style="font-size: 10px;"'
    button.style.backgroundColor = 'transparent'
    button.style.border = 'none'
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

const translateActive = true //++
function addRow(tableBody, item, columns, id) {
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
      if (((propertyName === 'name') || (propertyName === 'description')
          && translateActive)) {
        // translate if propertyName is "name" or "description"
        const customPropName = '_custom_' + propertyName
        if (item.hasOwnProperty(customPropName)) return appendCell(row, item[customPropName], 'translate')
        appendCell(row, value)
      }
      else appendCell(row, value)
    }
    else if (Array.isArray(value)) {
      if (value.length) {
        appendCell(row, `(array [${value.length}])`, 'pencil', () => {
          showModalForm('dynamicModal', value, 'Model properties') // TODO generate unique id and title
        })
      }
      else appendCell(row, '')
    }
    else {
      console.warn(`value of property ${propertyName} is Object`)
      appendCell(row, '(object)')
    }
  })
}

function showModalForm(id, table_data, title) {
  // Create new modal elements
  const modal = document.createElement('div')
  modal.className = 'modal fade'
  modal.id = id
  modal.tabIndex = -1
  modal.role = 'dialog'
  modal.setAttribute('aria-labelledby', 'modalLabel')
  modal.setAttribute('aria-hidden', 'true')
  
  // Style adjustments for the modal
  modal.style.position = 'fixed' // Ensure the modal is positioned over everything else
  modal.style.top = '0' // Align with the top of the viewport
  modal.style.left = '0' // Align with the left of the viewport
  modal.style.width = '100vw' // Full viewport width
  modal.style.height = '100vh' // Full viewport height
  modal.style.display = 'flex' // Flex display to center the dialog
  modal.style.alignItems = 'center' // Center vertically
  modal.style.justifyContent = 'center' // Center horizontally
  
  const modalDialog = document.createElement('div')
  modalDialog.className = 'modal-dialog modal-lg'
  modalDialog.role = 'document'
  modalDialog.style.maxWidth = '90%'
  modalDialog.style.width = '90%' // Ensure dialog width is also adjusted
  modalDialog.style.margin = '0' // Remove default margin

  const modalContent = document.createElement('div')
  modalContent.className = 'modal-content'
  modalContent.style.maxHeight = '80vh'
  modalContent.style.overflowY = 'auto'

  const modalHeader = document.createElement('div')
  modalHeader.className = 'modal-header'
  const modalTitle = document.createElement('h5')
  modalTitle.className = 'modal-title'
  modalTitle.id = 'modalLabel'
  if (title) modalTitle.textContent = title
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'close'
  closeButton.setAttribute('data-dismiss', 'modal')
  closeButton.setAttribute('aria-label', 'Close')
  closeButton.innerHTML = '<span aria-hidden="true">&times</span>'
  modalHeader.appendChild(modalTitle)
  modalHeader.appendChild(closeButton)

  const modalBody = document.createElement('div')
  modalBody.className = 'modal-body'
  const table_id = id + '_table'
  const table = createTable(table_id)
  modalBody.appendChild(table)
  fillTable(table, table_data)

  const modalFooter = document.createElement('div')
  modalFooter.className = 'modal-footer'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'btn btn-secondary'
  cancelButton.setAttribute('data-dismiss', 'modal')
  cancelButton.textContent = 'Cancel'
  modalFooter.appendChild(cancelButton)

  // const saveButton = document.createElement('button')
  // saveButton.type = 'button'
  // saveButton.className = 'btn btn-primary'
  // saveButton.textContent = 'Save changes'
  // modalFooter.appendChild(saveButton)

  modalContent.appendChild(modalHeader)
  modalContent.appendChild(modalBody)
  modalContent.appendChild(modalFooter)

  modalDialog.appendChild(modalContent)
  modal.appendChild(modalDialog)

  document.body.appendChild(modal)

  $('#dynamicModal').modal('show')

  // Remove the modal after it is hidden
  $('#dynamicModal').on('hidden.bs.modal', () => modal.remove())
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
