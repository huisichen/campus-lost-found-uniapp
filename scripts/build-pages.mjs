import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'docs')
const base = '/campus-lost-found-uniapp/'
const require = createRequire(import.meta.url)
const compiler = require.resolve('@dcloudio/vite-plugin-uni/bin/uni.js')
// The compiler cleans docs; retain previously published Android downloads.
const downloads = join(output, 'downloads')
const packages = existsSync(downloads) ? readdirSync(downloads).filter(name => /^[a-zA-Z0-9._-]+\.apk$/.test(name)).map(name => [name, readFileSync(join(downloads, name))]) : []

const result = spawnSync(process.execPath, [compiler, 'build', '--config', 'vite.config.js', '--base', base], {
  cwd: root,
  env: { ...process.env, UNI_INPUT_DIR: root, UNI_OUTPUT_DIR: output, UNI_PLATFORM: 'h5' },
  stdio: 'inherit'
})
if (packages.length) {
  mkdirSync(downloads, { recursive: true })
  for (const [name, bytes] of packages) writeFileSync(join(downloads, name), bytes)
}
if (result.status !== 0) process.exit(result.status || 1)

function rewriteStaticPaths(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      rewriteStaticPaths(file)
    } else if (/\.(?:js|css|html)$/.test(entry.name)) {
      const original = readFileSync(file, 'utf8')
      const updated = original.replaceAll('/static/', `${base}static/`)
      if (updated !== original) writeFileSync(file, updated)
    }
  }
}

rewriteStaticPaths(output)
copyFileSync(join(root, 'public', 'sw.js'), join(output, 'sw.js'))
writeFileSync(join(output, '.nojekyll'), '')
const html = readFileSync(join(output, 'index.html'), 'utf8')
if (!html.includes(`${base}assets/`) || !existsSync(join(output, 'static'))) {
  throw new Error('Pages build is missing its base path or static files')
}
console.log(`GitHub Pages output: ${output}`)
