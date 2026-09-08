import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Plesk deploys application files without the repository metadata. Git hooks
// are useful in a local clone, but their absence must not break `npm install`
// on a production server.
if (!existsSync('.git')) {
    console.log('Skipping Git hooks setup: .git directory is not present')
    process.exit(0)
}

execFileSync('git', ['config', 'core.hooksPath', 'scripts/git-hooks'], {
    stdio: 'inherit',
})
