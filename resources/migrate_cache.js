const fs = require('fs')
const path = require('path')

const cacheDir = __dirname
const backupDir = path.join(__dirname, '../../../backup/node-red-contrib-tuya-devices/resources')

module.exports = {
  backupCache: () => {
    console.log('Backup cache:')
    fs.readdir(cacheDir, (err, files) => {
      if (err) return console.error(`Error on read dir ${cacheDir}: ${err}`)

      const htmlFiles = files
        .filter(file => path.extname(file) === '.html')
        .map(file => path.basename(file, '.html'))

        console.log(htmlFiles)
      for (const project of htmlFiles) {
        const src = path.join(__dirname, project)
        const dest = path.join(backupDir, project)
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true })
          console.log(`Copy ${src} to ${dest}`)
        }
      }
    })
  },
  restoreCache: () => {
    console.log('Restore cache:')
    if (fs.existsSync(backupDir)) {
      console.log(`Copy ${backupDir} to ${cacheDir}`)
      fs.cpSync(backupDir, cacheDir, { recursive: true })
      console.log(`Remove ${backupDir}`)
      fs.rmSync(backupDir, { recursive: true })
    }
  },
}