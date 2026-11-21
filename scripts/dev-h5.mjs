import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本项目把 pages/、manifest.json 放在仓库根目录（不是 uni-app 默认的 src/），
// 所以要用 UNI_INPUT_DIR 告诉编译器去哪里找源码。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const compiler = require.resolve('@dcloudio/vite-plugin-uni/bin/uni.js')
const port = process.env.PORT || '5173'

const child = spawn(process.execPath, [compiler, '--port', port], {
  cwd: root,
  env: { ...process.env, UNI_INPUT_DIR: root, UNI_PLATFORM: 'h5' },
  stdio: 'inherit'
})

child.on('exit', (code) => process.exit(code ?? 0))
