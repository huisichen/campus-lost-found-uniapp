import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

process.env.UNI_INPUT_DIR ||= process.cwd()
const uni = uniModule.default || uniModule

export default defineConfig({ plugins: [uni()] })
