import fs from 'node:fs'

const cwd = process.cwd()

console.log('process.cwd():           ', cwd)
console.log('fs.realpathSync():       ', fs.realpathSync(cwd))
console.log('fs.realpathSync.native():', fs.realpathSync.native(cwd))
